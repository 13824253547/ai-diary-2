# 记忆花朵与专属洞察报告实施计划

## 摘要

补完「记忆花朵」和「小橘的专属洞察报告」的真实业务闭环。后端复用宠物聊天使用的 `PET_CHAT_*` 模型端点、模型名和凭据，但为花朵识别与报告总结使用独立的服务端提示词、结构化输入/输出和持久化任务，不复用聊天回复历史、SSE、陪伴提示词或聊天内容。

花朵使用设计稿已有的三种固定主题，由模型依据可访问日记中的正文/引用识别并生成简短说明；每类花最多授予一次，获得后不因来源日记编辑/删除而撤回。三类花全部获得后解锁报告。报告保留现有「内在的小矛盾 / 真正珍视的东西 / 正在形成的特质」三个维度；在用户进入已解锁报告页时按需生成，来源变化后标记过期并在下次进入时更新，更新期间保留上次成功报告。

## 当前状态分析

- 花朵页 [app/profile/flowers.tsx](../../app/profile/flowers.tsx) 目前只有固定「真实成长事件和解锁规则尚未接入」占位，没有渲染现有 `GrowthArtwork(kind="flowers")`、真实花朵识别、成长事件、模型任务或解锁进度。
- 成长树 [app/profile/insights.tsx](../../app/profile/insights.tsx) 的日记统计使用本地 `getDiaryStatistics`，花朵入口没有读取后端解锁状态；`GrowthArtwork` 的第三花状态依赖本地布尔值。
- 报告页 [app/profile/report.tsx](../../app/profile/report.tsx) 当前失败关闭显示「真实洞察服务暂未接入」。Store 中虽已有报告结构校验、取消和来源版本保护，但正式 Store 默认 `InsightReportProvider` 未配置，且生成来源只含本地日记标题/摘要；没有服务端报告/花朵读写 API 或持久化。
- 后端日记持久模型在 `backend/prisma/schema.prisma`。`Diary.contentSnapshot` 保存正文/引用块；`Diary.createdAt` 是 UTC 发布时间，编辑沿用首次发布时间。保存入口在 `backend/src/modules/diaries/diaries.controller.ts`，当前日记锚点在照片副本准备后异步入队。
- 宠物聊天的真实文本模型由 `backend/src/modules/chat/ark-pet-chat-provider.ts` 从服务端 `PET_CHAT_*` 环境配置调用；锚点摘要 Provider `backend/src/modules/anchors/ark-memory-anchor-provider.ts` 已提供相同配置、独立提示词、240 秒超时、JSON 校验与 fail-closed 范例。`DeviceAiTaskCoordinator` 已按设备串行化模型任务，等待队列中交互聊天优先于后台任务。
- 洞察报告已有客户端 contract `src/contracts/insight-report-contract.ts`、Provider 接口 `src/services/insight-report-provider.ts` 及 Store 测试；契约版本 `insight-report-v1` 目前仅作为本地边界，尚未正式页面接线。
- Q-005/Q-006 原先开放成长里程碑、花朵获取和报告更新规则。本计划只为本功能确认的指标定义局部口径，不更改其他个人/萌宠统计的全局 Q-005 语义。
- 当前工作区有独立的全球城市目录工作和未提交改动，包括一条未提交的 `20261026150000_diary_discovery_publication` migration。实施须保留这些文件，新增 migration 选取不冲突的唯一时间戳。

## 已确认决策

### 花朵与解锁

- 使用设计稿中已有三类固定花朵，不由模型发明新名称或类别：
  - `pathfinder`：人生旷野的寻路者
  - `self-awareness`：觉察自我的思考者
  - `healing`：压力迷茫的疗愈者
