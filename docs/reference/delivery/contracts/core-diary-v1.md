# Core Diary Contract v1

版本：`core-diary-v1`  
范围：第一阶段主链路 `照片 -> 生成 -> 编辑 -> 保存 -> 回忆`

## 1. 适用范围

本契约只覆盖以下能力：

- 相册权限读取结果
- 照片资产列表与选择
- 创作草稿
- 日记生成任务
- 局部重写任务
- 草稿保存
- 回忆检索

以下内容仍保持待决策，不在本版本硬编码为最终规则：

- `Q-003` 输入长度/照片上限
- `Q-004` 跨日/月/年归档口径
- `Q-007` 公开与发现关系
- `Q-010` 跨作品人物记忆
- `Q-013` 公开撤回与匿名细则

## 2. 推荐默认值

这些值用于第一阶段实现与测试，不代表最终产品确认：

- `Q-001`：已保存日记后端持久化；未提交草稿先支持本地恢复，不做跨设备草稿合并。
- `Q-002`：AI 能力统一走异步任务；如果服务端没有真实百分比，只返回阶段事件。
- `Q-008`：新建草稿整篇换图会使旧结果失效；已保存作品的局部换图默认不覆盖人工文本。
- `Q-012`：V1 使用设备安装级匿名身份，不增加登录 UI。
- `Q-018`：相册支持 `full / limited / denied / revoked`，实际读取范围遵循系统授权。

## 3. 核心对象

### 3.1 PhotoAsset

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 稳定资产 ID |
| `uri` | `string` | 原图可读地址 |
| `previewUri` | `string` | 缩略图地址 |
| `width` | `number` | 原图宽 |
| `height` | `number` | 原图高 |
| `createdAt` | `string?` | 拍摄时间，允许缺失 |
| `location` | `string?` | 地点，允许缺失 |
| `personIds` | `string[]?` | 识别到的人物 ID |

有效样例：

```json
{
  "id": "photo-1",
  "uri": "ph://photo-1",
  "previewUri": "ph://photo-1-preview",
  "width": 1080,
  "height": 1440
}
```

无效样例：

```json
{
  "id": "",
  "uri": "ph://photo-1",
  "previewUri": "ph://photo-1-preview",
  "width": 1080,
  "height": 1440
}
```

### 3.2 Draft

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 草稿 ID |
| `sourceDiaryId` | `string?` | 编辑已有日记时存在 |
| `type` | `travel \| work \| emotion` | 当前仅 `travel` 真正可用 |
| `characterId` | `string` | 排版师 ID |
| `selectedPhotoIds` | `string[]` | 当前选中照片 |
| `privacy` | `private \| anonymous \| public-likes \| public-comments` | 当前草稿隐私 |
| `version` | `number` | 草稿版本号 |

### 3.3 GenerationJob

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `jobId` | `string` | 任务 ID |
| `draftId` | `string` | 归属草稿 |
| `draftVersion` | `number` | 提交时的草稿版本 |
| `idempotencyKey` | `string` | 幂等键 |
| `status` | `queued \| running \| succeeded \| failed \| cancelled` | 任务状态 |
| `stage` | `queued \| analyzing-photos \| drafting \| structuring \| completed \| failed \| cancelled` | 可观测阶段 |
| `progressPercent` | `number?` | 可选百分比；没有真实值时不返回 |

### 3.4 SaveDraftCommand / SaveDraftResult

保存命令：

```json
{
  "draftId": "draft-1",
  "draftVersion": 3,
  "idempotencyKey": "draft-1-v3"
}
```

保存成功结果：

```json
{
  "diaryId": "diary-1",
  "draftId": "draft-1",
  "savedVersion": 4
}
```

### 3.5 Saved diary content snapshot

`POST /diaries/save` includes a required `contentSnapshot` alongside the save metadata. It preserves the detail fields needed after a process restart: `type`, `subtitle`, `helperMessage`, `characterId`, `companionName`, `coverPhotoId`, `blocks`, and optional `posterPhotoIds` / `people`.

Each block is a text, quote, or photo block. Block IDs must be unique; text/quote/photo references, cover, poster, and person photo references must point to the request's `photoIds`. A non-private visibility update may select only persisted text or quote block IDs. Missing or malformed snapshots and out-of-scope references return `invalid_input`; they must not create or update a diary.

`GET /diaries/:id` and `GET /memories` return the persisted `contentSnapshot`. Older metadata-only records are not expanded into synthetic body blocks; they require a content migration/backfill before full detail reading.

### 3.6 MemoriesQuery

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `month` | `string?` | `YYYY-MM` |
| `day` | `string?` | `YYYY-MM-DD` |
| `keyword` | `string?` | 仅搜标题/摘要/地点 |
| `page` | `number` | 页码，从 1 开始 |
| `pageSize` | `number` | 每页数量 |

## 4. 通用远程结果

统一返回：

```json
{
  "ok": true,
  "version": "core-diary-v1",
  "data": {}
}
```

或：

```json
{
  "ok": false,
  "version": "core-diary-v1",
  "error": {
    "code": "timeout",
    "message": "generation request timed out",
    "retryable": true
  }
}
```

## 5. 错误码

| code | 说明 |
| --- | --- |
| `permission_denied` | 无权限访问资源 |
| `device_identity_required` | 缺少有效的 `x-device-id` 请求头 |
| `timeout` | 请求超时 |
| `cancelled` | 请求被主动取消 |
| `not_found` | 目标不存在 |
| `invalid_input` | 输入无效 |
| `version_conflict` | 版本冲突 |
| `asset_unreadable` | 照片资源不可读 |
| `provider_failed` | 外部 AI/供应商失败 |

## 6. 行为语义

### 6.1 幂等

- 生成与保存都必须带 `idempotencyKey`。
- 同一 `draftId + draftVersion + idempotencyKey` 的重复提交，不应产生重复副作用。

### 6.2 取消与过期

- 草稿版本变化后，旧版本的生成/重写回调只能记录历史，不能写入当前草稿。
- 客户端取消后，迟到成功结果不能把页面状态改回成功。

### 6.3 空结果

- 回忆检索空结果与失败必须区分。
- 照片列表为空时返回真实空列表，不得回退示例图片。

## 7. 测试映射

- `CASE-BAS-001-002`：对象与有效/无效样例
- `CASE-BAS-001-003`：成功/失败/取消/幂等/过期语义
- `CASE-BAS-001-004`：AI 任务结构与阶段语义

## 8. 代码对齐

- 类型定义：[`src/contracts/core-diary-contract.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/contracts/core-diary-contract.ts)
- 契约测试：[`src/contracts/__tests__/core-diary-contract.spec.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/contracts/__tests__/core-diary-contract.spec.ts)
