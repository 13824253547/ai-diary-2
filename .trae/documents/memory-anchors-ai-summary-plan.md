# 记忆锚点与聊天日总结实施计划

## 摘要

复用项目当前服务端配置的聊天文本模型，为新保存/单篇更新的日记生成可追溯锚点，并按设备当地日期为新增宠物聊天生成每日锚点。两类锚点共用一个服务端读模型、主题列表、用户纠正和萌宠页真实锚点计数；原始日记与聊天消息保持不变，不回填上线前的历史数据，也不把锚点注入后续聊天上下文。

## 当前状态分析

- [素材/成长业务规格](../../docs/reference/business-spec/modules/growth-and-insights.md) 已定义四类主题及日记锚点卡片目标，但 Q-016 的提取触发、默认集合和更新规则尚未完全落定；本计划根据本轮确认补齐这些规则。
- [锚点页](../../app/profile/anchors.tsx) 已通过后端 repository 读取锚点并读写纠正，但只按显式主题查询；无主题时回落“珍视旧友”。列表初载不会读取已保存纠正，纠正面板打开时才查询。
- [日记提取服务](../../src/services/anchor-extraction-service.ts) 已有请求/版本/来源块校验和并发合并边界，但没有生产调用方。后端 [锚点读模型](../../backend/src/modules/anchors/anchor-read-model.service.ts#L157-L160) 在非测试环境无可信提取服务时失败关闭。
- [聊天 Provider](../../backend/src/modules/chat/ark-pet-chat-provider.ts) 使用服务端 `PET_CHAT_*` 配置、陪伴提示词和最近聊天历史；聊天表目前没有设备当地日期。总结任务不能调用现有 `reply()` 并沿用其聊天上下文，必须使用独立提示词和结构化结果。
- [萌宠页](../../app/(tabs)/pet.tsx) 当前只展示日记数，没有真实锚点数；[PET-002](../../docs/reference/delivery/tasks/PET-002.md) 的统计记录仍包含过时原型状态。
- GRW-003/GRW-004 任务和台账仍有“正式页面未接线”等旧描述，与当前页面源码不一致。实施时会修正文档状态；保留当前未提交的城市目录改动，只追加本功能进度。

## 已确认决策

- 日记：首次成功保存后异步总结；之后编辑只刷新该篇日记自己的当前锚点，不重新处理其他日记。每篇当前版本最多一条锚点，整篇有效 `text`/`quote` 正文作为依据，并保存全部来源段落 ID。无可总结正文时不生成锚点并记录原因。
- 聊天：按用户设备当地日期分组，只处理本功能启用后新增的完整问答。新一天首次完成聊天后异步处理之前尚未总结的聊天；若累积多个未处理日期，将其合成一条补记锚点。没有新增聊天就不调用模型。聊天原文不修改，锚点卡片日期使用摘要生成日。
- 摘要：复用同一服务端聊天模型配置，但采用独立任务提示词；日记与聊天各生成一句中文摘要，最多 60 字。聊天摘要从小橘视角总结完整对话；用户事实必须有对话依据。四主题采用已确认解释并归入最接近类别：旧友关系/共同回忆、成长希望/目标、旅行自然/探索、饮食/餐桌时刻。
- 展示：日记与聊天锚点进入相同四类主题。萌宠入口默认展示全部锚点并按时间排序，成长树入口仍按选中主题过滤。日记卡片打开来源日记；聊天卡片打开宠物聊天并定位到来源消息。普通单日和补记聊天卡片都显示生成日期。萌宠页锚点数统计当前可访问的成功锚点记录（每篇日记当前版本一条、每个成功聊天总结批次一条），不计失败/跳过任务、隐藏旧版本或纠正记录。
- 纠正：日记和聊天锚点均可纠正；纠正仅覆盖锚点展示，不修改原文、不影响未来聊天或后续提取。纠正上限正式定为 240 字；来源版本变化时不把旧纠正转给新锚点。
- 留存/身份：锚点和纠正随来源记录存续，始终按设备身份隔离，不跨设备同步。无来源权限的锚点不展示。历史日记/聊天不回填。
- 失败/并发：每个输入批次最多尝试 3 次（含首次），失败间隔 3 秒；单次模型调用沿用项目 240 秒上限。耗尽后后台保存终态失败，不加用户手动重试或失败 UI，也不重复处理同一失败输入。设备内模型任务串行，交互聊天优先排队；不并发调用模型。
- 验收授权：最多一次合成日记文本真实模型请求和一次合成聊天文本真实模型请求；不发送真实用户日记/聊天。已授权开发库增量迁移，但不清库/重置；数据库 E2E 始终走 `E2E_DATABASE_URL` 隔离流程。

## 拟议变更

### 业务规格与契约

- `docs/reference/business-spec/modules/growth-and-insights.md`：补充日记锚点增量提取、单篇版本刷新、主题定义、全量默认集合和纠正规则。
- `docs/reference/business-spec/modules/companion.md`：补充聊天按本地日期生成宠物视角锚点、跨日补记、来源跳转和真实锚点计数。
- `docs/reference/business-spec/open-questions.md`：关闭本次已确认的 GRW/PET 锚点触发、分类、摘要、纠正和留存子项；保留未确认的全局 AI 质量评测等问题，不扩大关闭范围。
- `docs/reference/delivery/contracts/anchor-extraction-v1.md`、`anchor-read-model-v1.md`、`anchor-correction-v1.md`：扩展全篇来源段落、聊天日期/消息来源、来源类型、纠正绑定与统一读取规则；聊天结果与日记结果保持不同写入来源。
- `docs/reference/delivery/tasks/GRW-003.md`、`GRW-004.md`、`PET-002.md` 和对应 CASE：更新范围、A/C 条件及过时接线状态，增加日记/聊天两种来源的集成和失败验收。

### 服务端与数据库

- `backend/prisma/schema.prisma`：为新聊天 turn 保存客户端提交且格式校验过的设备当地日期；新增每日聊天总结任务/锚点及其来源消息关联、幂等键、尝试状态和生成日期；新增聊天锚点纠正存储。历史 turn 缺少当地日期时不补写、不参与回填。
- `backend/prisma/migrations/<新时间戳>_daily_chat_anchors/migration.sql`：仅增加字段/表/索引，不删除或重写现有锚点、聊天消息、纠正或用户记录。
- `backend/src/modules/anchors/ark-memory-anchor-provider.ts`（新增）：复用现有服务端模型配置，提供独立非流式摘要任务、JSON 结构校验、主题白名单、60 字限制及来源 ID 校验；不读 `.env` 输出、不记录正文、不回退 mock 成功。
- `backend/src/modules/anchors/chat-daily-anchor.service.ts`（新增）：筛选完整且合格的新增问答；在新一天首个聊天完成后收集未处理日期，多个日期合并一批；幂等保存 source message IDs、状态、尝试次数和生成日；失败不影响聊天回复。
- `backend/src/modules/anchors/anchor-read-model.service.ts`、`anchor-read-model.controller.ts`、`anchor-corrections.service.ts`、`anchor-corrections.controller.ts`：保留日记专属写入边界，统一读取日记/聊天锚点并按主题、生成日期稳定分页；返回列表时叠加已保存纠正，避免页面逐卡额外请求；纠正按统一锚点 ID 与来源版本安全读写，现有日记接口保持兼容。
- `backend/src/modules/anchors/anchor-corrections.module.ts`：注册新增 provider、每日聊天服务与读写依赖。
- `backend/src/modules/diaries/diaries.controller.ts`：日记保存事务成功后提交版本化后台提取任务，保存响应不等待模型；同一日记重放由服务幂等去重。
- `backend/src/modules/chat/chat-sessions.controller.ts`、`backend/src/modules/chat/chat-sessions.service.ts`：记录新 turn 的本地日期；仅在完整回复持久化后触发前一日批次。接入设备级任务协调，未开始的总结让位于交互聊天；已开始的模型任务串行完成后再处理下一个。

### 客户端、页面与测试

- `src/contracts/anchor-read-model-contract.ts`、`anchor-correction-contract.ts`：增加来源区分、聊天来源引用、可选主题过滤和读模型纠正字段校验。
- `src/repositories/anchor-read-model-repository.ts`、`http-anchor-read-model-repository.ts`、`anchor-correction-repository.ts`、`http-anchor-correction-repository.ts`、`src/store/adapters/backend-anchor-read-model-adapter.ts`、`backend-anchor-correction-adapter.ts`：承载统一分页读取、统计总数和两种来源的版本化纠正。
- `src/repositories/http-pet-chat-repository.ts`、`src/store/create-app-store.ts`：在创建新 turn 时附设备当地日期，不修改已保存聊天正文；保留聊天 SSE、时序、身份头和现有请求状态。
- `app/profile/anchors.tsx`：默认请求全部锚点；主题入口按主题过滤；显示来源类型；日记卡片跳原日记，聊天卡片跳聊天并定位来源消息；初始列表直接显示已保存纠正。保持现有卡片视觉参数，不加人工重试/失败 UI。
- `app/(tabs)/pet.tsx`：按统一读模型读取真实锚点数，沿用已表达的日记/锚点统计意图，不扩展日记数的 Q-005 口径。
- 定向测试覆盖提取触发和幂等、仅新数据、不回填、全篇多来源、主题选择、无正文、日记单篇更新、完整聊天日切分与补记合并、无新增不调用、三次失败终态、同设备串行、身份隔离、纠正显示/版本隔离、分页计数和来源跳转。
- 为真实 Provider 各执行至多一次合成输入验收；真实模型输出不作为大规模质量通过证据。设备界面仅用现有 iPhone 17 模拟器验证锚点列表、计数、来源跳转与纠正回显。

### 进度与验收记录

- `docs/reference/delivery/reports/development-progress.md`：追加新 DEV 记录，区分实现、自动化测试、真实模型验证和模拟器验收；不覆盖当前城市目录记录或已有 CASE 证据。
- `docs/reference/delivery/test-cases/GRW-003.md`、`GRW-004.md`、`PET-002.md`：只在实际取得隔离数据库、模型/设备证据后更新对应 CASE；mock/unit 不记为真实 Provider 通过。

## 验收步骤

1. 先核对 `git status`、目标文件差异及当前 migration 状态；保留已有城市目录用户改动。确认服务端模型配置只在服务进程读取，不读取或输出 `.env`。
2. 运行客户端锚点/聊天/日记保存定向 Jest、服务端 anchors/chat/diaries 定向 Jest、root typecheck 和 backend build。
3. 使用项目 E2E 隔离入口与 `E2E_DATABASE_URL` 执行 additive migration、源版本/设备隔离/分页/纠正/补记批次的 MySQL E2E；按已授权范围将同一 additive migration 部署到本地开发库，不重置或清理开发数据。
4. 用合成日记和合成宠物对话各进行最多一次真实模型验证，核对结构、60 字和来源引用；不将其描述成完整质量评测。
5. 在 iPhone 17 模拟器中验证：新日记新增/单篇编辑只更新自身、历史不回填、聊天按日补记、无新聊天不触发、同页分类/默认集合、两种来源跳转、已保存纠正及真实计数。
6. 完成后更新 GRW/PET 业务规格、契约、task、CASE 与 DEV 台账；未运行或未通过的真实质量、长期恢复和未授权边界如实保留。

## 不在本轮范围

- 不批量总结上线前已有日记或聊天，不修改或删除原始文本，不把锚点注入聊天上下文。
- 不实现跨设备同步、独立于来源的留存、历史版本浏览、自动花朵/成长算法或聊天摘要人工重试。
- 不清库、重置 E2E 保护、不输出任何 Key/JWT/用户正文，不把测试替身或单次真实模型样例宣称为全面质量验收。