- 模型阅读有效日记证据，识别有充分文本依据的一个或多个固定类别，并为每类返回一句简短说明和引用的来源日记 ID。输出必须以来源为依据，不诊断、不推断临床状态、不把模型结论表述为对用户的定义。
- 首次打开花朵页自动启动一次全量识别，覆盖当时当前设备全部可访问、已保存日记的有效 `text` / `quote` 正文；不发送照片、EXIF、普通聊天、锚点纠正或其他用户资料。没有有效正文时不调用模型。
- 初次识别完成后，每篇新保存或编辑后的日记仅增量识别该篇当前版本；同一设备、日记、版本及来源快照的请求幂等。编辑/删除不撤销已经获得的花朵；后续新证据不能重复授予同类花朵或静默改写已授予记录。
- 每类最多获得一朵；三类均获得后解锁洞察报告。客户端传入的参数、`scenario=unlocked` 或本地 Zustand 标记均不能构成服务端授权。
- 花朵说明最多 60 个 Unicode 字符，保持卡片可读；花朵主题名称沿用已有设计稿资产。

### 里程碑

- 首次旅行：由同一次日记识别任务判断是否有文本证据支持旅行经历，并必须返回有效来源日记 ID。
- 连续记录 30 天：按设备日历日计算，每日有至少一篇已保存日记即算该日有记录；同一天多篇只计一天，编辑不增加天数。只计算最新的连续记录段，不取历史最长段；日期中断后，后续记录从第 1 天重新累计，当前进度不足 30 天时里程碑不算达成。该里程碑只展示实际进度，不发放花朵、不解锁报告。
- 100 个锚点：使用当前设备 `GET /anchors/summary` 的有效日记/聊天锚点总数；失败时显示不可用状态，不用固定数值。该里程碑只展示实际进度，不发放花朵、不解锁报告。
- 对新日记，Store 在首次保存请求中附带设备当地 `YYYY-MM-DD` 并由后端持久化；编辑保留首次保存日。旧日记优先使用已有持久发布日期，缺失/无效时使用该记录的数据库入库时间作为日期依据；两者都不可用时该记录不参与连续天数。绝不用当前时钟伪造历史记录日期。该字段仅用于成长里程碑，不改变日记展示发布时间。

### 洞察报告

- 三个固定维度继续为 `inner-contrast`、`cherished-connections`、`personality-traits`，不得输出诊断、治疗建议或无来源支持的个人事实；保留「这不是定义，只是一面镜子」的辅助回看定位。
- 仅在三类花朵全部获得后允许生成。用户进入报告页时由客户端调用幂等的服务端 `ensure-current`；首次生成或当前日记来源快照过期时生成，否则直接读回现有报告。
- 报告来源为生成时当前设备全部可访问日记的有效正文/引用块，不包含普通聊天、锚点纠正、照片、EXIF 或跨设备资料。输出带来源日记 ID/版本和总来源数量，不能由客户端自报来源。
- 新报告生成期间保留上次成功报告并标记正在更新；新来源版本成功后替换当前报告。失败保留旧成功版本并提供手动重试。日记来源编辑/删除令当前报告过期，但不撤销已获得花朵；下一次打开报告页才触发更新。

### 身份、模型、失败与授权

- 花朵、分析任务、报告和来源索引均服务端持久保存并严格按设备身份隔离；不跨设备同步。新增 Prisma migration 只增加字段/表/索引，不清库或重置数据库。
- 后端从 `PET_CHAT_*` 读取现有模型配置；全量历史和报告来源只从服务端数据库取，不接受客户端上传历史正文或任意来源 ID。请求只在任务执行期间驻留内存；日志不含日记正文、模型完整回复、密钥或身份凭据。
- 模型任务使用独立、抗提示注入的 System Prompt 和严格 JSON schema，不读聊天历史、不走聊天 SSE、不写入普通聊天上下文。调用使用既有 240 秒上限及 `DeviceAiTaskCoordinator`，设备内串行且聊天交互优先。
- 每个自动模型批次仅尝试一次，不自动重试、不回退 mock。失败写入固定错误状态；花朵页和报告页分别提供用户显式重试，重试创建同来源的新请求。失败、无来源、未解锁均不能返回伪造成功结果。
- 验收最多执行两次真实 Provider 请求：一次合成日记花朵识别、一次合成报告生成；不发送真实日记/聊天、不写入业务记录。开发库允许在隔离迁移检查成功后应用本次 additive migration；绝不清库。E2E 只使用隔离 `E2E_DATABASE_URL`，结束后清理本轮确切创建的隔离 schema。

