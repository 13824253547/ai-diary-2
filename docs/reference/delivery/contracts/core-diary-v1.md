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
| `editRevision` | `number` | 本地草稿快照修订号；每次有效状态修改递增，用于区分保存命令并在重启后稳定重试 |

`POST /drafts` 校验可选 ID 为非空字符串、日记类型/角色/隐私为已定义值、照片 ID 为字符串数组、版本为从 1 开始的正安全整数。照片数组在此边界允许为空，不额外规定数量或去重语义。缺少/空白设备身份优先返回 `device_identity_required`；畸形请求返回 `invalid_input`，不得写入草稿。

### 3.3 GenerationJob

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `jobId` | `string` | 任务 ID |
| `draftId` | `string` | 归属草稿 |
| `draftVersion` | `number` | 提交时的草稿版本，正安全整数，从 1 开始 |
| `idempotencyKey` | `string` | 幂等键 |
| `status` | `queued \| running \| succeeded \| failed \| cancelled` | 任务状态 |
| `stage` | `queued \| analyzing-photos \| drafting \| structuring \| completed \| failed \| cancelled` | 可观测阶段 |
| `progressPercent` | `number?` | 可选百分比；没有真实值时不返回 |
| `progressMilestones` | `GenerationProgressMilestone[]?` | 可选、按实际处理顺序记录的有限里程碑历史；旧服务响应可省略 |

当前全文生成里程碑为：任务入队 `0%`、照片读取与校验完成 `15%`、Provider 请求提交 `25%`、完整 Provider 响应收到 `80%`、结果解析及结构校验通过 `95%`、结果持久化成功 `100%`。百分比表示已完成的业务节点权重，不代表耗时比例；Provider 等待期间没有真实流式进度时，后端保持在当前节点。失败或取消不得标记为 `100%`。加载页的三个清单步骤仅概括照片检查、模型创作、结果整理三个可读环节，不能代替后端百分比；每个可见关键步骤至少展示 3 秒，成功后可等展示完成再导航。进度条在等待下一后端里程碑期间可用 `0.6` 个百分点/秒作限幅视觉缓动，最多显示到下一里程碑前 `1` 个百分点（如 `25%` 后等待时最多到 `79%`）；新里程碑到达后再以其为目标继续。该视觉缓动不写入任务快照，也不代表后端已完成相应百分比。

`POST /generation/jobs` requires non-empty `draftId` and `idempotencyKey`, and `draftVersion` must be a positive safe integer. The server validates device identity before inspecting the request body; malformed input returns `invalid_input` without creating or reading a generation task.

The client accepts a successful create response only when its `draftId`, `draftVersion`, and `idempotencyKey` match the submitted request. Poll/cancel responses must carry the exact requested `jobId`. The Store repeats the draft/version/idempotency association check and, while polling, also checks the active `jobId` before applying any snapshot.

`POST /generation/rewrite` requires non-empty draft/block/character IDs, a positive safe-integer `draftVersion`, `blockType` of `text` or `quote`, non-blank source content, and string arrays for `selectedPhotoIds` and optional `photoIds`. The server validates device identity before the body and returns `invalid_input` for malformed requests without invoking the rewrite service.

