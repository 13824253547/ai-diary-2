# AI 质量评测基线 v1

版本：`ai-quality-evaluation-v1`

适用范围：第一阶段已进入真实业务链路、但 `Q-002` 仍未最终关闭的 AI 能力。当前先覆盖 `CRE-005` 日记生成；`DIA-002`、`MAT-005`、`PET-001`、`GRW-006` 后续沿用同一结构。

## 目的

- 让 `CASE-BAS-001-004` 和 `CASE-CRE-005-010` 在真实供应商接入前就具备可执行的评测底座。
- 自动校验结构、照片归属、人物引用和任务输出完整性。
- 为人工评测提供固定样本、统一维度和留档格式。
- 明确这是一阶段工程基线，不替代 `Q-002` 的正式产品阈值。

## 当前结论

- 自动校验必须全部通过，否则不能把结果判为“可编辑成功”。
- 人工评测暂不设产品级硬阈值，只记录统一维度；若某维度连续出现 `0`，说明 provider 还不适合进入真实联调。
- 不允许用固定 mock 正文逐字断言质量，也不允许拿生成耗时秒数冒充质量结论。

## CRE-005 固定样本

当前仓库使用三组固定夹具，定义见：

- `backend/src/common/diary-generation-evaluation.ts`

夹具目标：

| fixtureId | 场景 | 目的 |
| --- | --- | --- |
| `travel-green-people` | 台南双人出行 | 验证有人物候选、人物照片归属和正文结构 |
| `travel-blue-landscape` | 圣托里尼风景组 | 验证纯风景场景下的标题、摘要、正文与图片块 |
| `travel-brown-city` | 城市夜行与街景 | 验证另一种排版师文风与城市题材组织 |

## 自动校验项

`CRE-005` 当前自动校验这些硬约束：

- 标题非空
- 摘要非空
- 地点与日期存在
- `coverPhotoId` 来自输入照片集合
- `posterPhotoIds` 全部来自输入照片集合，且最多两张
- 至少包含一个正文块
- 所有图片引用都来自输入照片集合
- 需要图片块的夹具必须产出至少一个图片块
- 人物候选的 `photoIds` 与 `avatarPhotoId` 都必须来自输入集合

这些校验由以下代码执行：

- `backend/src/common/diary-generation-evaluation.ts`
- `backend/src/common/diary-generation-evaluation.spec.ts`

## 人工评测维度

人工评测统一使用 4 个维度，暂按 `2 / 1 / 0` 记录：

| 维度 | 说明 |
| --- | --- |
| 照片贴合度 | 标题、摘要、正文和图片说明是否明显来自输入照片，而不是泛化空话 |
| 叙事连贯性 | 标题、摘要、正文块是否前后连贯，没有明显跳段、重复或自相矛盾 |
| 排版师文风区分度 | 不同 `characterId` 是否带来可感知语气差异，同时保持自然中文表达 |
| 可编辑性 | 结果是否适合进入编辑页继续修改，而不是一次性长文堆叠 |

评分说明：

- `2 = 满足当前工程基线`
- `1 = 可用但明显需要人工润色`
- `0 = 明显不合格，暂不建议作为真实 provider 输出`

这里的 `2 / 1 / 0` 只用于当前仓库执行记录，不等同于最终产品通过阈值。

## 执行方式

运行下面命令会调用当前 `DiaryGenerationService`，对固定夹具逐条生成结果，并产出 Markdown + JSON 报告：

```bash
npm --prefix backend run eval:diary-generation
```

默认会使用当前环境的 `AI_PROVIDER`：

- 未设置时：`deterministic`
- 显式设置：`openai-compatible`

输出文件：

- `docs/reference/delivery/reports/cre-005-quality-baseline.md`
- `docs/reference/delivery/reports/cre-005-quality-baseline.json`

## 与 Q-002 的边界

当前仍未确认：

- 正式产品级质量阈值
- 超时秒数与取消策略
- 自动重试次数与覆盖策略
- 费用、次数和 provider 选择

因此本基线只负责：

- 让结构校验可运行
- 让固定样本可复现
- 让人工评测维度有统一模板

它不会宣称 `Q-002` 已关闭，也不会把当前确定性 provider 的输出当作真实 AI 质量通过。