## 拟议变更

### 后端存储、业务服务与 API

- `backend/prisma/schema.prisma`
  - `Diary` 增加可空 `publishedLocalDate`，只在首次成功保存时设置，编辑不覆盖；历史行保持 null，由服务依上述 fallback 规则读取。
  - 增加设备归属的 `GrowthFlower`：固定 flower key、摘要、有效来源日记 ID/版本、来源 hash 和授予时间；`(ownerDeviceId, flowerKey)` 唯一，保证最多授予一次。
  - 增加 `GrowthRecognitionJob`：baseline/单日记版本任务、请求 ID、source hash、状态/固定失败码、尝试次数和来源版本；保存可恢复所需的 ID/版本/hash，不保存日记原文。
  - 增加 `GrowthInsightReport` 与报告生成任务状态：结构化三维内容、来源日记 ID/版本、source version、生成时间/状态；保留上一份成功报告，生成中的任务不覆盖成功结果。
- `backend/prisma/migrations/<unique_timestamp>_growth_insights/migration.sql`
  - 新增 `Diary.publishedLocalDate`、成长/报告表、唯一约束和查询索引；不回填旧私密正文、不改写锚点/聊天/城市目录数据。时间戳在执行时核对已有 migration 后确定。
- 新增 `backend/src/modules/growth/growth-insights.module.ts`、`growth-insights.controller.ts`、`growth-insights.service.ts`、`ark-growth-insight-provider.ts`：
  - `GET /growth/state` 返回设备自己的三花状态、初次识别状态、真实里程碑、report lock/current/stale/generating 状态及上次成功生成时间。
  - `POST /growth/flowers/initialize` 在首次花朵页进入时幂等启动当前全部日记的 baseline 分析；已经完成时不全量重跑。
  - `POST /growth/flowers/retry` 对失败的 baseline/增量任务按用户动作各重新执行一次。
  - `POST /growth/reports/ensure-current` 服务端检查三花授权，按当前所有可用日记版本创建/复用生成任务；来源未变且有成功报告时直接返回当前报告。
  - `POST /growth/reports/retry` 仅允许已解锁设备显式重试；`GET /growth/reports/current` 返回最后一份成功报告及是否过期/更新中的状态。
  - generation 状态可由 `GET /growth/state` 与 `GET /growth/reports/current` 串行轮询；同一 `sourceVersion` 的并发请求合并。报告读写、解锁判断和来源枚举全部由后端执行并校验设备身份。
  - baseline 将日记按稳定 ID/version 顺序切分为受限字符数的批次，逐批摘要固定花朵候选、旅行证据和有效 source IDs；整次分析可恢复，重复结果幂等。增量任务只读目标日记当前版本。来源 hash/版本改变时丢弃迟到结果，不覆盖新任务。
  - 报告生成对相同来源使用分块 map/reduce：各块只产生带来源 ID 的三维候选，最后由同一模型综合成固定三维报告；所有调用共享设备级队列及 240 秒硬超时。任意分块失败时本次报告失败并保留旧报告。
  - 里程碑在服务端按设备计算：旅行来自模型返回且验证过的来源证据；30 天以 `publishedLocalDate` 为优先，旧记录回退到持久发布日期/入库时间，去重后只计算最新连续日期段，断档后重置为新段；100 锚点来自统一有效锚点读模型计数。无数据/读失败不显示假进度。