A successful rewrite response must echo the requested `draftId`, `blockId`, positive safe-integer `draftVersion`, and `blockType`. The repository and Store reject a response bound to another target/version; the Store also discards a candidate if the source text, character, generation round, selected photo set, or target block photo references changed while the request was pending. Internal deduplication/request IDs are not part of the HTTP payload.

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
  "savedVersion": 4,
  "date": "2026.10.23"
}
```

`date` is the saved diary's publication date, set on its first successful save and preserved when editing. `GET /diaries/:id` and `GET /memories` return that same date; photo capture dates remain generation facts and do not determine diary display, sorting, or calendar filtering.

### 3.5 Saved diary content snapshot

`POST /diaries/save` includes a required `contentSnapshot` alongside the save metadata. It preserves the detail fields needed after a process restart: `type`, `subtitle`, `helperMessage`, `characterId`, `companionName`, `coverPhotoId`, `blocks`, and optional `posterPhotoIds` / `people`.

Each block is a text, quote, or photo block. A saved snapshot must contain at least one text or quote block; block IDs and person IDs must be unique within that snapshot, and photo-block references must point to a text or quote block. Person ID uniqueness protects the current ID-based candidate lookup and list rendering; this does not define name uniqueness or cross-diary identity. Text/quote/photo references, cover, poster, and person photo references must point to the request's `photoIds`. A non-private visibility update may select only persisted text or quote block IDs. Missing or malformed snapshots and out-of-scope references return `invalid_input`; they must not create or update a diary. Client-side diary reads apply the same non-empty body and photo-ownership checks and reject malformed snapshots instead of treating them as complete diary content. If a persisted JSON scalar/array is corrupt, the API omits that body and returns `contentSnapshotStatus: "invalid"` so the client can retain metadata, report the damaged record, and isolate its body without hiding other memories.

`POST /sharing/project` requires a valid device identity before body inspection. Its body must be an object with a non-empty `diaryId`, one supported privacy value, and an optional array of non-empty block IDs; malformed requests return `invalid_input` before database access. Non-private visibility still requires at least one persisted text/quote block ID.

`GET /diaries/:id` returns the persisted `contentSnapshot`; its response ID must match the requested path ID or the client rejects the response. `GET /memories` returns each persisted snapshot. Older metadata-only records are not expanded into synthetic body blocks; they require a content migration/backfill before full detail reading.

Generation result `people`, when present, must also contain unique non-empty person IDs. The provider rejects duplicate IDs as a non-retryable `provider_failed`; the client contract and save boundary reject duplicate IDs rather than choosing one candidate implicitly.

Saved diary photo bytes are scoped by `(ownerDeviceId, diaryId, photoId)`. Clients must read the copy for the diary being displayed; a shared `photoId` or repeated `sourceAssetId` must not select an arbitrary copy from another diary. Legacy source IDs may be backfilled only when the source asset mapping is unambiguous; ambiguous records remain unresolved until reliable provenance is available.

### 3.6 MemoriesQuery

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `month` | `string?` | `YYYY-MM` |
| `day` | `string?` | `YYYY-MM-DD` |
| `keyword` | `string?` | 仅搜标题/摘要/地点 |
| `page` | `number` | 页码，从 1 开始 |
| `pageSize` | `10 \| 20 \| 50 \| 100` | 每页数量；完整回忆集合由客户端按页续取，不能因首屏页容量截断月份、搜索和回忆数据 |

`month`, when present, must be a real `YYYY-MM` month; `day`, when present, must be a real Gregorian `YYYY-MM-DD` date. Invalid formats, months, and calendar days return `invalid_input` instead of being reported as an empty result. This validation does not define timezone, cross-day/month attribution, or recent-group behavior; those remain subject to Q-004.

The `date` on every saved diary result is its first-save publication date. Memory month/day filtering and ordering use that same date; photo capture dates are only optional evidence for a naturally needed body reference.

HTTP `page` and `pageSize` query values use decimal integer strings; `page` must be positive and `pageSize` must be one of 10, 20, 50, or 100. Repeated/non-string query parameters and exponent, hexadecimal, or fractional encodings return `invalid_input` before diary data is read. The device identity check runs before query validation.

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
- 生成任务幂等键按设备作用域绑定原始 `draftId + draftVersion`；同键并发/重放且请求一致时返回同一任务，不同草稿或版本复用该键时返回不可重试 `version_conflict`。
- Save key is stable for one persisted draft revision and includes the source diary/version, generation round, and local `editRevision`; an unchanged retry reuses the key, while a changed payload receives a different key.
- 保存命令按设备作用域绑定 `draftId + sourceDiaryId + sourceDiaryVersion`；同键重放保持这些命令身份字段，否则返回不可重试 `version_conflict`。相同命令身份的重放返回首次保存结果且不重复写入；客户端修改 payload 时必须生成新 key。

### 6.2 Edits during save

- A save submits an immutable snapshot of the draft revision captured at request start.
- If the user changes the draft while that request is pending and the submitted snapshot succeeds, the saved snapshot is committed, while the newer local draft remains unsaved and is rebased onto the returned diary ID/version.
- The newer draft must not be marked saved or navigated away as if its latest edits were included. A subsequent save uses the rebased source version and a new idempotency key.

### 6.3 取消与过期

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