- `backend/src/app.module.ts` 注册 Growth module；`backend/src/modules/diaries/diaries.controller.ts` 在已保存日记及照片副本成功后异步通知成长服务处理当前版本。后台处理不得延迟或改变日记保存响应；失败不影响保存。
- `backend/src/modules/diaries/diaries.controller.ts` 与 `src/contracts/core-diary-contract.ts`、`src/store/create-app-store.ts` 扩展 `publishedLocalDate` 写入契约。后端只在新日记首次创建时保存该日期，编辑以数据库原值为准。

### 客户端契约、仓库与 Store

- 新增 `src/contracts/growth-insight-contract.ts`：固定三种花朵 ID、三维报告 ID、花朵/里程碑/任务状态、请求版本及运行时校验；要求结果引用的日记 ID/version 属于服务端响应来源集合。
- 新增 `src/repositories/growth-insight-repository.ts`、`http-growth-insight-repository.ts` 和 `src/store/adapters/backend-growth-insight-adapter.ts`：封装上述读取、首次初始化、报告 ensure-current 与手动 retry API；使用共享 `ApiClient` 和设备身份头；拒绝客户端提交日记正文、花朵解锁布尔值或外部 source IDs。
- `src/store/adapters/types.ts`、`src/store/create-app-store.ts`：
  - 注入 growth repository 和设备本地日期提供能力。
  - 新增成长状态读取、首次初始化幂等、报告 ensure/retry 状态管理；旧的内存 `flowerUnlocked` 不再是正式 UI 或服务权限来源。
  - 保留既有报告 request/source stale guard 思路，但报告数据与 current version 由服务端权威返回，客户端不能自行拼接来源内容或把 mock 当成真实报告。
- `src/contracts/insight-report-contract.ts` 与 `src/services/insight-report-provider.ts` 保留为纯生成结构/测试边界，升级请求来源为完整正文块或将后端私有 Provider DTO 与客户端读结果 DTO 分离；两个边界不共享含私密原文的 wire payload。

### 花朵、成长树和报告页面

- `app/profile/flowers.tsx`
  - 使用扩展后的 `GrowthArtwork(kind="flowers", flowerStates=...)` 显示三类各自的真实状态，不改变现有设计稿名称/视觉资源。
  - 首次进入自动调用 baseline initialize；显示读取、识别中、无可用日记、失败和完成状态。识别失败有明确手动重试，不显示预设 `2/3`。
  - 展示模型为已绽放花朵生成的简短说明，以及真实的三项里程碑和动态报告解锁状态。
  - 只有三花全部已授予时报告入口可用；未解锁提示剩余花朵条件，已解锁进入报告页。
- `src/components/profile/growth-artwork.tsx` 和 `app/profile/insights.tsx`
  - 花朵图稿目前是扁平合成图，组件只能整体切换「第三朵锁定/绽放」两种资源。扩展为按 `pathfinder` / `self-awareness` / `healing` 分别呈现锁定或绽放状态；复用现有图稿与标签坐标，通过与单朵绘制区域绑定的状态遮罩/锁定标记表达未获得状态，不继续显示与真实状态矛盾的固定开花组合，不新增占位插画。
  - 成长树花朵入口读取同一服务端状态；不从开发场景参数或本地 boolean 授权。既有 `scenario=unlocked` 仅可留作不调用服务、不改变服务端权限的 `__DEV__` 视觉夹具。
  - 成长树现有标签入口、页面壳层和非一级页无底部导航行为保持不变。
- `app/profile/report.tsx`
  - 直达页面时先读服务端成长状态；未解锁仅显示锁定页，不触发 report ensure-current，且不显示任何报告正文。
  - 已解锁时调用 ensure-current；以现有暖色 GrowthScreen 展示加载/生成中。若有上次成功报告，同时继续展示并说明正在更新。
  - 成功后渲染三类模型洞察、服务端来源数量、来源版本/生成时间和现有「这不是定义，只是一面镜子」定位。
  - 失败保留上一份报告（如有），提供显式重试；没有旧报告时展示失败/空来源状态，不回退固定示例。

### 测试与文档

- 新增/扩展 `backend/src/modules/growth/*.spec.ts`、`backend/test/app.e2e-spec.ts`：花朵三类白名单、有效来源 ID、重复授予、baseline/增量幂等、设备隔离、任务恢复、编辑迟到结果、花朵不撤回、来源无正文、报告门禁、报告 sourceVersion、保留旧报告、失败手动重试、30 日连续规则、日期 fallback 和锚点真实计数。
- 新增 `src/contracts/__tests__/growth-insight-contract.spec.ts`、`src/repositories/__tests__/http-growth-insight-repository.spec.ts`、`src/store/__tests__/growth-insight-integration.spec.ts`，以及 `app/__tests__/flowers-screen.spec.tsx`、`app/__tests__/report-screen.spec.tsx`；验证页面加载/失败/重试/未授权正文拦截和上次成功报告保留。
- 更新 `docs/reference/business-spec/modules/growth-and-insights.md` 中 GRW-005/006 的局部规则，按本次确认更新 Q-005/Q-006 仅受影响的成长项，补充/更新报告 contract、`docs/reference/delivery/tasks/GRW-005.md`、`GRW-006.md`、同名 CASE 和 DEV 台账；保留历史证据及现有城市目录记录。

## API 与数据流

1. 新日记首次保存：客户端随保存命令附设备当地日期；后端保存成功且照片副本已准备后，同时异步入队日记锚点和成长花朵单篇识别。编辑仅为该日记新版本入队；设备本地日期保留首发值。
2. 首次进入花朵页：客户端先读 `/growth/state`，若初次识别未启动则调用 `POST /growth/flowers/initialize`。后端快照当前设备全部可读的有效正文/引用，按固定顺序分块并异步分析；客户端按 3 秒串行轮询 state，不重叠请求。
3. 花朵识别成功：服务端仅接受固定 flower ID、非空短摘要及该批有效日记 ID 子集。数据库唯一键授予每类最多一次；花朵取得后不撤销。来源原文只在模型请求执行期间使用，不写入 Growth job、报告表或日志。
4. 报告页：客户端读取成长状态；未解锁时不请求生成。已解锁时调用 `POST /growth/reports/ensure-current`；服务端重新枚举设备当前可访问完整日记正文，比较 source version，复用当前任务/报告或新建报告任务。
5. 报告成功：固定三维、非空内容、source IDs、source versions 和当前解锁状态全部通过验证后持久化为当前成功版本。上次成功版本保留到新版本完整成功；任何错误都不能将失败报告标为成功。
6. 里程碑和报告来源均由同一设备的有效业务读模型计算；纠正内容、聊天记录、照片/EXIF、模型历史与客户端传入的任意 ID 不作为输入。

## 假设与决定

- 现有花朵主题和三维报告意图为产品固定结构；模型填充识别、依据摘要和内容，不自创标签、不改变报告三维。
- 花朵成功授予后持久保留；已删除/不可访问来源不会继续作为报告来源或暴露正文。花朵行可保留获奖时间、摘要和来源 ID 清单，但读取报告时只使用仍可访问的当前日记。
- 全量 baseline 仅首次运行；后续日期/编辑事件只处理本篇版本。baseline 持续期间新保存日记的增量任务独立幂等运行，且不会重复 baseline。
- 自动任务每批只尝试一次；仅用户显式重试才能开启新尝试。真实 provider 配置缺失或结构不合格时 fail closed。
- 页面继续使用现有 `GrowthScreen` 与设计稿资产，不重做布局、不改变导航；添加任务状态与模型说明所必需的内容区。
- 即使本次两次合成 Provider smoke 通过，也只证明连通与结构，不代表花朵识别或心理洞察达到完整质量门槛。对外质量 CASE 需保留人工评测/事实依据检查。
- 不执行清库、不在 E2E 中使用开发库、不读取或输出 `.env` 凭据。按用户选择，在 migration 隔离 fresh/legacy/baseline 验证通过后，可以对本机开发库应用本次 additive migration；任何测试写入仍只走专用 `E2E_DATABASE_URL`。

## 实施步骤

1. 先实现服务端 schema/迁移、固定 contract、可信 provider、成长识别/报告任务/存储/API 和设备隔离；先使用 mock/单测边界，不触发真实模型。
2. 建立客户端 API repository 与 Store 状态，接通花朵页、成长树状态和报告页；保持现有图稿、导航和非一级页壳层约束。
3. 在隔离 MySQL 上验证 migration fresh/legacy/baseline、source ID/device isolation、任务状态/幂等/恢复、report authorization 和结果持久化；通过后应用 additive migration 至开发库，检查 up-to-date/drift，不清库。
4. 同步 FSD、Q-005/Q-006 局部决策、契约、tasks、CASE、DEV 进度。新增 CASE 只按实际证据更新状态。
5. 运行定向 Store/repository/page/provider/controller/E2E、root typecheck、backend build、migration safety 及模拟器页面验收。
6. 按已授权范围最多执行两次真实 Provider 合成请求：一条合成日记识别、一份合成报告；绝不使用本地真实用户日记或聊天做 smoke。

## 验收标准

- 当前设备历史日记首次分析后能显示真实三花状态与三项里程碑；空资料、缺失模型、畸形模型响应均不展示示例花朵或固定 `2/3`。
- 每种花只可依据至少一条有效来源日记授予一次；三花授权由后端验证，未解锁直达 report 不能生成或读取正文。
- 新日记/编辑只触发单篇版本增量分析，异步失败不影响保存；设备内 chat 交互优先，任务并发/重复/重启恢复不重复授予。
- 报告只在已解锁后按需生成；3 个维度均来自服务端可信模型输出，来源 ID/version 属于该请求真实输入，显示来源数量和生成时间。
- 来源变化后访问报告会刷新；生成中保留旧成功报告，失败不丢旧报告，且只有用户点重试才再次调用。
- 更换设备后不读取上一设备的成长/报告数据；原文、纠正、照片与聊天上下文均不被修改或串用。
- 里程碑状态真实反映来源：首次旅行需有效模型证据；30 天依据有效日期去重后的最新连续段，断档后重新从第 1 天计且不保留历史最长段；缺少发布日期时用入库时间，仍无有效时间的记录不计入；100 锚点来自统一有效锚点数；三项均不直接授花。
- 静态 mock、单测或单次 synthetic provider smoke 均不记为真实业务质量 CASE 通过。

## 验证计划

- 前端：`npm run typecheck`；运行新增 Growth contract/repository/Store 与两页定向 Jest；不跑无关全量测试。
- 后端：`npm --prefix backend run build`；运行 Growth Provider/service/controller unit suites。
- 数据库：使用 `backend` 的迁移保护脚本验证 fresh deploy、legacy upgrade、baseline adoption 与无 schema drift；MySQL E2E 强制使用唯一专用 `E2E_DATABASE_URL`，验证任务幂等、来源隔离、解锁授权、report last-good、失败重试和日期边界；开发库只在 migration 安全验证成功后应用增量 migration 并只读确认状态。
- Provider：仅两次 synthetic 请求，不写数据库，不输出凭据或正文；检查固定 JSON schema、花朵白名单/来源 ID、三维报告及敏感推断边界。
- 模拟器：使用无用户写入的设备身份展示空态、baseline 进度、花朵解锁、报告首次生成、过期更新、旧报告保留和失败重试；无授权/真实来源锚点时不制造真实用户数据。
- 收尾：`git diff --check`、审阅目标差异与 `git status`；保留现有未提交城市目录、公开发布迁移和其它用户改动，不提交、不回滚任何现有修改。
