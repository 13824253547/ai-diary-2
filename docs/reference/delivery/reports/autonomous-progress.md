# 自动推进进度台账

## 当前执行策略（2026-10-15）

用户已批准开发优先、集中测试、问题回流的迭代方式。DEV-1 完成 42/42 项源码盘点；DEV-2/3 修复 MAT-005 缺陷、推进 DSC 第一方后端/API/client repository，建立 GRW-003 versioned anchor read model、GRW-004 correction 与 PET-001 持久会话边界。TEST-3 暴露测试替身与分类入口问题，修复后的 TEST-4 backend unit/build 全通过；新增社区 client、锚点、chat 测试尚未运行。执行规则见 [开发策略](../development-strategy.md)，外部能力见 [分类清单](../external-dependencies.md)，开发状态以 [development-progress](development-progress.md) 为准。

DEV-1 推进 PET-001 provider/store、CRE-005 生产 mock 门禁、DIA-006 分页、MAT-005 provider/Store、GRW-002 稳定主题 ID、GRW-006 report/provider 骨架并完成 42 项盘点。TEST-1 前端初测 338/340，DEV-2 修复两项 MAT-005 缺陷；TEST-2 前端全量 340/340、定向 7/7、typecheck、diff check 通过。社区后端测试经历 service mock fixture 和 controller category guard 两项修正后，backend unit 8 suites / 77 tests 全通过、build 通过。隔离 e2e 未配置 `E2E_DATABASE_URL`，未执行。其他新 CASE、真实设备/provider/文件链路仍待测或延期；编译/mock/unit tests 不计真实业务 CASE passed。

截至 TEST-14（2026-10-16）：coverage 有效任务验收共 225 项，矩阵明确 passed 仍为 96 项，`96 / 225 × 100 = 42.7%`。后端 unit 17/17 suites、199/199 tests，隔离 MySQL e2e 49/49，root typecheck、backend build、Prisma migration status 与 schema diff 检查通过。TEST-13 已验证 CASE-BAS-004-001；A02 的 TEST-10 当前 worktree normal/reverse 各 15/15 继续有效。TEST-14 的 discovery/chat/anchor HTTP+MySQL 结果记录为 partial CASE evidence，不增加 passed。该比例只代表验收，不代表开发完成率。

### 2026-10-16 · DEV-3 · GRW-003/004 服务边界收紧

- GRW-003 标签读取改为 MySQL 8.4 查询：先连接同设备的当前日记版本与 succeeded/provider extraction，以 `JSON_TABLE` 验证 text/quote 来源块，再在数据库执行 count/page，避免将全部候选锚点和日记载入应用层。该查询尚未连接数据库验证，依赖 TEST 轮的隔离 MySQL migration/CASE。
- 发现并修复持久化信任边界：当前没有可信 server-side anchor provider，提取 begin/complete/failure 写入口在所有非测试运行环境 fail closed；调用方提交 `source: provider` 不再能让开发服务器把非可信结果写入 read model。mock 仍只留在 in-memory provider。
- GRW-004 correction GET/PUT 现在要求 anchor ID 对应同设备、同日记版本的 succeeded/provider 提取行，来源 block 必须匹配当前快照；更新了 service Jest fixture 和缺失 anchor 的断言代码，未运行测试。
- 同步 GRW-003/004 task、CASE、contract、development-progress、acceptance-matrix、blockers 与 current snapshot。随后 `npm run typecheck`、`npm --prefix backend run build`、`git diff --check` 均通过；新增 Jest、migration、MySQL/e2e 未执行，也未调用 provider 或改正式 UI/UX。没有更改 CASE 结果；验收仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · 成长与陪伴概览再审

- 按 README 依赖顺序复核 GRW-001/002/005/006 与 PET-002 的 task、CASE、页面、Store/provider 和外部能力分类。个人/宠物/树的统计继续受 Q-005 与 Q-001；默认锚点集合受 Q-016；成长资格/解锁受 Q-006；报告首次生成、留存与质量受 Q-006/Q-001/Q-002/Q-016。现有稳定 tagId 路由和报告 provider/Store mock 边界已在源码中，尚无可安全替换静态数据或真实接线的无争议读模型。
- 这些受影响分支已在各 task、development-progress 与 autonomous-blockers 留档；本轮没有把固定统计、12 个锚点、2/3 花朵或报告演示内容改成猜测值，也未修改 UI/UX。决策未闭环前先跳过这些分支，继续后续可开发任务；验收状态与 96/225 通过数不变。

### 2026-10-16 · DEV-3 · PET-001 回复来源校验

- 复核发现开发运行的聊天 API 可接受客户端自报 `source: provider` 并持久化。现保留明确标记的 `source: mock` 开发回复，但非测试运行环境拒绝 client-declared provider；production 原有创建/重试/回复 fail-closed 不变。
- 更新 `chat-sessions.service.spec.ts` 的拒绝伪 provider、允许显式 mock 用例及 PET-001 contract/task/CASE、外部依赖和进度/阻塞记录。随后 `npm run typecheck`、`npm --prefix backend run build`、`git diff --check` 均通过；Jest 未运行。

### 2026-10-16 · DEV-3 · MAT-001 设备照片导入业务边界

- 新增基于 `expo-media-library` 的 `importDevicePhotoAssets(...)`，读取既有系统权限、不主动请求授权，按选中系统 ID 顺序取媒体信息并用 `Image.getSize(...)` 探测图片 URI 可解码；拒绝权限缺失、ID/类型不匹配、解码失败及仅网络/iCloud 资产，不自动下载。未从 EXIF 推断地点。
- 新增 Store `devicePhotoImporter` 注入和 `importDevicePhotosToMaterials(...)` action；整批校验成功后才原子登记素材目录与成员，重复系统 ID 复用并刷新当前 URI，和 mock/其他来源 ID 冲突时整批拒绝。新增 service/Store Jest 已编写未运行。
- 正式素材上传 sheet 仍是既有示例选择，没有接入 action，也未改变 UI/UX；真实 iOS 文件可读性、权限矩阵及跨重启 URI 留存未验证，Q-001/Q-015/Q-018/Q-003 继续限制相应分支。`npm run typecheck`、`git diff --check` 通过，新 Jest 未运行；验收矩阵与 CASE 状态不变。
- MAT-001 从“已有实现待复验”调整为“实施中”；42 项互斥主状态现为 23 项已有实现待复验、7 项延期/决策阻塞、12 项实施中，整项实现完成和 mock 业务完成仍各为 0。验收仍为 96/225（42.7%），未新增 passed。

### 2026-10-16 · DEV-3 · MAT-002 保留当前编辑草稿引用

- 修正素材应用路径：目标已有未保存草稿时，从该草稿的当前首个 text block 读取引用并追加照片 ID；不再从已保存日记恢复旧引用覆盖当前编辑。未保存文字、标题、摘要和已有引用保持不变；没有保存目标/没有任何可用 text block 仍在创建新草稿前停止。没有更改页面样式、文案、反馈或路由。
- 在 `app/__tests__/library-screen-material-apply.spec.tsx` 增加现有草稿改正文/标题/摘要及引用后再应用 P4 的回归，代码未运行；`CASE-MAT-002-004` 继续受 Q-015 待决策，未改 CASE/matrix passed。
- `npm run typecheck` 与 `git diff --check` 通过；未运行 Jest、backend build、数据库 e2e。MAT-002 由“已有实现待复验”转为“实施中”，当前 42 项主状态为 22 项已有实现待复验、7 项延期/决策阻塞、13 项实施中；整体验收维持 96/225（42.7%）。

### 2026-10-16 · DEV-3 · MAT-003/004/005 与 PCD-001 再审

- MAT-003 已有八种装饰的资源/名称映射、稳定 ID 路由、卡片预览及关闭无副作用证据；生成资产依赖 PCD-001，PCD-001 仍按用户暂停决定不添加 renderer/不改按钮反馈，非法装饰语义和往返规则分别受 Q-015/Q-009 限制。未发现可独立改变完整交付状态的代码缺口。
- MAT-004 当前把所选问题与回答组合成一条用户消息，并由本地 Store 关联 request ID；PET-001 持久 API/repository 仍未接正式素材入口。网络等待/失败状态没有已授权可见反馈，Q-001/Q-002/Q-003 未关闭，因此暂不改现有提交/导航行为，不把本地回复当真实 CASE。
- MAT-005 的可替换 provider、独立 mock 资产、Store 防重/取消/可读性和迟到结果保护已有代码；真实图像 provider/资产文件未配置，正式页面仍有示例接线，接线将改变错误/取消反馈。此处没有无决策的真实能力可补；不重复运行历史 TEST-2。
- 对应 task/blocker 已记录这些局部分支并跳过，MAT-003～005 / PCD-001 的 CASE/matrix 状态均未改变。DEV-3 继续沿 README 审计 PET/DSC 和其余第一方范围。

### 2026-10-16 · DEV-3 · DSC-003 禁用点赞错误映射

- 修复禁用点赞的领域错误在 HTTP 边界被误映射为 `invalid_input`：controller 现在返回 HTTP 409 / `interaction_not_available`，repository 允许并保留该结构化错误；同时让 discovery 所有路由先解析 `x-device-id` 再检查参数，缺身份不会被其他输入错误覆盖。没有修改 `likesEnabled` 资格或 Q-007 规则。
- 新增 controller 和 client repository 错误映射回归代码，更新 DSC-003 task/CASE、read contract、acceptance matrix、blockers、current snapshot 与 development-progress。`npm run typecheck`、backend build、`git diff --check` 通过；新增 Jest 未运行，migration/MySQL 未触碰，未增加 CASE passed。

### 2026-10-16 · DEV-3 · GRW-003 持久读模型边界

- 新增 `DiaryAnchorExtraction` 与 `DiaryAnchor` schema / 未应用 migration、版本化 extraction lifecycle API，以及 client `AnchorReadRepository`。提取 run 按设备、日记来源版本和 request ID 归属；写入在事务内锁来源日记，校验 owner、当前版本、source snapshot hash 和 text/quote block 引用；固定失败码、attempt、幂等成功重放及旧 attempt 冲突均有服务边界。
- 锚点查询要求调用者显式传 `tagId`，不生成默认分类；只返回 source=provider、extraction 成功、日记版本仍当前且来源正文块仍存在的锚点。没有对 Diary 添加删除级联/限制外键，来源删除后的 orphan 行不展示，清理策略保持 Q-001/Q-016 待定。
- 开发 `source: mock` 继续留在内存 provider 路径，不写入真实持久表；production 当前无可信 server provider，提取写入 fail closed。正式锚点页仍使用既有静态映射，未接 repository/保存事件。
- 新增 backend service/controller 和 client repository Jest 已编写未运行；Prisma Client 生成、typecheck/backend build 通过。Migration 未应用、未运行数据库/e2e/provider；CASE-GRW-003-001～008 状态未变，验收维持 96/225。

### 2026-10-16 · DEV-3 · GRW-004 版本化纠正服务

- 新增 `anchor-correction-v1` contract、后端 Prisma correction/command 模型和未应用 migration，以及设备身份保护的 GET/PUT API。写入校验来源日记归属/版本和 text/quote block；`expectedVersion` 比较、事务写入与设备作用域 idempotency key 防止重复副作用或静默覆盖。
- 新增前端 response contract、HTTP repository、backend adapter 和 Store adapter 注入；未接正式页面，未改变 UI/UX、提示或路由。没有更改日记正文，也未调用外部模型、应用 migration 或访问用户数据。
- 新增 backend service/controller 和 client repository Jest 代码，本轮不执行。读写事务锁定来源日记行后再验证版本；Prisma Client 生成、`npm run typecheck`、`npm --prefix backend run build`、`git diff --check` 均通过；migration、CASE、MySQL/e2e 均未运行。
- 当时的纠正服务只校验来源 diary/source block，还不能证明 anchor ID 来自真实提取；后续 DEV-3 已新增版本化 anchor read model/API，但仍未接入正式页面，且 migration 未应用。
- Q-001/Q-003/Q-016 未确认纠正留存范围、字数界限和原文变化/下游传播。
- GRW-004 从“已有实现待复验”调整为“实施中”，互斥主状态现为 24 项已有实现待复验、7 项延期/决策阻塞、11 项实施中；整项实现完成和 mock 业务完成仍各为 0。验收矩阵维持 96/225（42.7%），本轮未增加 passed。

### 2026-10-16 · DEV-3 · PET-001 持久会话服务边界

- 新增 `ChatConversation`/`ChatTurn`/`ChatMessage` Prisma 模型及未应用 migration；实现按设备身份列出/读取会话、创建幂等用户 turn、保存回复、记录固定失败状态与显式递增重试 attempt。会话事务锁和 turn sequence 保证写入关联及稳定历史顺序；异常原文不入库。
- 新增 `pet-chat-v1` contract、HTTP repository 与 Store adapter 注入。回复继续由现有可替换 `ChatReplyProvider` 提供，开发 mock 显式标记来源；当前无可信服务端 provider，production 在创建/重试/回复写入前 fail closed，未把固定回复放进后端 endpoint。
- 源码复核发现 `appConfig.mode` 固定为 `hybrid-dev`，仅凭 mode 判定会让 release 误启用 chat/image/report mock。`createDefaultAppStoreDeps` 现要求 `hybrid-dev` 且为 `__DEV__` 开发运行时；Jest 保留隔离 mock，release 默认 fail closed。
- 正式宠物页和 Store send/retry 尚未连接 repository，避免未经授权改变用户可见等待/失败体验；Q-001 retention/清理/跨设备、Q-002 质量安全/自动重试、Q-003 输入边界仍待决策。迁移未应用、未访问数据库或调用外部模型。
- 新增 backend controller/service 与 client repository Jest 代码未运行。Prisma Client 生成、`npm run typecheck`、backend build、`git diff --check` 通过；PET CASE 无新增执行结果，验收维持 96/225。

### 2026-10-15 · TEST-1 / DEV-2 / TEST-2 · MAT-005

- TEST-1 全量 Jest 首次执行为 45 suites / 340 tests，338 项通过、2 项失败。MAT-005-D1 是 Jest bundled image 使用 `{ testUri }` 时被 Store 判为不可读；MAT-005-D2 是立即取消发生在可控 provider 启动前，action Promise 未结束并触发 5 秒超时。完整输入、预期/实际、S2 严重度和历史失败保留在 `test-cases/MAT-005.md`。
- DEV-2 在 `ai-image-generation-provider.ts` 统一识别原生数字资源、URI 和测试资源 URI；Store 对 provider/readability 等待与 abort 竞速，并在 provider 开始前复核取消状态。没有改页面、反馈或 CASE 预期。
- TEST-2 定向 MAT-005 为 7/7，前端全量 Jest 为 45/45 suites、340/340 tests；`npm run typecheck` 与 `git diff --check` 通过。backend unit 6 suites / 61 tests 于 TEST-1 通过且后续仅修改前端代码，本轮未重复运行。
- `E2E_DATABASE_URL` 未配置，未运行 MySQL e2e；未操作数据库、模拟器、外部 provider 或生成文件。MAT-005 本地 mock 子集通过不计真实 CASE passed；验收矩阵维持 96/225（42.7%）。

### 2026-10-15 · DEV-2 · DSC-001～003 第一方后端

- 新增 `DiscoveryStory` 与 `DiscoveryLike` Prisma read model / migration 文件，以及 `GET /api/discovery/stories`、`GET /api/discovery/stories/:storyId`、`PUT /api/discovery/stories/:storyId/like`。
- 查询只服务显式 `published`、有发布时间且未撤回的独立快照；不从日记 privacy 自动发布，也没有新增发布 endpoint。搜索覆盖标题/地点/作者；列表必须显式传 `category=latest`，缺省/recommended/local 均 fail closed，不把最新顺序设成默认推荐。点赞用设备 ID 复合唯一关系和目标状态写入，仅在记录显式 `likesEnabled=true` 时生效，默认关闭。
- 新增 `discovery-read-v1.md` 与 controller/service 测试。TEST-3 首轮 backend unit 为 7/8 suites、74/77 tests passed：service fixture 漏配 `discoveryStory.findFirst`，controller mock 还暴露 category 规则只委托 service 校验。DEV-3 修正 fixture，并让 API controller 与 service 都要求显式 `category=latest`；缺省/recommended/local 均 fail closed。TEST-4 `npm --prefix backend run test -- --silent` 为 8 suites / 77 tests 全通过，backend build 通过。
- Prisma Client 已生成，但 migration 未应用、数据库没有写入且没有 published fixture；正式页面未接线。Q-007/Q-013 发布/匿名/撤回规则与 Q-001 缓存、Q-007 点赞资格仍待决策。DSC CASE 和 96/225 passed 数均未改变。

### 2026-10-15 · DEV-3 · DSC client 与 GRW-003 提取边界

- 将 `HttpDiscoveryRepository` 注入 `AppStoreAdapters.discoveryRepository`，使用已有 ApiClient 与设备身份头；新增列表/详情/target-like 契约校验和结构化错误映射。正式发现页面未接线、原 UI/UX 不变；新增 `http-discovery-repository.spec.ts` 未运行。
- 新增 `anchor-extraction-v1` 契约、显式 mock/unconfigured provider 及 service boundary：请求绑定 diary/version/source blocks，输出验证来源 IDs/version/tag/引用；同版本同快照并发合并，同版本不同正文冲突；支持取消和当前来源版本 guard。mock 结果标注 `source: mock` 与合成 `mock-unclassified`，不触发保存或进入正式页。
- `npm run typecheck` 通过；`git diff --check` 与该增量后的 backend unit/build 尚待本轮最终复核。锚点测试已编写未运行；未新增 DB schema、migration 或持久化，未调用真实 provider。Q-016/Q-002/Q-003/Q-001 阻塞触发/语义/质量/摘录/留存的正式闭环。验收矩阵保持 96/225。

### 2026-10-15 · DEV-1 · PET-001

- 原有关键词回复从 Store 移到 `src/services/chat-reply-provider.ts` 的显式 mock adapter；非 `hybrid-dev` 未配置真实 provider 时 fail closed。
- Store/消息新增 conversation ID、request ID、provider 来源、attempt 和 pending/completed/failed/stale 状态；异步回复插在对应用户消息后，同业务 request 重试递增 attempt，迟到 attempt 被丢弃。
- 未改 `app/(tabs)/pet.tsx` 的视觉与现有同步 mock 呈现。Q-001 会话留存、Q-002 AI 质量/安全/取消，以及失败状态的正式可见接线均未完成。
- 验证：`npm run typecheck` 与 `npm --prefix backend run build` 通过；未运行 PET CASE 或前端测试套件。初次 backend build 发现 Node/DOM 全局声明冲突，`backend/tsconfig.json` 显式限定 `lib: ["es2021"]` 后标准 build 通过。DEV-1 不据编译检查宣称 CASE 通过。
- 验收矩阵未增加 passed，开发细目见 `reports/development-progress.md`。

### 2026-10-15 · DEV-1 · CRE-005

- 源码审计发现后端 `AI_PROVIDER` 未设置时，无论运行环境都会默认选 `deterministic`；这会使固定 mock 成功结果存在进入生产的路径。
- `backend/src/common/diary-generation.service.ts` 现由生成和 rewrite 共用 provider 解析门禁：生产环境缺少配置或显式选择 `deterministic` 时返回不可重试 `provider_failed`；非生产环境仍保留 deterministic 开发 mock，显式 `openai-compatible` 继续走既有真实服务适配器。
- 新增两条生产模式拒绝单测，并在 `backend/.env.example` 标明 deterministic 仅限本地开发；未调用真实 provider、未读取凭据、未改变 UI/UX、重试或质量规则。
- `npm run typecheck`、`npm --prefix backend run build` 与 `git diff --check` 通过；本轮新增服务单测和业务 CASE 未运行，留待集中 TEST。验收矩阵维持 96/225，未增加 passed。

### 2026-10-15 · DEV-1 · DIA-006

- 源码审计发现启动 hydration 和回忆筛选均只请求首个 100 条分页，后续页面未读取；超过 100 篇时会静默缺失作品与月份。
- 新增允许页容量集合 10/20/50/100、严格页码校验和 HTTP repository 全页续取；完整性检查覆盖页序、pageSize、total、空页和重复作品 ID。回忆数据库查询也增加日期后 ID 的稳定排序。
- 启动 hydration 与既有筛选 Store action 优先使用 `listAllMemories`，不改变页面、筛选或反馈。新增 contract、repository、controller 测试，但尚未运行；未连接数据库或运行 e2e。
- `npm run typecheck`、`npm --prefix backend run build` 与 `git diff --check` 通过；DIA-006 CASE-DIA-006-010 保持未执行。验收矩阵维持 96/225，没有新增 passed。

### 2026-10-15 · DEV-1 · SHR-001～005 源码盘点

- 已对照五项 task/CASE 检查当前分享设置与 `publicBlockIds` 服务校验、统一投影、匿名 PNG 像素衍生、人脸裁切遮挡、海报/全文预览及本地 PNG/PDF/交付编排。
- 确认正式页面仍通过 `recordShareDemo(...)` 明确输出演示反馈；平台 adapter 未配置时返回 unsupported，不写真实平台成功记录。PDF/PNG 服务层能力不能替代 Q-014 输出规格、iOS 文件出口或正式页面接线。
- 当前独立后续项均已有记录：公开读取/社区边界受 Q-007/Q-013，匿名未知区域受 Q-013，正式入口/反馈遵守 UI/UX 冻结，月度/分享输出规格与真实渠道受 Q-014。未运行 SHR 测试、文件、视觉、设备或平台 CASE；未修改正式页面。
- 五项源码盘点已同步到开发台账；验收矩阵通过数维持 96/225。

### 2026-10-15 · DEV-1 · MAT-001～005

- MAT-001～004 源码核对未发现能在不触及设备权限、留存、Q 决策或既定页面边界下独立改动的遗漏；已把真实媒体导入、真实 asset URI、MAT-002 连续 app/backend 证据、PCD-001 未产图和 PET-001 依赖分别记入开发台账。
- MAT-005 不再只停留在 `app/library/index.tsx` 的 `add('photo-9')`：新增 `AIImageGenerationProvider` 契约、显式 `hybrid-dev` mock、fail-closed adapter、请求 ID/attempt/来源与取消状态、资产注册/素材成员去重、adapter 可读性确认、坏结果拒绝和迟到取消保护。
- 正式页面仍未调用新 Store action，因为接线需要决定失败/取消可见反馈；当前 UI/UX 冻结约束下暂停该分支，服务和 Store 业务继续可独立开发。
- 新增 `src/store/__tests__/material-image-generation.spec.ts`，当前未运行；`npm run typecheck` 通过，无模型调用、文件写入或数据库操作。真实图像 provider 和生成资产留存受凭据/Q-001/Q-002/Q-015 限制。
- 验收矩阵保持 96/225；mock 结果不计真实 CASE 通过。

### 2026-10-15 · DEV-1 · PCD-001/002 源码盘点

- 对照 task/CASE 与 `app/postcard/index.tsx` 核实：当前卡片仅为可预览素材，`make()` 只置 `generated=true`，没有独立可读资产；分享面板动作只显示演示 Alert，没有文件写入或平台 adapter。
- PCD-001 的真实渲染需要新增原生捕获能力并改变按钮成功时序/失败反馈；用户此前明确暂停该分支，本轮继续保持暂停，不安装依赖、不改正式页面。PCD-002 依赖 PCD-001 真实卡片与 Q-013/Q-014 出口决策，登记为待决策/依赖延期。
- 本轮未执行 PCD CASE、文件、设备或平台验证；既有暂停边界不视为开发完成或 CASE 通过。

### 2026-10-15 · DEV-1 · GRW-001～006

- 六项 task/CASE 与个人空间、成长树、锚点、纠正、花朵、报告源码均已盘点；固定统计/锚点/成长/报告仍按 Q-005/Q-006/Q-016 记录为原型，不作为正式业务结果。
- GRW-002 将原有 `tag` 查询值从显示文案改为资源元数据中的稳定 ID；参数名、路由路径、旧文案回退及主题图/锚点映射均保留，不改变页面路径。
- GRW-006 新增三维报告 provider/Store 骨架，含来源 ID/版本快照、已存在的本地解锁门禁、同源防重、乱序/来源变更保护、结构/来源 ID 校验及取消/失败状态。`hybrid-dev` mock 显式标 `source: mock`，其他模式默认 fail closed；正式报告页仍未接线，真实授权/算法/质量/存储未闭环。
- 新增 GRW-002/006 测试均未运行；typecheck 通过，未调用模型、数据库或其他外部服务。验收矩阵仍为 96/225。

### 2026-10-15 · DEV-1 · NAV-001 / PET-002 / DSC-001～003 / INT-001

- NAV-001 当前已有草稿离开保护、more-actions 目标 ID 与换图草稿复用；正式详情入口、深链/权限恢复及 37 页面全量映射受 Q-009/Q-018 或整表核验限制，本轮未新增导航行为。
- PET-002 仍展示固定锚点数与基线叠加统计；Q-005/Q-016/Q-001 未确认前不改可见数字和默认集合。
- DSC-001/002 仍从 `discoveryItems` 本地数组读取，分类/搜索/详情没有真实故事 repository；DSC-003 点赞仍是本地布尔集合加减 mock 计数。后续须发展自有服务，不把它当第三方 API；故事可见来源、发布/撤回、同城/推荐和互动权限受 Q-007。
- INT-001 需要前述真实设备/provider/文件/存储链路，当前无可独立闭环的端到端代码；继续后置，不运行跨栈或生产环境测试。
- 五项范围已在开发台账逐项记源；本轮未运行 PET-002/DSC/INT CASE，既有验收数不变。

## 2026-10-13

### 已完成

- 建立第一阶段契约与测试基础：
  - `src/store/create-app-store.ts`
  - `src/store/__tests__/diary-domain.spec.ts`
  - `src/contracts/core-diary-contract.ts`
  - `src/contracts/__tests__/core-diary-contract.spec.ts`
  - `src/components/navigation/__tests__/bottom-tabs.spec.ts`
  - `jest.config.js`
  - `jest.setup.js`
- 建立第一阶段报告与契约文档：
  - `docs/reference/delivery/contracts/core-diary-v1.md`
  - `docs/reference/delivery/contracts/ai-quality-evaluation-v1.md`
  - `docs/reference/delivery/reports/phase-1-baseline.md`
- 已将 `BAS-001 / BAS-004` 的任务状态与当前执行证据回填到任务与 CASE 文档。

### 进行中

- `BAS-004` 剩余故障注入、统一执行报告、测试有效性证明
- `BAS-002` / `BAS-003` 真实后端与持久化基础设施

### 新增进展

- 已创建 `backend/` 最小可运行骨架，包含：
  - `identity`
  - `drafts`
  - `generation`
  - `diaries`
  - `memories`
  - `sharing`
- 已补充：
  - `backend/prisma/schema.prisma`
  - `backend/docker-compose.local.yml`
  - `backend/.env.example`
  - `src/services/api-client.ts`
  - `src/repositories/http-core-diary-repository.ts`
  - `src/store/adapters/backend-core-diary-adapter.ts`
- 已验证：
  - `npm --prefix backend run test`
  - `npm --prefix backend run test:e2e`
  - `docker compose -f backend/docker-compose.local.yml up -d mysql redis`
  - `docker compose -f backend/docker-compose.local.yml ps`
  - `npm run db:push`
  - `npm run test`

- 已补 BAS-004 剩余能力：
  - `src/test-utils/reporting/__tests__/execution-report.spec.ts`
  - `src/store/__tests__/share-guard.spec.ts`
  - `docs/reference/delivery/reports/current-execution-snapshot.md`

- 已推进核心链路真实接线的第一版：
  - `src/store/create-app-store.ts` 开始同步草稿、生成任务、保存结果与远端回忆列表
  - `backend/src/common/memory-store.service.ts` 已改为 Prisma/MySQL 持久化
  - `app/_layout.tsx` 启动时会拉取远端回忆
  - 前端当前以 `Expo Go + Metro` 方式在 iOS 模拟器联调

- 已推进 `BAS-002` 当前阶段的数据归属与幂等边界：
  - `backend/prisma/schema.prisma` 已为 `Draft`、`Diary`、`SaveCommand` 增加 `ownerDeviceId`，并将保存命令幂等键收口为“设备 + 幂等键”的复合唯一约束
  - `backend/src/common/device-identity.ts` / `backend/src/common/memory-store.service.ts` / `backend/src/modules/drafts/*.ts` / `backend/src/modules/diaries/*.ts` / `backend/src/modules/generation/*.ts` / `backend/src/modules/memories/*.ts` 已接入 `x-device-id` 归属校验，跨设备读取或修改草稿、日记、生成任务与保存结果会被显式拒绝
  - `src/services/device-identity.ts` / `src/services/api-client.ts` / `src/store/adapters/backend-core-diary-adapter.ts` / `app/_layout.tsx` 已补前端匿名设备身份持久化、异步请求头注入与启动预热，应用侧首次远端同步前就会稳定带上当前安装实例的 `x-device-id`
  - `backend/test/app.e2e-spec.ts` 已补跨设备越权读取/修改拒绝、回忆列表隔离，以及不同设备复用相同保存幂等键时互不串号的真实 e2e 证据
  - 已验证：
    - `DATABASE_URL="mysql://root:root@127.0.0.1:33306/ai_diary" npx prisma db push --accept-data-loss --skip-generate`
    - `npm run typecheck`
    - `npx jest --runInBand src/repositories/__tests__/http-core-diary-repository.spec.ts`
    - `npm --prefix backend run build`
    - `npm --prefix backend run test`
    - `npm --prefix backend run test:e2e`

- 已推进 `CRE-005` 当前阶段真实生成闭环：
  - `backend/src/modules/generation/generation.controller.ts` 新增生成任务轮询接口
  - `backend/prisma/schema.prisma` / `backend/src/common/memory-store.service.ts` 已将生成任务迁入 Prisma/MySQL 持久层，支持按 `ownerDeviceId + idempotencyKey` 复用同一任务，并在后端重新初始化后继续按原 `jobId` 读取
  - `backend/src/common/diary-generation.service.ts` 已建立服务端 provider 骨架：默认 `deterministic` provider 继续提供开发态兜底结果，同时预留 `AI_PROVIDER=openai-compatible` 与服务端模型/密钥配置入口，避免把供应商秘密放回客户端
  - `backend/src/common/diary-generation.service.ts` / `backend/src/common/memory-store.service.ts` 已补 provider 失败分类与默认自动重试骨架：服务端会区分 `timeout` / `provider_failed`，并把 `retryable`、`attemptCount`、`maxAttempts`、`errorCode` 与 `errorMessage` 持久化到生成任务快照；当前通过 `AI_PROVIDER_MAX_ATTEMPTS` 提供工程默认值，默认会对可重试 provider 错误自动再试一次
  - `backend/prisma/schema.prisma` / `backend/src/common/memory-store.service.ts` 现会在建单时持久化 `GenerationJob.inputSnapshot`，并由服务端异步处理生成任务；非终态任务在服务重启后会按持久化输入重新拉起处理，不再依赖“建单时立刻写死结果 + 轮询按时间推进”
  - `backend/src/modules/generation/generation.controller.ts` / `src/repositories/http-core-diary-repository.ts` 已补生成任务接口的结构化错误映射：缺失任务会返回 `not_found` 错误包，前端仓库会保留 `code / message / retryable`
  - `backend/src/common/memory-store.service.ts` / `backend/src/modules/generation/generation.controller.ts` 已补生成任务创建前的远端草稿存在性校验；草稿未同步时会直接返回结构化 `not_found`
  - `backend/src/common/memory-store.service.ts` 以任务快照模拟后端阶段推进，并支持任务取消；成功快照现会附带结构化日记结果
  - `src/repositories/http-core-diary-repository.ts` / `src/store/create-app-store.ts` 已接入 `getGenerationJob` 与 `cancelGenerationJob`，并只在远端成功结果通过契约和照片归属校验后才落成 `complete`
  - `app/create/generating.tsx` 已切为依赖后端 `jobId` 轮询，不再用页面定时器直接完成
  - `app/create/generating.tsx` 已补失败后的“重新生成”入口，同草稿可直接开启新轮次，旧轮次迟到刷新不会覆盖重试后的状态
  - `src/store/create-app-store.ts` 已补生成创建/轮询阶段对 `not_found` 与 `permission_denied` 的失败收口：远端草稿未建立、任务缺失或当前设备无权读取时，草稿都会直接进入可见失败态，不再停在“仍在生成”的假状态
  - `src/contracts/core-diary-contract.ts` / `src/store/create-app-store.ts` 已接入生成任务的尝试次数与失败详情字段；前端在失败态下会优先展示后端返回的 `errorMessage`，不再统一落成模糊的通用失败文案
  - `src/repositories/http-core-diary-repository.ts` / `src/contracts/core-diary-contract.ts` 已将生成任务响应校验深化到合法阶段、状态-阶段组合、进度范围，以及成功快照必须携带合法结构化结果；缺结果的成功回包会直接被拒绝
  - `src/store/create-app-store.ts` 已补同轮次乱序阶段保护，较早阶段的迟到快照不会覆盖更靠后的当前进度
  - `src/store/diary-domain.ts` 已补远端结构化结果到工作副本的映射与照片归属校验；未知照片引用、正文结构缺失或非法封面时会直接转入失败态，不再回退到本地 `buildGeneratedDiary`
  - `backend/src/common/memory-store.service.ts` / `backend/test/app.e2e-spec.ts` 已补生成任务的设备归属隔离，避免通过猜测 `jobId` 读取或取消其他设备的私密生成任务
  - `backend/test/app.e2e-spec.ts` 已补“生成任务持久化后跨应用实例恢复”和“同幂等键重启后不重复建单”的真实 e2e 证据
  - `backend/src/common/diary-generation.service.spec.ts` 本轮继续补了 provider 层单测，除默认 provider 结果结构外，也已验证 `openai-compatible` 的 fenced JSON / content array 解析、缺失凭据、生成 `503`、生成 `400`、rewrite `503`、超时与越界照片引用都会落到正确的解析或失败分类
  - `backend/test/app.e2e-spec.ts` 本轮又把 provider content array / fenced JSON 解析与“假成功但 payload 非法”的失败收口补到真实生成任务链路：前者会在同一 `jobId` 上落成成功快照，后者则会按不可重试 `provider_failed` 写回失败详情，不会误标成功
  - `backend/test/app.e2e-spec.ts` 本轮继续补了 provider 超时的 e2e 证据：`AbortError` 触发后，真实生成任务会按 `timeout` 落成失败快照，并持久化 `retryable=true` 与精确超时文案，而不是只停留在 service 单测结论
  - `backend/test/app.e2e-spec.ts` 本轮又补了 provider 超时自动重试成功的 e2e 证据：第一次 `AbortError` 超时后，后端会在同一 `jobId` 上按默认 `maxAttempts=2` 自动重试并成功返回最终快照，不会新建第二个任务
  - `backend/test/app.e2e-spec.ts` 已补“可重试 provider 失败自动重试后成功”和“不可重试 provider 失败详情写回任务快照”的真实 e2e 证据
  - `backend/src/common/diary-generation.service.ts` / `backend/src/common/diary-generation.service.spec.ts` 本轮又把 provider 网络连接失败并入默认重试骨架：`ECONNRESET`、`ECONNREFUSED`、`ENOTFOUND`、undici timeout/socket 与 `fetch failed` 这类错误会统一转成可重试 `provider_failed`，并保留精确网络错误文案
  - `backend/test/app.e2e-spec.ts` 本轮继续补了 provider 网络异常 e2e：第一次 `ECONNRESET` 连接抖动、第二次成功时，会在同一 `jobId` 上自动重试并完成；若持续 `ECONNREFUSED` 无法连通，则会把 `AI provider network request failed (...)`、`retryable=true` 与 `attemptCount/maxAttempts` 写回任务快照，不会误归成不可重试失败
  - `backend/src/common/diary-generation.service.ts` / `backend/.env.example` 本轮补齐 provider 请求参数配置：生成与 rewrite 温度可分开配置，超出 0～2 或无法解析时回退工程默认值；`AI_PROVIDER_RESPONSE_FORMAT` 默认使用 `json_object`，也可关闭以兼容不支持该请求字段的服务。`backend/src/common/diary-generation.service.spec.ts` 已覆盖默认值、无效温度回退、分别透传、关闭字段和不支持格式前置拒绝；这些是工程兼容配置，不代表 Q-002 正式质量策略。
  - `backend/src/common/diary-generation.service.ts` / `backend/src/common/diary-generation.service.spec.ts` 本轮收紧 provider 照片归属校验：普通文本/引言块 `photoIds`、海报照片、显式封面、人物照片/头像及 rewrite 照片引用，只要超出本轮 `selectedPhotoIds` 即按不可重试 `provider_failed` 拒绝，不再静默过滤后返回成功；缺失或 `null` 的可选照片数组仍归一为空数组。生成提示也要求所有引用只能使用本轮所选照片。
  - 人物记录在因缺少合法 `id` / `name` 而被忽略前，也会先校验其显式 `photoIds` 与 `avatarPhotoId`；malformed 候选携带越界照片引用时同样拒绝。`backend/src/common/diary-generation.service.spec.ts` 已补两条专属回归，`backend/test/app.e2e-spec.ts` 也验证该结果会在同一 `jobId` 写回不可重试失败快照。
  - `normalizeBlocks(...)` 不再静默过滤 `blocks` 数组中的非对象元素；即使数组内同时存在有效正文块，也会按不可重试 `provider_failed` 拒绝。service 单测覆盖 `null` / 字符串元素，backend e2e 验证同一 `jobId` 失败快照。
  - `openai-compatible` 输出契约要求的标题、摘要、地点、日期、同行者、封面及海报照片字段现严格验证；缺失/空值/类型错误或非法 `people` 容器会按不可重试 `provider_failed` 拒绝，不再回退到 `PHOTO_FACTS` 或默认文案制造成功结果。deterministic provider 路径不变。
  - backend 生成 block 校验已与前端 `GenerationResultContract` 的非空规则对齐：空正文、空图片说明、空显式标题/关联 ID 或空照片引用 ID 不会进入 succeeded 快照；无效人物候选仍按现有语义忽略，不会输出非法人物对象。
  - `backend/test/app.e2e-spec.ts` 已补生成任务链路证据：provider 返回普通文本块越界照片引用时，同一 `jobId` 会写回 `failed`、`provider_failed` 与 `retryable=false`，不会误标成功；现有 photo block 越界引用 e2e 仍覆盖其对应失败语义。
  - `backend/src/common/diary-generation-evaluation.ts` / `backend/src/common/diary-generation-evaluation.spec.ts` / `backend/src/scripts/run-diary-generation-evaluation.ts` 已补 `CRE-005` 质量基线，当前仓库可用固定夹具执行自动结构校验，并生成 `cre-005-quality-baseline.md` / `.json` 留档
  - `app/__tests__/generating-screen.spec.tsx` 又补了前置不足的页面反馈：当草稿仍少于 3 张有效图片等条件不满足时，生成页会直接弹出“当前草稿还不能生成，请返回上一页检查照片和排版师。”，且不会发起轮询
  - `app/__tests__/generating-screen.spec.tsx` 又补了缺失任务失败文案：当生成任务已失效时，生成页会直接弹出“生成任务已失效，请重新生成。”，并允许在同一草稿上直接重开新轮次
  - `app/__tests__/generating-screen.spec.tsx` 本轮又补了通用 provider 失败的页面回归：当当前轮次落成 `provider_failed` 对应失败态时，生成页会直接弹出“生成失败，请稍后重试。”，不会误进成功态；只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `app/__tests__/generating-screen.spec.tsx` 本轮又补了建单阶段失败的页面回归：当 `createGenerationJob` 这一层落成 `provider_failed` 对应失败态时，生成页会直接弹出“生成结果异常，请稍后重试。”，不会误进成功态；只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `src/repositories/__tests__/http-core-diary-repository.spec.ts` / `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/generating-screen.spec.tsx` 本轮又补了建单阶段设备归属失效的失败回归：当 `createGenerationJob` 返回 `permission_denied` 时，仓库会保留结构化错误码，store 会把当前轮次落成失败态，生成页会直接弹出“当前设备无法发起该生成任务，请返回后重试。”，且只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `src/store/create-app-store.ts` / `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/generating-screen.spec.tsx` 本轮继续补了建单阶段 `timeout` 的纯中文失败回归：当 `createGenerationJob` 返回 `timeout` 时，store 会把当前轮次收口为“生成超时，请稍后重试。”，不再把后端原始英文错误透给用户；生成页也会直接弹出这条中文文案，且只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `src/store/create-app-store.ts` / `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/generating-screen.spec.tsx` 本轮继续补了建单阶段网络异常的页面回归：当 `createGenerationJob` 直接抛出网络异常时，store 会把当前轮次收口为“生成启动失败，请检查网络后重试。”，不再只在日志里留英文错误；生成页也会直接弹出这条中文文案，且只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `app/__tests__/generating-screen.spec.tsx` 本轮又补了远端草稿未同步完成的页面回归：当建单前置尚未同步到后端时，生成页会直接弹出“当前草稿尚未同步完成，请稍后重试。”，不会误进成功态；只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `src/repositories/__tests__/http-core-diary-repository.spec.ts` / `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/generating-screen.spec.tsx` 本轮又补了设备归属失效的失败回归：当远端任务返回 `permission_denied` 时，仓库会保留结构化错误码，store 会把当前轮次落成失败态，生成页会直接弹出“当前设备无法继续读取该生成任务，请重新生成。”，且只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `app/__tests__/generating-screen.spec.tsx` 本轮又补了取消生成的页面回归：当远端任务返回 `cancelled` 时，生成页会直接弹出“本次生成已取消。”，不会误进成功态；只有用户明确点击“重新生成”后才会在同一草稿上开启下一轮
  - `app/__tests__/generating-screen.spec.tsx` 本轮又补了畸形成功结果的页面回归：当远端成功快照缺少合法结构时，生成页会直接弹出“生成结果结构无效，请重新生成。”，不会误进命名或编辑；用户点击“重新生成”后才会在同一草稿上开启新轮次
  - `app/__tests__/generating-screen.spec.tsx` 又补了生成成功后的分流证据：当结果有人物候选时会进入 `/companion/naming`，无人物候选则进入 `/diary/[id]/edit`，且两种场景下 `savedDiaryId` 都仍为空、正式日记列表数量不变，不会把生成完成误当成保存成功
  - `app/__tests__/generating-screen.spec.tsx` 又补了离开页面与 A/B 双轮证据：生成页卸载时会暂停当前轮次，离开后晚到的成功结果不会再触发详情导航；从 A 切到 B 后，也只会按 B 的完成结果导航
  - `src/store/__tests__/diary-domain.spec.ts` 又补了重复启动建单证据：同一草稿在远端建单尚未返回时重复调用 `startGeneration(...)` 会复用同一轮次，且只会发出一次 `createGenerationJob`
  - `src/store/create-app-store.ts` / `src/store/__tests__/diary-domain.spec.ts` 本轮又修正了“pause 先发生、建单响应后返回”的晚到 `jobId` 回收：当生成页已触发 `pauseGeneration(...)` 后旧轮次才迟到返回 `jobId`，store 现在也会立即调用远端取消接口回收该任务，不再留下悬空任务
  - `app/__tests__/album-select-screen.spec.tsx` / `app/__tests__/edit-screen.spec.tsx` 又补了 A05 页面证据：新建草稿整篇换图后，确认写回的是本次新选集合；回到编辑页时旧生成结果已失效，保存会明确提示“照片已更新，重新生成后就可以保存。”并直达生成页
  - `src/contracts/__tests__/core-diary-contract.spec.ts` / `src/store/__tests__/diary-domain.spec.ts` / `src/repositories/__tests__/http-core-diary-repository.spec.ts` / `app/__tests__/generating-screen.spec.tsx` 已补成功快照结构结果、仅阶段事件无百分比时的兜底推进、超时失败、失败后重开新轮次、缺失任务失败收口、阶段倒退保护、取消安全态、晚到 `jobId` 回收和非法结构结果拦截回归测试；本轮进一步覆盖了“pause 先发生、建单响应后返回”的晚到 `jobId` 回收
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand app/__tests__/generating-screen.spec.tsx`
    - `npx jest --runInBand app/__tests__/album-select-screen.spec.tsx app/__tests__/edit-screen.spec.tsx`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts -t "duplicate generation starts reuse the same remote job creation request|generation ignores paused and stale round callbacks, and finishes only once"`
    - `npx jest --runInBand src/contracts/__tests__/core-diary-contract.spec.ts`
    - `npm run test:domain`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts`
    - `npx jest --runInBand app/__tests__/generating-screen.spec.tsx`
    - `npx jest --runInBand src/repositories/__tests__/http-core-diary-repository.spec.ts`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts src/repositories/__tests__/http-core-diary-repository.spec.ts`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts -t "stale generation job creation is cancelled when the active round is paused before job id returns|pauseGeneration cancels the remote generation job and resets local round|stale generation job creation is cancelled when draft is discarded before job id returns"`（2026-10-14 新增）
    - `npx jest --runInBand app/__tests__/generating-screen.spec.tsx -t "leaving the generating screen pauses the active round and ignores a late success|switching from round A to round B ignores A late success and only navigates with B"`（2026-10-14 新增）
    - `npm --prefix backend run prisma:generate`
    - `npm --prefix backend run db:push`
    - `npm --prefix backend run build`
    - `npm --prefix backend run test -- diary-generation.service.spec.ts`
    - `npm --prefix backend run test -- diary-generation.service.spec.ts diary-generation-evaluation.spec.ts`
    - `npm --prefix backend run eval:diary-generation`
    - `npm --prefix backend run test -- diary-generation.service.spec.ts`（2026-10-15 复跑，provider 请求配置与网络失败分类共 16 项通过）
    - `npm --prefix backend run test -- diary-generation.service.spec.ts`（2026-10-15 复跑，provider 照片归属与前后端结构契约校验矩阵共 43 项通过）
    - `npm --prefix backend run test:e2e -- --testNamePattern="records malformed provider success payloads as non-retryable generation failures"`（2026-10-15，生成任务中的 photo block 越界引用失败收口通过）
    - `npm --prefix backend run test:e2e -- --testNamePattern="rejects unselected text block photo references on the generation job"`（2026-10-15，普通文本块越界引用在同一 `jobId` 失败收口通过）
    - `npm --prefix backend run test:e2e -- --testNamePattern="rejects unselected photo references in malformed people on the generation job"`（2026-10-15，malformed 人物越界照片引用在同一 `jobId` 失败收口通过）
    - `npm --prefix backend run test:e2e -- --testNamePattern="rejects malformed generation block entries on the generation job"`（2026-10-15，畸形 block 元素在同一 `jobId` 失败收口通过）
    - `npm --prefix backend run test:e2e -- --testNamePattern="rejects provider results missing required diary fields on the generation job"`（2026-10-15，缺少标题的 provider 结果在同一 `jobId` 失败收口通过）
    - `npm --prefix backend run test:e2e -- --testNamePattern="rejects empty generated block content on the generation job"`（2026-10-15，空白正文不会进入 succeeded）
    - `npm --prefix backend run test:e2e -- --testNamePattern="provider network"`（2026-10-15，网络重试成功与连接拒绝失败快照 2 项通过）
    - `npm --prefix backend run build`（2026-10-15 复跑）
    - `npm run typecheck`（2026-10-15 复跑）
    - `npm --prefix backend run test:e2e -- --testNamePattern="generation"`
    - `npm --prefix backend run test:e2e -- --testNamePattern="generation|retries retryable provider failures once before succeeding"`
    - `npm --prefix backend run test:e2e`

- 已推进 `CRE-001` 当前阶段真实相册权限：
  - `src/services/photo-permission.ts` 已接入 `expo-media-library`，应用层不再只靠本地 `hasPhotoPermission` 布尔值判断授权状态
  - `src/store/create-app-store.ts` / `app/_layout.tsx` 已补相册权限状态同步：启动时会识别 `full / limited / denied / revoked / unknown`，并把结果收口到 store
  - `app/permission/photos.tsx` 已改为“说明页先展示，用户点击后再发起系统权限请求”的流程；请求结果绑定当前 `draftId`，授权成功沿用原草稿进入相册页，关闭或暂不允许则放弃未保存新建草稿
  - `app/permission/photos.tsx` 已补请求中锁与迟到回调保护：同一帧内重复点击“允许访问相册”只会发起一次系统请求；关闭后的旧授权结果也不会重复导航或复活已放弃草稿
  - `app/__tests__/photo-permission-screen.spec.tsx` 已补说明页先展示、授权前不发起系统请求、沿用同一草稿、暂不允许/关闭清草稿、授权不改私密状态，以及关闭后迟到授权不复活的页面级证据
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand app/__tests__/photo-permission-screen.spec.tsx`
    - `npx jest --runInBand app/__tests__/character-screen.spec.tsx src/store/__tests__/diary-domain.spec.ts -t "authorization survives a new creation and drafts preserve separate IDs|CRE-004 browse flow keeps the chosen character through permission and template steps"`

- 已推进 `CRE-002` 当前阶段真实相册选择：
  - `src/services/photo-library.ts` 已接入 `expo-media-library` 真实相册目录与照片分页读取，默认支持“全部照片”和按相册切换，不再使用固定标题加 `mockPhotos.slice(0, 20)`。
  - `package.json` / `app.json` 已将 `expo-media-library` 对齐到 Expo 57 期望的 `~57.0.5` 并补上插件配置；`src/services/photo-library.ts` 与 `src/services/photo-permission.ts` 当前都改为使用 `expo-media-library/legacy`，避免原生壳和类型入口错位。
  - `app/album/select.tsx` 已改成页面内暂存选择：新建草稿初始不再默认预选照片，只有确认后才会把当前有效资源集合原子写回同一 `draftId`。
  - `app/album/select.tsx` 又补了未保存新建草稿的整篇换图隔离：`replace` 模式下不再偷偷继承上一轮旧照片，确认写回的就是这次新挑的整套照片，不会把不可见旧照片与新照片混写到同一草稿里。
  - 选择页确认前现会调用 `validateReadableDevicePhotoIds(...)` 复核设备资源是否仍可读；第三张照片若已失效，会被从当前选择中移除并阻断成功确认，不再把失效资源当成有效门槛。
  - `src/store/create-app-store.ts` 已补 `registerPhotos(...)` 与动态照片目录版本；`src/components/diary/photo.tsx` / `src/types/diary.ts` 也已兼容设备相册 `uri/localUri`，让编辑页和详情页继续能读取真实资源 ID。
  - 选择页已补相册切换、空相册/读取失败反馈、分页继续读取与请求版本保护；旧相册或旧草稿的迟到结果不会覆盖当前相册，也不会把未确认集合写回另一份草稿，分页合并也会按照片 ID 去重。
  - `app/album/select.tsx` 进入读取前现会先调用 `getPhotoPermissionStatus()` 与原生权限状态重新对齐；原生侧若直接返回未授权，页面会回落到现有“需要相册权限”引导，不再把权限异常误记为通用读取失败。
  - `app/__tests__/album-select-screen.spec.tsx` 已补 0/1/2 张下限、新建/替换确认写回同一草稿、新建取消继续/放弃、替换取消不提交、第三张失效后阻断确认，以及旧请求不覆盖新相册结果、旧草稿迟到结果不污染新草稿、分页去重和分页失败反馈保留当前勾选的页面级证据。
  - `app/__tests__/album-select-screen.spec.tsx` / `app/__tests__/edit-screen.spec.tsx` 又补了整篇换图链路回归：未保存新建草稿在 `replace` 模式下重新挑图后，旧照片不会继续混进本轮确认集合；回到编辑页后，即便仍保持 3 张有效照片，保存也会明确提示需要重新生成并提供直达生成页入口。
  - 2026-10-15 复跑 `npx jest --runInBand app/__tests__/album-select-screen.spec.tsx`，13/13 通过；当前代码、CRE-002 任务/CASE 和四份执行台账仍一致，真实 iOS 原生权限阻塞与 Q-003/Q-018/Q-008 未决规则保持原状态。
  - 已在本地 iOS 模拟器继续推进真实验收：当前 `iPhone 17 Pro (C5C4764C-8D1B-469D-AD55-333A7A942274)` 的 dev client 能稳定复现 Metro 日志 `WARN  [album-select] load device photos failed [Error: E_NO_PERMISSIONS: undefined reason (at ExpoModulesCore/Promise.swift:65)]`；同时模拟器 TCC 库已记录 `kTCCServicePhotos|io.com.shihangbiji.www.aidiary|2|4`，说明阻塞已收窄到“模拟器权限记录与原生媒体库返回不一致”，不再是 JS 选择逻辑本身。
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand app/__tests__/album-select-screen.spec.tsx`
    - `npx jest --runInBand app/__tests__/album-select-screen.spec.tsx app/__tests__/photo-permission-screen.spec.tsx app/__tests__/character-screen.spec.tsx app/__tests__/template-screen.spec.tsx`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts`
    - `npm run typecheck`（2026-10-14 复跑）
    - `npx jest --runInBand app/__tests__/album-select-screen.spec.tsx`（2026-10-14 复跑）
    - `xcrun simctl openurl booted "exp+ai-diary-2://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8083"`
    - `xcrun simctl openurl booted "ai-diary-2://verification?scene=album"`
    - `sqlite3 "/Users/hjd/Library/Developer/CoreSimulator/Devices/C5C4764C-8D1B-469D-AD55-333A7A942274/data/Library/TCC/TCC.db" "select service,client,auth_value,auth_reason,last_modified from access where client='io.com.shihangbiji.www.aidiary' order by service;"`

- 已完成 `CRE-003` 日记类型能力收口：
  - `src/types/diary-capabilities.ts` / `src/mocks/creation.ts` 已把“可读取的历史类型”和“当前可创建类型”拆开，当前只允许 `travel` 新建
  - `app/create/template.tsx` / `src/store/create-app-store.ts` 已改为显式写入当前草稿类型；点击“旅行游记”会先更新草稿，再进入角色页，`work / emotion` 仍保持禁用
  - `src/contracts/core-diary-contract.ts` / `src/repositories/http-core-diary-repository.ts` 已补草稿类型契约校验与 `invalid_input` 错误映射，前端仓库不再把非法草稿响应当成成功
  - `backend/src/common/memory-store.service.ts` / `backend/src/modules/drafts/drafts.controller.ts` 已补新建草稿的类型能力白名单：`work / emotion / unknown` 不能作为新建类型，带 `sourceDiaryId` 的历史类型草稿同步仍可保留原类型
  - `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/template-screen.spec.tsx` / `app/__tests__/saved-diary-screens.spec.tsx` / `src/repositories/__tests__/http-core-diary-repository.spec.ts` / `backend/test/app.e2e-spec.ts` 已补旅行类型显式写入、未开放类型阻断、历史 `emotion` 作品可读、非法覆盖不破坏草稿，以及重复 `travel` 提交只复用同一草稿的回归证据
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand src/contracts/__tests__/core-diary-contract.spec.ts`
    - `npx jest --runInBand src/repositories/__tests__/http-core-diary-repository.spec.ts`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts`
    - `npx jest --runInBand app/__tests__/template-screen.spec.tsx app/__tests__/saved-diary-screens.spec.tsx`
    - `npm --prefix backend run build`
    - `npm --prefix backend run test:e2e`

- 已推进 `CRE-004` 当前阶段角色能力收口：
  - `src/types/character-capabilities.ts` 已把“支持读取的历史角色”和“当前可选择角色”拆分为显式能力契约，当前只开放 `character-blue / character-green / character-brown`
  - `src/store/create-app-store.ts` 已改为从 `availableCharacters` 读取角色目录，并在恢复本地草稿时校验 `isSupportedCharacterId(...)`；`mutateDraft(...)` 现会在角色、模板、照片等关键变更后持续同步远端草稿，避免生成前后远端仍读取旧角色
  - `src/services/character-catalog.ts` / `app/create/character.tsx` / `app/(tabs)/home.tsx` 已统一改读显式角色能力白名单；角色页补上异步目录加载、失败态提示和“重新加载”恢复路径，浏览模式角色选择也继续保留重复点击锁，同一角色快速连续点击只会创建一份草稿并推进一次
  - `backend/src/common/memory-store.service.ts` 已补角色能力校验：未知角色和未开放角色不能作为新建草稿角色写入，但带 `sourceDiaryId` 的历史隐藏角色编辑草稿仍可保留原角色
  - `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/character-screen.spec.tsx` / `backend/test/app.e2e-spec.ts` 已补角色白名单、目录失败后可见重试恢复、浏览链路保留、重复点击幂等、远端草稿同步以及真实后端拒绝非法角色的回归证据
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts -t "CRE-004"`
    - `npx jest --runInBand app/__tests__/character-screen.spec.tsx`
    - `npm --prefix backend run test:e2e -- --testNamePattern="character"`

- 已推进 `CRE-006` 当前阶段人物命名闭环：
  - `backend/src/common/diary-generation.service.ts` 已去除 deterministic provider 在“无候选”场景下伪造 `person-self` 的兜底；`src/store/diary-domain.ts` 也已改为仅消费生成结果中的 `people`，不会再从旧草稿回退候选
  - `src/store/create-app-store.ts` 已在生成完成时同步 `draft.people` 与 `draft.diary.people`，并新增 `finalizeDraftPeopleNaming(...)`；命名保存失败会保留已输入称呼并返回失败结果
  - `app/companion/naming.tsx` 已把“保存名字”收为真实保存步骤，页面加入防重入锁；保存成功进入编辑，跳过时保留候选及照片关系直接进入编辑；多同行者输入框也已按“第 1/2 位同行人的名字”收口为唯一可访问标签
  - `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/generating-screen.spec.tsx` / `app/__tests__/naming-screen.spec.tsx` / `app/__tests__/naming-screen-multiple.spec.tsx` / `app/__tests__/naming-screen-failure.spec.tsx` / `app/__tests__/naming-screen-skip.spec.tsx` / `backend/src/common/diary-generation.service.spec.ts` 已补“无候选直进编辑”“独立改名不改正文”“多同行者独立输入不串值”“空称呼回落”“写失败保留输入”“无效人物忽略”和“重复点击只触发一次保存”的前后端证据
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts app/__tests__/generating-screen.spec.tsx app/__tests__/naming-screen.spec.tsx app/__tests__/naming-screen-multiple.spec.tsx app/__tests__/naming-screen-failure.spec.tsx app/__tests__/naming-screen-skip.spec.tsx`
    - `npm --prefix backend run test -- diary-generation.service.spec.ts`

- 已推进 `DIA-006` 当前阶段真实回忆检索：
  - `backend/prisma/schema.prisma` / `backend/src/common/memory-store.service.ts` 已补地点字段持久化，统一回忆日期格式为 `YYYY.MM.DD`
  - `backend/src/modules/memories/memories.controller.ts` 已支持月份、单日、标题/摘要/地点关键词查询
  - `src/store/create-app-store.ts` 已新增回忆查询状态、筛选条件持久化、请求版本保护和按原条件重试
  - `app/(tabs)/memories.tsx` 已按当前筛选条件触发真实后端查询，不再依赖固定月份和纯本地过滤；详情返回后保留当前筛选
  - `src/store/create-app-store.ts` / `app/(tabs)/memories.tsx` 已将月份、日期标记和空态统一切到真实回忆源，真空仓库不再回退到 mock 回忆
  - `app/__tests__/memories-screen.spec.tsx` 已补月份来源、一月/二月/全部回忆结果集切换、未保存草稿不进入回忆月份或结果集、真空空态、选日关闭保留、重选月份清除单日、周条/月历日期标记、近期分组显隐、错误重试入口和详情跳转保留筛选的组件级联调证据
  - `app/(tabs)/memories.tsx` 又补了结果卡片的唯一可访问标签：普通回忆卡片改为“标题 + 日期”，最近写下的回忆分组进一步改为“刚刚写下的回忆 + 标题 + 日期”；`app/__tests__/memories-screen.spec.tsx` 已验证同标题不同 ID 的第二张卡会按第二张 `diaryId` 跳详情，最近回忆分组入口也会按正确 `diaryId` 打开，不会误跳第一张
  - `app/__tests__/memories-screen.spec.tsx` 本轮又补了跨分组同标题的路由回归：即便“刚刚写下的回忆”和普通结果列表都出现“同名回忆”，两个入口仍会按各自 `diaryId` 打开，不会跨分组串篇
  - `app/__tests__/saved-diary-screens.spec.tsx` 又补了同标题不同 ID 的详情读取证据：当回忆结果指向 `diary-2` 时，详情页会继续读取 `diary-2` 的已保存摘要与锚点提示，不会串回 `diary-1`
  - `app/__tests__/saved-diary-screens.spec.tsx` 本轮又补了详情返回回忆上下文的回归：从详情点击“返回”时，会优先走既有返回栈，且 `memoriesFilterMonth / memoriesFilterDay / memoriesSearchKeyword` 保持原值，不会因为进出详情而丢失当前筛选状态
  - `app/__tests__/saved-diary-screens.spec.tsx` 本轮继续补了无返回栈时的详情兜底：当详情页没有可回退历史时，点击“返回”会直接回到 `/(tabs)/memories`，同时仍保留进入前的月份/日期/关键词筛选状态
  - 本轮复跑 `npx jest --runInBand app/__tests__/memories-screen.spec.tsx app/__tests__/saved-diary-screens.spec.tsx` 与 `npm run typecheck` 后，已把 `CASE-DIA-006-005` 从 `partial` 推进为 `passed`：结果卡片、最近回忆入口、跨分组同标题路由，以及详情返回保留筛选状态链路都继续稳定通过
  - `src/store/__tests__/diary-domain.spec.ts` 已补回忆查询乱序保护、失败后重试、真空仓库空态和新保存作品即时入源回归测试
  - 已验证：
    - `npm run typecheck`
    - `npm run test:domain`
    - `npx jest --runInBand app/__tests__/saved-diary-screens.spec.tsx app/__tests__/memories-screen.spec.tsx`
    - `npx jest --runInBand app/__tests__/memories-screen.spec.tsx`
    - `npm --prefix backend run test:e2e`
    - `npx expo run:ios -d C5C4764C-8D1B-469D-AD55-333A7A942274 --scheme AIDiary2 --no-bundler`

- 已推进 `DIA-005` 当前阶段真实保存幂等闭环：
  - `backend/prisma/schema.prisma` / `backend/src/common/memory-store.service.ts` 已补保存幂等键记录与结果查询
  - `backend/src/modules/diaries/diaries.controller.ts` 已支持保存结果追认和来源版本冲突返回
  - `src/repositories/http-core-diary-repository.ts` 已支持保存失败结果解析与保存结果查询
  - `src/store/create-app-store.ts` / `app/diary/[id]/edit.tsx` 已改为等待远端确认后再落本地与跳转，响应丢失时按同幂等键追认保存结果，版本冲突时保留草稿且不覆盖本地已保存版本；写失败时可继续编辑或重试保存
  - `src/store/adapters/types.ts` / `src/services/draft-snapshot-storage.ts` / `src/store/create-app-store.ts` / `app/_layout.tsx` 已补未提交草稿的同设备本地恢复链路：关键写路径会持久化本地快照，应用启动时先执行 `hydrateDrafts` 恢复当前草稿，再继续原有回忆预热
  - `backend/test/app.e2e-spec.ts` 已补新建保存进入真实回忆列表、编辑保存后真实回忆列表沿用原 ID 并更新内容、列表总数不重复增加的后端串联验证
  - `src/store/create-app-store.ts` 已在放弃运行中草稿时回收远端生成任务，并补保存中放弃后的迟到成功/失败回包清理，避免已放弃草稿被重新挂回编辑态
  - `src/store/create-app-store.ts` 已将 `rewriteDraftBlock` 改为带请求令牌的异步应用，并在保存完成或放弃草稿时清理待完成重写；延迟重写结果不会复活已放弃草稿，也不会覆盖已保存原件
  - `app/__tests__/edit-screen.spec.tsx` / `app/__tests__/saved-diary-screens.spec.tsx` 已补保存失败重试、来源日记不存在回退、需要重新生成直达生成页、新建与编辑草稿返回继续保留、退出放弃清理、新建生成后放弃回首页且列表快照不变，以及保存中防重提、编辑保存成功回详情、新建保存成功直达完成页、新建保存后列表只新增一项、编辑保存不改变列表数量、少于三张有效图片时阻止保存、生成仍在进行中时阻止保存并直达生成页、完成页读取已保存标题/摘要/照片、详情页读取编辑后已保存内容和未保存结果不可作为正式日记打开的界面联调证据
  - `src/store/__tests__/diary-domain.spec.ts` 本轮又补了 `CASE-DIA-005-007` 的领域闭环：生成仍在进行中、已生成但照片不足三张、来源日记缺失三种前置失败都会显式拒绝保存，且会保留当前草稿、不改动 D2、也不残留 `savingDraftIds`
  - `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/edit-screen.spec.tsx` 已补延迟重写结果丢弃、提交后草稿冻结，以及本地草稿快照恢复/损坏隔离证据，验证编辑草稿在放弃后不会被迟到重写结果重新挂回，也不会改写已保存原件；提交成功后的草稿即使再收到本地编辑或重写，也不会改动已保存作品；未提交草稿在重建 store 后仍可恢复，损坏快照只会隔离坏记录
  - `src/repositories/__tests__/http-core-diary-repository.spec.ts` / `src/store/__tests__/diary-domain.spec.ts` / `backend/test/app.e2e-spec.ts` 已补保存幂等、响应丢失、冲突保留、等待确认、远端任务回收、保存中放弃草稿清理、延迟重写失效与提交后禁改测试
  - 已验证：
    - `npm run prisma:generate && npm run db:push`
    - `npm run typecheck`
    - `npm run test:domain`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts`
    - `npx jest --runInBand app/__tests__/edit-screen.spec.tsx`
    - `npx jest --runInBand app/__tests__/saved-diary-screens.spec.tsx`
    - `npx jest --runInBand app/__tests__/edit-screen.spec.tsx app/__tests__/saved-diary-screens.spec.tsx`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts app/__tests__/edit-screen.spec.tsx app/__tests__/saved-diary-screens.spec.tsx`
    - `npx jest --runInBand app/__tests__/edit-screen.spec.tsx app/__tests__/memories-screen.spec.tsx app/__tests__/generating-screen.spec.tsx`
    - `npx jest --runInBand app/__tests__/edit-screen.spec.tsx app/__tests__/saved-diary-screens.spec.tsx app/__tests__/memories-screen.spec.tsx app/__tests__/generating-screen.spec.tsx`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts`
    - `npx jest --runInBand src/repositories/__tests__/http-core-diary-repository.spec.ts`
    - `npm --prefix backend run test:e2e`

- 已推进 `DIA-001` 当前阶段真实日记详情读取：
  - `src/repositories/core-diary-repository.ts` / `src/repositories/http-core-diary-repository.ts` 已新增 `getDiary(...)`，前端详情页可通过真实 `/diaries/:id` 拉取单篇已保存作品。
  - `src/store/create-app-store.ts` 已新增 `readDiaryById(...)`；当本地只有回忆摘要占位或没有整篇内容时，会拉远端正式作品，并把成功结果合并回 `diaries`、`memoriesSourceItems` 与当前 `memoriesItems`。
  - `app/diary/[id]/index.tsx` 已区分“正在读取这篇日记”“没有找到这篇日记”“暂时没把这篇日记读出来”三类页面状态；读取失败支持页面内“重新加载”，不再用空白或样例内容掩盖错误。
  - `app/diary/[id]/index.tsx` 已补 `requestVersionRef` 版本保护；切换作品后，旧请求迟到返回不会覆盖当前详情。
  - `src/components/diary/diary-paper.tsx` 已补三种开放角色的布局定位点；`src/components/diary/__tests__/diary-paper.spec.tsx` 已验证 `character-blue / character-green / character-brown` 分别走默认、明信片与北欧风布局分支，同时标题、正文、引用句与照片引用仍保持属于同一篇作品。
  - `src/components/diary/photo.tsx` 已补坏图可见占位；当资源丢失或加载失败时，会显示“图片暂时不可用”，不再只剩不可辨识的纯底色占位。
  - `src/components/diary/__tests__/photo.spec.tsx` 已补图片组件与 `DiaryPaper` 证据，验证坏图时正文和引用仍继续可读。
  - `app/__tests__/saved-diary-screens.spec.tsx` 已补“回忆摘要占位自动远端补全”“单篇读取失败后可重试”“切换详情页后旧回包不覆盖当前页”三条页面级证据，并继续覆盖完成页读取已保存标题/摘要/照片、详情页读取编辑后正式内容、历史 `emotion` 作品可读，以及未保存 `draftId` 不会被误当成正式日记。
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand src/components/diary/__tests__/diary-paper.spec.tsx`
    - `npx jest --runInBand src/components/diary/__tests__/photo.spec.tsx`
    - `npx jest --runInBand app/__tests__/saved-diary-screens.spec.tsx`

- 已推进 `DIA-002` 当前阶段文字编辑与局部重写：
  - `src/contracts/core-diary-contract.ts` / `src/repositories/core-diary-repository.ts` / `src/repositories/http-core-diary-repository.ts` 已补 rewrite 请求与结果契约；仓库会把 `/generation/rewrite` 的返回按结构化 contract 校验，畸形内容不再被当成成功。
  - `backend/src/modules/generation/generation.controller.ts` / `backend/src/common/memory-store.service.ts` / `backend/src/common/diary-generation.service.ts` 已新增真实 rewrite 服务边界：后端会先校验草稿归属、版本和允许照片上下文，再交给统一 provider 生成目标块的新文本，不再由前端本地固定文案假装完成。
  - `backend/src/common/diary-generation.service.ts` 已为 `deterministic` provider 补可重复的改写实现，会基于原文、角色与照片事实生成目标段落；`openai-compatible` provider 也已走同一 JSON 契约，只允许返回当前目标块内容。
  - `src/store/create-app-store.ts` 已将 `rewriteDraftBlock(...)` 接到真实仓库方法，并补上“草稿 + 块 + 当前内容版本 + 请求 ID”的并发控制：同内容重复点击会复用在途请求，手动编辑、放弃草稿、保存完成和旧请求迟到返回都不会让过期结果覆盖新输入或已保存原件。
  - `src/store/__tests__/diary-domain.spec.ts` 已补 rewrite 作用域、失败保留原文、重复触发去重和手动输入防旧结果覆盖的领域证据；`src/contracts/__tests__/core-diary-contract.spec.ts`、`src/repositories/__tests__/http-core-diary-repository.spec.ts` 与 `backend/src/common/diary-generation.service.spec.ts` 也已补 contract、仓库和 provider 层单测。
  - `src/store/__tests__/diary-domain.spec.ts` 本轮又补了 `DIA-002` 自身的 A01/A02 专属断言：标题修改只会停留在当前工作草稿里，不会提前改写 `diary-1` 或旁边的 `diary-2`；正文目标块与引用目标块也能分别修改，未命中的正文块保持原值，已保存原件不受影响。
  - `app/diary/[id]/edit.tsx` / `app/__tests__/edit-screen.spec.tsx` 本轮又补了 `DIA-002-A06` 的页面级失败反馈：重写超时、provider 失败与畸形结果现在都会在编辑页弹出精确的中文提示，不再只把故障留在 `issueLog`；配合既有的迟到结果丢弃证据，`CASE-DIA-002-006` 已可收口为 passed。
  - `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/album-select-screen.spec.tsx` / `app/__tests__/edit-screen.spec.tsx` 本轮继续收口 `DIA-003`：在既有整篇换图与保存后重读证据基础上，又补齐了段落引用面板的页面级注入回归。当前已有引用在确认时若被判定为不可读，或可读性校验直接失败，编辑页都会阻断提交并显示中文提示；关闭引用面板也不会把暂存选择写回草稿，因此 `CASE-DIA-003-006/007` 已可从 partial 推进为 passed，当前只剩 `CASE-DIA-003-009` 受 Q-003 / Q-008 / Q-001 待决策约束。
  - `app/create/character.tsx` / `app/__tests__/character-screen.spec.tsx` / `src/store/__tests__/diary-domain.spec.ts` 本轮开始收口 `DIA-004`：更换排版师入口已确认复用同一编辑草稿并以 `preserveContent` 更新角色；本轮新增的领域回归已锁定“更换后标题/正文/段落图片引用/整篇照片集合不变、保存后仍沿用原 `diary-1`”，因此 `CASE-DIA-004-001/003/005` 已可先收口，`CASE-DIA-004-002/004` 继续保留 partial，`CASE-DIA-004-006` 仍受 Q-008 待决策约束。
  - `app/(tabs)/profile.tsx` / `app/profile/monthly.tsx` / `src/services/monthly-export.ts` / `src/store/create-app-store.ts` / `src/store/__tests__/monthly-export.spec.ts` / `app/__tests__/monthly-screen.spec.tsx` / `app/__tests__/profile-screen.spec.tsx` 本轮继续收口 `DIA-007`：个人页月度装订入口已从静态演示月份切到真实分组参数，月度装订页也已按真实已保存日记渲染月份分册、成员列表与空态；在此基础上又补齐了月度导出的运行中/成功/失败/取消状态、`AbortController` 取消、月份与成员版本快照固定，以及旧月份迟到结果的 `superseded` 忽略。页面现在会显示“取消本次导出”、失败/取消提示和跨月份覆盖提示；`CASE-DIA-007-004/005` 已可按真实代码与自动化证据收口，当前只剩真实交付文件、跨月归档和留存权限继续受 Q-011 / Q-004 / Q-001 待决策约束。
  - `app/__tests__/more-actions-screen.spec.tsx` / `app/__tests__/replace-photos-route.spec.tsx` / `src/components/navigation/__tests__/bottom-tabs.spec.ts` 本轮开始收口 `NAV-001`：详情操作菜单已验证会保留当前 `diaryId` 进入编辑/公开范围/分享，继续编辑会复用同一草稿；整篇换图辅助入口会优先复用显式 `draftId` 或现有编辑草稿，无效 `id` 不会跳错作品；底部导航离开未保存创作路径时会统一弹出“继续编辑 / 放弃”确认。结合既有 `photo-permission / album-select / naming / edit / saved-diary` 回归，当前已可把 `CASE-NAV-001-005` 收口为 passed，并把 `CASE-NAV-001-001/002/004/006` 推进到 partial；`CASE-NAV-001-003` 继续受 Q-009 约束。
  - `backend/prisma/schema.prisma` / `backend/src/common/memory-store.service.ts` / `backend/src/modules/sharing/sharing.controller.ts` / `src/repositories/http-core-diary-repository.ts` / `src/store/create-app-store.ts` 本轮继续收口 `SHR-001`：公开范围已经从前端本地闭环推进到真实仓库异步保存，`publicBlockIds` 也已正式入库；`privacy` 页的“完成”按钮现会等待 `setDiaryVisibility(...)` 真实保存成功后再返回。
  - `app/__tests__/share-privacy-screen-entry.spec.tsx` 已补 `privacy` 页入口语义：改动后直接返回不会触发 `setDiaryVisibility(...)`，无效 `diaryId` 会落到“没有找到这篇日记”空态，且 D1 / D2 都保持原值，因此 `CASE-SHR-001-003/004` 已可按页面级证据收口。
  - 同文件本轮又补了“首次打开默认私密且不自动提交”和“四种范围重开时读回已保存范围/选段”的页面级回归。
  - `backend/test/app.e2e-spec.ts` 本轮又补了新保存作品的真实读取断言，确认 `privacy` 仍为 `private` 且 `publicBlockIds` 为空；结合页面首开不自动提交，`SHR-001` 的 A01 现已可按 passed 记录，A02 继续等待更强的仓库回读链路。
  - `app/__tests__/share-privacy-screen-regression.spec.tsx` 本轮又补了 `returnTo=detail` 的成功导航回归，确认保存成功后只会 `back` 到详情，不会误跳 `/share/result`，因此 `A05` 的页面级导航反馈也前进了一步。
  - `backend/test/app.e2e-spec.ts` 本轮继续把 `SHR-001-A02` 从单一范围扩成了四种范围全覆盖：`private / anonymous / public-likes / public-comments` 现都会通过 `/api/sharing/project` 保存后，再经 `/api/diaries/:id` 真实读回，同时 D2 保持 `private` 不被串写；配合页面侧四种范围重开回显，`A02` 现已可按 passed 记录。
  - `app/__tests__/share-privacy-screen-regression.spec.tsx` 本轮继续补了默认成功保存的页面导航反馈：未传 `returnTo` 时会跳 `/share/result`，传入 `returnTo=detail` 时只会 `back` 到详情，不会串错成功路径。
  - `app/share/privacy.tsx` / `app/__tests__/share-privacy-screen-regression.spec.tsx` 本轮又补了跨页 stale-result guard：当 D1 正在保存时切到 D2，D1 的迟到成功/失败都不会再把导航或错误提示作用到 D2 当前页，`SHR-001-A05` 的页面级竞态反馈继续前进。
  - `app/__tests__/character-screen-replace.spec.tsx` 本轮新增了 `DIA-004` 的 replace 模式页面级回归：选择新排版师后会直接返回原编辑页，且同一 `draftId` 下的标题、摘要、正文块与照片集合保持不变；配合既有领域回归，`A02` 现已可按 passed 记录。
  - `app/__tests__/character-screen-replace-back.spec.tsx` 本轮继续补了 `DIA-004 A04` 的取消返回页面证据：replace 模式点击返回后会直接回到原编辑页，且原草稿角色、标题、正文块与照片集合保持不变，不会误提交角色更新，因此 `A04` 现也可按 passed 记录。
  - `app/__tests__/share-privacy-screen-regression.spec.tsx` 本轮继续补了 `SHR-001 A05` 的当前页返回矩阵：当 D1 保存挂起后切到 D2，D2 若按 `returnTo=detail` 成功保存，只会回上一页一次；若按默认路径成功保存，也只会跳一次 `/share/result`，D1 的迟到成功不会在 D2 已返回后再次触发多余导航。
  - `app/__tests__/share-privacy-screen-regression.spec.tsx` 已补失败语义：真实保存失败或保存时目标失效时，页面都会停留当前页并弹出“保存失败”提示，不会误 `back` 或 `push` 到成功路径；配合既有 `src/store/__tests__/diary-domain.spec.ts` 的失败保留旧值、防重与 D1 / D2 竞态隔离，以及 `backend/test/app.e2e-spec.ts` 的真实持久化证据，`CASE-SHR-001-005/006/007` 当前可继续按 partial 诚实推进。
  - `app/__tests__/share-privacy-screen-regression.spec.tsx` 本轮又补了“保存失败后重开仍回最后一次成功保存范围与选段”的页面回归：当 D1 已保存为 `public-likes + [block-1]`，页面内临时改成 `public-comments + [block-2]` 并触发失败后，切到其他作品再切回 D1 时，页面仍会回填最后一次成功保存的值，不会保留失败时的临时 UI 状态；配合既有目标失效、失败停留当前页、防重和 D1/D2 竞态隔离证据，`CASE-SHR-001-005/006/007` 已可按 passed 记录。
  - `src/store/diary-domain.ts` / `app/share/result.tsx` 本轮审计确认 `SHR-002` 已在当前代码中真实落地：`projectDiaryForSharing(...)` 会按 `publicBlockIds` 过滤正文、引用句、关联图片、封面与摘要，`share/result` 页则把同一个 `projected` 投影同时供海报与全文预览消费，私密场景保持整篇。
  - `app/__tests__/share-result-screen.spec.tsx` 本轮新增并复跑了 `SHR-002` 的页面级回归：已补“只选 B1 时海报与全文共用同一版选段投影”“只选无图引用句时不回退原图”“私密预览仍读整篇”，以及“公开选段从 V1 切到 V2 后，分享结果页会刷新到最新投影版本”的真实证据。
  - `src/store/__tests__/diary-domain.spec.ts` 本轮又补了 `CASE-SHR-002-005` 的专属领域断言：重复的 `block-1`、未知 ID 与图片块 ID 不会扩展公开内容，最终只保留一次合法正文块，并仍按当前选段重算 `photoIds / coverPhotoId / posterPhotoIds / summary`。配合既有“同次海报与全文读同一版投影”的页面证据，`CASE-SHR-002-005/006` 已可按 passed 记录。
  - `app/__tests__/share-privacy-screen-regression.spec.tsx` 本轮继续补上了 `SHR-002 A01` 的专属页面回归：当 `diary-1` 已保存为 `public-likes + [block-1]` 时，页面内临时改成 `public-comments + [block-2]` 并触发真实失败分支后，store 中最后一次成功保存的范围与选段不会被污染；切到其他作品再切回当前作品时，页面仍会回填最后一次成功保存的 `public-likes + [block-1]`，不会保留失败时的临时 UI 状态，因此 `CASE-SHR-002-001` 已可按 passed 记录。
  - `src/store/diary-domain.ts` / `src/components/diary/photo.tsx` / `app/share/result.tsx` 本轮开始收口 `SHR-003`：当前代码已存在匿名文本替换与基于 `faceRects` 的展示层遮挡，`projectDiaryForSharing(...)` 会把标题、副标题、摘要、地点、正文、小标题和图片说明中的姓名/别名统一替换为“同行人”，`share/result` 页则把匿名标记同时传给海报与全文里的 `Photo`。
  - `app/__tests__/share-result-screen.spec.tsx` 本轮新增了 `SHR-003` 的页面级回归：当匿名公开与“只选 B1”同时生效时，海报与全文预览都会读取匿名后的选段投影，不再显示“小林/小可”，被排除的 `B2/P2` 也不会因匿名逻辑而回退出现，因此 `CASE-SHR-003-004` 已具备真实页面证据。
  - `src/components/diary/__tests__/photo.spec.tsx` 本轮补了匿名遮挡组件回归：同一张带 `faceRects` 的照片在宽裁切和高裁切两种尺寸下都会重新计算遮挡框坐标，不会沿用固定位置；配合 `src/store/__tests__/diary-domain.spec.ts` 既有的匿名文本投影断言，`CASE-SHR-003-001` 已可按 passed 记录，并为后续真实 iOS 视觉取证打好了坐标基线。
  - `src/services/share-asset-preparation.ts` 本轮继续把 `SHR-003` 往资产链路推进了一段：匿名资产准备现在会默认输出真实 PNG 匿名衍生文件，并按 `diaryId + version + target + photoId` 隔离 key；已知人物照片若缺少 `faceRects` 会返回失败结果；坐标包含非有限值、零/负面积或完全位于图像外时会在渲染前失败，部分越界但与图像相交的区域会裁切到源图边界；渲染失败也会清理失败缓存，避免不同目标或不同内容版本串用旧结果。
  - `src/services/__tests__/share-asset-preparation.spec.ts` 本轮补上了 `A03/A05` 的服务层证据：缓存按作品/目标/版本隔离，渲染失败或不可读文件不会留下脏缓存，非法遮挡坐标会被拒绝，边缘越界坐标会裁切后遮挡，且输出 PNG 像素已遮挡、原图不被改写。`CASE-SHR-003-003` 保持已执行，`CASE-SHR-003-005/006` 仍为 partial，页面侧失败反馈不提前标记完成。
  - `app/share/result.tsx` / `app/__tests__/share-result-screen.spec.tsx` 本轮继续做了 `SHR-004` 的完成度审计，确认当前分享页已不应再记为“未开始”：海报与全文预览都真实消费 `projectDiaryForSharing(...)` 的同一份投影，无效 `diaryId` 会落空态，关闭预览会回到同一分享页且不改平台/导出记录，切换到另一篇作品后旧内容不会残留。
  - `app/__tests__/share-result-screen.spec.tsx` 本轮又补了 `SHR-004` 的三条页面回归：无效目标不回退展示其他作品、关闭预览不改分享记录，以及切换作品后页面只保留当前目标内容。基于这组证据，`CASE-SHR-004-001/002/003/004/006` 已可按 passed 记录，`A04` 则只保留真实异步读取/渲染失败反馈这部分缺口。
- `src/services/share-delivery-orchestrator.ts` 本轮开始推进 `SHR-005`，先把不依赖正式前端改动的真实交付规则收口到服务层：私密作品发起外部分享时会在任何资源准备或渠道适配器调用前被拦截；所有分享/导出动作都会先依赖 `prepareShareAssetsForDiary(...)` 准备当前投影资产；只有外部渠道或导出文件返回“已确认完成”后，才允许通过 `onConfirmed(...)` 记录平台/导出结果。
- `src/services/__tests__/share-delivery-orchestrator.spec.ts` 已补 `SHR-005` 的首批服务层证据：当前已验证私密外部分享不会误调渠道适配器、取消态不会误记成功、同一 `diaryId + version + mode` 的重复提交会复用在途操作，而不同内容版本会彼此隔离，不会把旧版本结果串写到新版本。`SHR-005` 因此从“未开始”推进到“进行中”，但页面仍停留在 `recordShareDemo(...)` 演示路径，真实文件导出与正式渠道适配器仍待后续接线。
- `src/store/create-app-store.ts` / `src/store/__tests__/diary-domain.spec.ts` 本轮继续补强 `SHR-005` 的记录层约束，新增 `confirmShareDelivery(...)`：只有 `operationId + diaryId + version + mode` 四元组匹配时，才允许把确认事件写回平台/导出记录；同一操作 ID 的重复确认只记一次，旧版本或错目标的晚到回调会被直接拒绝。这样页面后续从 `recordShareDemo(...)` 切到正式交付编排时，底层已具备防重复与防串写的真实领域证据。
- `src/services/share-export-file-service.ts` 本轮继续把 `SHR-005` 往真实本地导出推进：新增了服务层真实文件渲染器，并已接到 `share-delivery-orchestrator` 的默认本地导出分支。当前 `save` 会生成真实 PNG 文件，`pdf` 会生成结构有效且含作品内容字节的 PDF 文件；输出路径按 `diaryId + version + operationId + mode` 隔离，不会覆盖其他作品或内容版本，也不会改写原日记。PDF 已改用 `STSong-Light` / `UniGB-UCS2-H` CJK Type0 字体映射，不捆绑字体资源；macOS Quick Look 实际预览已确认中文可读。PNG 仍是“已准备图片拼贴 + 结构化内容骨架”的服务层拼版输出；`CASE-SHR-005-002` 继续 partial，待 Q-014 最终版式、iOS 保存/打开及跨阅读器兼容验证。
  - `src/store/__tests__/diary-domain.spec.ts` 本轮继续补了 A05 的专属闭环：同一篇日记第一次编辑后放弃会恢复原始快照且列表数量不变；第二次重新编辑后提交保存，会沿用原 `diary-1` 更新标题与正文，不新增列表项，也不会串改别的已保存作品。
  - `app/diary/[id]/edit.tsx` / `app/__tests__/edit-screen.spec.tsx` 又补了 A04 页面级证据：日记 ID 不存在时会直接落到“没有找到这篇日记”空态；没有正文/引用块时，“重写本段”会禁用并展示“当前没有可重写的文字段落”；预选中的目标块失效后，也会展示“当前选中的段落已失效，请重新点选需要重写的文字。”，并保持禁用，不会误作用到其他段落。
  - `src/store/__tests__/diary-domain.spec.ts` / `src/repositories/__tests__/http-core-diary-repository.spec.ts` / `backend/src/common/diary-generation.service.spec.ts` 本轮又补了 A06 的超时与畸形输出矩阵：rewrite 返回 `timeout` 或仓库因畸形 payload 收口为 `provider_failed` 时，目标段落仍保留原文，`issueLog` 会记录对应错误；`openai-compatible` rewrite 请求的 `AbortError` 也已确认会被后端归类为可重试 `timeout`。
  - 已验证：
    - `npm run typecheck`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts -t "rewrite timeout keeps the original text and records the timeout message|malformed rewrite output keeps the original text and records the contract error"`
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts app/__tests__/edit-screen.spec.tsx`
    - `npx jest --runInBand src/contracts/__tests__/core-diary-contract.spec.ts src/repositories/__tests__/http-core-diary-repository.spec.ts`
    - `npx jest --runInBand src/repositories/__tests__/http-core-diary-repository.spec.ts -t "rejects malformed rewrite payload from backend"`
    - `npm --prefix backend run test -- --runInBand src/common/diary-generation.service.spec.ts`
    - `npm --prefix backend run build`
    - `npx jest --runInBand app/__tests__/edit-screen.spec.tsx`
    - `npx jest --runInBand app/__tests__/more-actions-screen.spec.tsx app/__tests__/replace-photos-route.spec.tsx src/components/navigation/__tests__/bottom-tabs.spec.ts app/__tests__/album-select-screen.spec.tsx app/__tests__/edit-screen.spec.tsx`（2026-10-14 新增）
    - `npx jest --runInBand app/__tests__/saved-diary-screens.spec.tsx app/__tests__/photo-permission-screen.spec.tsx app/__tests__/naming-screen.spec.tsx app/__tests__/naming-screen-skip.spec.tsx app/__tests__/naming-screen-failure.spec.tsx app/__tests__/naming-screen-multiple.spec.tsx`（2026-10-14 新增）
    - `npm run typecheck`（2026-10-14 复跑，NAV-001）
    - `npx jest --runInBand src/store/__tests__/share-guard.spec.ts`（2026-10-14 新增，SHR-001）
    - `npx jest --runInBand app/__tests__/more-actions-screen.spec.tsx`（2026-10-14 复跑，SHR-001）
    - `npx jest --runInBand app/__tests__/share-privacy-screen-entry.spec.tsx app/__tests__/share-privacy-screen-regression.spec.tsx`（2026-10-14 新增，SHR-001 页面级回归）
    - `npx jest --runInBand app/__tests__/share-privacy-screen-entry.spec.tsx`（2026-10-14 复跑，SHR-001 A01/A02 页面回归）
    - `npm --prefix backend run test:e2e -- --testNamePattern="supports draft create/save/memories flow"`（2026-10-14 新增，SHR-001 A01 后端默认私密）
    - `npm --prefix backend run test:e2e -- --testNamePattern="persists diary visibility and selected public blocks through the sharing endpoint"`（2026-10-14 复跑，SHR-001 A02 四范围真实读回）
    - `npx jest --runInBand app/__tests__/share-privacy-screen-regression.spec.tsx`（2026-10-14 复跑，SHR-001 A05 成功导航反馈）
    - `npx jest --runInBand app/__tests__/share-privacy-screen-regression.spec.tsx`（2026-10-14 复跑，SHR-001 A05 跨页迟到结果保护）
    - `npx jest --runInBand app/__tests__/character-screen.spec.tsx app/__tests__/character-screen-replace.spec.tsx`（2026-10-14 复跑，DIA-004 replace 模式页面回归）
    - `npx jest --runInBand app/__tests__/character-screen-replace.spec.tsx app/__tests__/character-screen-replace-back.spec.tsx`（2026-10-14 复跑，DIA-004 replace 模式返回保护）
    - `npx jest --runInBand app/__tests__/share-privacy-screen-regression.spec.tsx`（2026-10-14 复跑，SHR-001 当前页返回矩阵）
    - `npx jest --runInBand src/repositories/__tests__/http-core-diary-repository.spec.ts`（2026-10-14 新增，SHR-001 真实仓库）
    - `npx jest --runInBand src/store/__tests__/share-guard.spec.ts src/store/__tests__/diary-domain.spec.ts -t "SHR-001|E11 CASE-BAS-004-002"`（2026-10-14 新增，SHR-001 异步保存/竞态）
    - `npm --prefix backend run prisma:generate`（2026-10-14 新增，SHR-001）
    - `npm --prefix backend run db:push`（2026-10-14 新增，SHR-001）
    - `npm --prefix backend run test:e2e -- --testNamePattern="persists diary visibility and selected public blocks through the sharing endpoint"`（2026-10-14 新增，SHR-001）
    - `npx jest --runInBand app/__tests__/share-result-screen.spec.tsx`（2026-10-14 新增，SHR-002 页面投影）
    - `npx jest --runInBand src/store/__tests__/share-guard.spec.ts src/store/__tests__/diary-domain.spec.ts -t "E11 CASE-BAS-004-002 all four privacy settings save atomically; empty public selection is rejected|E12 CASE-BAS-004-005 selection projection removes excluded paragraphs, photos, cover and summary|E14 CASE-BAS-004-005 private preview remains whole; platform shares and exports use separate history"`（2026-10-14 新增，SHR-002 原子拒绝与投影规则）
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts app/__tests__/share-result-screen.spec.tsx`（2026-10-14 复跑，SHR-002 A05 归一化与最新投影）
    - `npx jest --runInBand app/__tests__/share-privacy-screen-regression.spec.tsx`（2026-10-14 新增，SHR-002 A01 失败后重开回旧值）
    - `npx jest --runInBand app/__tests__/monthly-screen.spec.tsx src/store/__tests__/monthly-export.spec.ts`（2026-10-14 新增，DIA-007 A05 页面反馈与导出状态机）
    - `npm run typecheck`（2026-10-14 复跑，DIA-007 A05）
    - `npm run typecheck`（2026-10-14 复跑，SHR-002）
    - `npx jest --runInBand app/__tests__/share-result-screen.spec.tsx`（2026-10-14 复跑，SHR-003 匿名 + 选段组合）
    - `npx jest --runInBand src/components/diary/__tests__/photo.spec.tsx src/store/__tests__/diary-domain.spec.ts -t "aligns anonymous face masks for a wide cropped photo|realigns anonymous face masks when the crop size changes|E13 CASE-BAS-004-005 anonymous projection redacts companion names including captions and retains face metadata"`（2026-10-14 新增，SHR-003 文本匿名与遮挡坐标）
    - `npm run typecheck`（2026-10-14 复跑，SHR-003）
    - `npx jest --runInBand src/services/__tests__/share-asset-preparation.spec.ts app/__tests__/share-result-screen.spec.tsx`（2026-10-14 新增，SHR-003 匿名资产准备与失败阻断）
    - `npm run typecheck`（2026-10-14 复跑，SHR-003 匿名资产准备）
    - `npx jest --runInBand src/services/__tests__/share-asset-preparation.spec.ts`（2026-10-14 复跑，SHR-003 不可读匿名文件与跨作品缓存隔离）
    - `npm run typecheck`（2026-10-14 复跑，SHR-003 服务层补强）
    - `npx jest --runInBand src/services/__tests__/share-asset-preparation.spec.ts`（2026-10-14 复跑，SHR-003 真实 PNG 匿名资产与原图保持不变）
    - `npm run typecheck`（2026-10-14 复跑，SHR-003 PNG 匿名资产）
    - `npx jest --runInBand app/__tests__/share-result-screen.spec.tsx`（2026-10-14 复跑，SHR-004 海报/预览空态与目标切换）
    - `npm run typecheck`（2026-10-14 复跑，SHR-004）
    - `npx jest --runInBand src/services/__tests__/share-delivery-orchestrator.spec.ts`（2026-10-14 新增，SHR-005 分享交付编排）
    - `npm run typecheck`（2026-10-14 复跑，SHR-005）
    - `npx jest --runInBand src/store/__tests__/diary-domain.spec.ts -t "SHR-005|E14 CASE-BAS-004-005 private preview remains whole; platform shares and exports use separate history"`（2026-10-14 新增，SHR-005 确认事件去重与错版本拦截）
    - `npm run typecheck`（2026-10-14 复跑，SHR-005 store 记录层）
      - `npx jest --runInBand src/services/__tests__/share-export-file-service.spec.ts`（2026-10-14 新增，SHR-005 真实 PNG/PDF 文件导出）
      - `npx jest --runInBand src/services/__tests__/share-delivery-orchestrator.spec.ts`（2026-10-14 复跑，SHR-005 默认导出适配器接线）
      - `npm run typecheck`（2026-10-14 复跑，SHR-005 文件导出服务接线）
    - `npx jest --runInBand src/services/__tests__/share-asset-preparation.spec.ts src/services/__tests__/share-delivery-orchestrator.spec.ts src/services/__tests__/share-export-file-service.spec.ts src/store/__tests__/diary-domain.spec.ts app/__tests__/share-result-screen.spec.tsx`（2026-10-15 复跑，5 个套件、103 项通过）
    - `npx jest --runInBand src/services/__tests__/share-asset-preparation.spec.ts`（2026-10-15 复跑，10 项通过，含无效坐标阻断与边界裁切像素验证）
    - `npm run typecheck`（2026-10-15 复跑，SHR-003 人脸区域校验）
    - `qlmanage -t -s 800 -o /tmp <测试生成的 SHR-005 PDF>`（2026-10-15，CJK 字体修复后实际预览确认中文标题/正文/匿名标记可读；iOS 与跨阅读器仍待验证）

### 下一步

- 继续补 `CRE-005` 的真实 AI 适配器、正式重试覆盖策略与质量评测。
- 在 `SHR-003` 中继续补真实导出链路：当前已完成文本匿名、匿名 + 选段组合、真实 PNG 匿名资产、失败阻断、不可读匿名文件拦截，以及作品/目标/版本缓存隔离；后续还需补不扩展正式页面前提下的真实 iOS 视觉验收和导出链路闭环，再继续推进 A02/A05。
- 在 `SHR-004` 中继续补真实异步读取/渲染失败语义：当前已完成统一投影海报、全文预览、无效目标空态与切换目标不残留旧内容；后续还需补真实加载/失败反馈与二维码面板 CASE，并与 `SHR-005` 的正式导出链路一起收口分享交付闭环。
- 在 `SHR-005` 中继续把页面从 `recordShareDemo(...)` 演示路径切到正式交付编排；当前服务层和领域层已补齐私密拦截、真实 PNG/PDF 文件生成、确认后记记录、取消不误记成功、操作 ID 去重，以及按目标/版本隔离的写回保护，下一步需结合 Q-014 收口最终文件规格、iOS 系统保存/打开矩阵与正式渠道适配器契约，再补页面接线和外部平台调用证据。
- `DIA-004` 当前仅剩 `CASE-DIA-004-006` 受 Q-008 待决策约束；现有 A01~A04 已按当前代码与测试证据收口。
- 在 `NAV-001` 中继续补冷启动/深链、页面映射整表核验与权限恢复矩阵；详情正式菜单路径仍等 Q-009 决策后再收口。
- 在 Q-002 / Q-003 / Q-008 收口后，把 `DIA-002` 的编辑矩阵延伸到真实重写质量、文本边界与候选采用联调。
- 在 `NAV-001 / Q-009`、`GRW-003/004` 收口后，继续补 `DIA-001` 的公开设置往返与锚点入口证据；真实设备上的坏 URI 注入也仍待补齐。
- 在 Q-004 收口后，继续补 `DIA-006` 的跨日/月归属与近期分组筛选规则验证。
- 在 Q-001 / Q-008 规则收口后，补回 `DIA-005` 的重启恢复与既有换图待决策 CASE。
  - `app/__tests__/edit-screen.spec.tsx` 本轮又补了 `DIA-005-003` 的显式保护证据：编辑草稿点击返回后选择“继续编辑”，会保留当前草稿改动、不导航离开、不发起 `submitDraft`，且已保存原件保持不变；对应 CASE 已从 `partial` 推进为 `passed`。
- 持续同步任务状态、CASE 与验收矩阵。

## 2026-10-15 增量推进

- `MAT-001` 当前仍无真实素材导入页面接线；本轮在不改变正式页面行为的前提下修复 store 资产目录隔离：`registerPhotos(...)` 不再原地修改外部/全局照片数组，目录作为每个 store 的状态独立更新；新照片对象及 `personIds/faceRects` 会复制到当前 store；selector 与 `addMaterialPhoto(...)` 读取当前 store 注册资产。
- `src/store/__tests__/diary-domain.spec.ts` 新增回归：非 mock 设备照片注册后可被所属 store 解析并进入素材成员集合，重复添加只留一项，未注册 ID 被忽略，调用方后续修改输入对象不会反向污染 store，第二个 store 与全局 mock 照片均不受影响。该证据只覆盖内存资产注册，不宣称真实导入完成。
- 已验证：定向 domain 用例通过、`npm run test:domain`（3 个 suite / 87 项通过）、`npx jest --runInBand app/__tests__/album-select-screen.spec.tsx app/__tests__/edit-screen.spec.tsx src/components/diary/__tests__/photo.spec.tsx src/components/diary/__tests__/diary-paper.spec.tsx app/__tests__/saved-diary-screens.spec.tsx`（5 个 suite / 55 项通过）、`npm run typecheck` 通过。真实导入、URI 持久化、素材页预览和跨模块设备资产读取仍待后续推进。
- `BAS-004-A03` 新增 `src/test-utils/fakes/create-async-fault-plan.ts`，可按脚本注入 resolve、reject、deferred 三种异步结果，并显式报错于脚本耗尽。`src/store/__tests__/diary-domain.spec.ts` 新增 `E15 CASE-BAS-004-003`：首次保存写入失败后，草稿和已保存列表快照不变、saving 状态清理；同幂等键重试延迟成功后只新增一篇作品。该条记录初次只覆盖保存路径，后续 fault matrix 见下方收口记录。
- 已验证：`npx jest --runInBand src/test-utils/fakes/create-async-fault-plan.spec.ts`（3 项通过）、`npm run test:domain`（3 个 suite / 88 项通过）、`npm run typecheck` 通过。
- `BAS-004-A03` / `CRE-002-A05` 撤权故障补证：`src/services/__tests__/photo-library.spec.ts` 用共享 fault plan 注入逐张 `getAssetInfoAsync` 中途 `E_NO_PERMISSIONS`，验证撤权后的照片进入 `invalidIds`；与 `app/__tests__/album-select-screen.spec.tsx` 既有失效照片门禁用例合并核对，确认不足三张时不写回草稿、不导航。验证命令：`npx jest --runInBand src/services/__tests__/photo-library.spec.ts`（1 项）、`npx jest --runInBand app/__tests__/album-select-screen.spec.tsx`（13 项）、`npm run typecheck` 均通过；这不是实机撤权证据，CRE-002 仍因模拟器原生异常保持 partial。
- `BAS-004-A03` / `SHR-005-A05` 文件写失败补证：`share-export-file-service` 接入可替换的 writer 依赖，`createAsyncFaultPlan(...)` 注入磁盘写入异常后返回 `delivery_failed`；真实交付编排层验证不会调用 `onConfirmed(...)`，日记导出历史保持不变。验证：`npx jest --runInBand src/services/__tests__/share-export-file-service.spec.ts`（3 项）、`npx jest --runInBand src/services/__tests__/share-delivery-orchestrator.spec.ts`（5 项）、`npm run typecheck` 通过。当前仅为确定性 writer 故障，iOS 文件权限/系统出口与真实渠道仍待补。
- `CASE-BAS-004-003` 最终收口为 passed：除保存失败、照片撤权与文件 writer 拒绝外，E03 迟到/乱序生成结果不会复活旧轮次，暂停后才返回的远端 `jobId` 会立即取消；这几类故障均断言了草稿、日记、导航/确认或远端任务状态，不只检查 mock 调用。验证：`npm run test:domain`（3 suites / 88 项）、fault plan 单测 3 项、photo/export/orchestrator 服务套件 9 项、相册页面 13 项及 `npm run typecheck` 通过。真实 iOS 撤权和系统文件出口继续由 CRE-002 / SHR-005 独立追踪，不再作为该确定性 CASE 的未完成项。
- `DIA-005-A07` 并发版本保护补强：后端保存事务现按设备、作品 ID 和来源版本执行条件更新，旧版本并发提交只有一个可以成功；编辑后的作品版本按来源版本递增，保存命令记录实际保存版本。store 本地保存、远端提交及恢复路径使用同一版本值；同一编辑命令的并发重试会归并到同一保存结果。
- 验证：定向 backend e2e 覆盖并发旧版本冲突、同键并发重试、编辑版本递增、顺序重试和陈旧版本拒绝（5 项通过）；完整 backend e2e（35 项）、backend build、`npm run typecheck`、`npm run test:domain`（88 项）、编辑/详情页面套件（37 项）通过。Q-001/Q-008 的 CASE-DIA-005-010 仍待决策，未据此关闭。
- `DIA-005-A05` 幂等响应稳定性补强：旧保存命令在作品后续编辑后重放，之前会错误返回当前作品版本和后续草稿 ID；保存接口现统一返回 `SaveCommand` 持久化的原始 `draftId/savedVersion`，与查询保存结果接口一致。新增 MySQL e2e 先保存、再编辑、最后重放旧键，验证旧命令仍返回版本 1、作品详情保持版本 2。
- 最新验证：`npm --prefix backend run test:e2e`（36 项）、`npm --prefix backend run build`、`npm run typecheck`、`npm run test:domain`（88 项）、编辑/详情页面回归（37 项）通过；CRE-002 相册页面与照片服务回归 14 项通过。`CASE-DIA-005-010` 及 provider/日期/iOS 环境 blocker 仍保持未决。
- DIA-005 的同步 `saveDraft` 本地写旁路已移除；兼容 action 改为等待 `submitDraft` 的远端确认或幂等追认，错误时不会预先更新已保存作品。`updateDiaryText` 也等待相同保存结果。新增 deferred domain 回归验证仓库响应前本地作品与 `savedDiaryId` 不变，失败路径保持草稿与原作品。
- BAS-004 旧领域 runner 已支持异步 CASE 顺序执行、每例前重置 store，并能反向运行；更新 E01 旧夹具，断言新草稿初始无选图、显式选 12 张后验证选择/取消。`node tools/run-domain-tests.js` 与 `DIARY_DOMAIN_TEST_ORDER=reverse node tools/run-domain-tests.js` 均 15/15 通过。
- 最新复验：`npm run typecheck`、`npm run test:domain`（92 项）、定向 `saveDraft` 远端确认/失败/响应丢失测试通过。DIA-005 的 Q-001/Q-008 与 CRE-005/DIA-006 的外部或待决规则未变。
- 全量前端回归：`npm test`（35 suites / 283 项）通过；编辑/详情相关的 React Native 测试仍输出已有 `act()` 环境告警，但无失败。旧领域 runner 正常与反向顺序各 15/15 通过。
- BAS-003-A03 启动失败隔离：`hydrateDrafts()` 遇到本地快照 load/clear/rewrite 错误现会记录问题并结束 hydration，不清空/覆写快照或中断后续 `hydrateMemories()`；恢复完成前新建草稿不覆盖磁盘旧快照，恢复完成后合并写回。定向快照 CASE 6 项、`npm run test:domain`（92 项）、`npm test`（35 suites / 283 项）及 typecheck 通过。A03 整体验收仍为 in progress：当前 `hybrid-dev` 默认 store 含 mock diaries，尚无正式空身份与显式演示数据隔离边界，未改变首页/统计 UI。
- BAS-002-A03 设备身份入口隔离：`backend/src/common/device-identity.ts` 现拒绝缺失、空字符串和空白 `x-device-id`，统一返回不可重试 `device_identity_required`，不再把无身份请求归到共享 `device-anonymous`。新增 resolver 单测及后端 e2e：先以旧共享 ID 创建草稿，再确认省略或发送空白身份头都无法列出该草稿，也不能从 `/api/identity/me` 获得默认身份。验证：身份单测 4/4、完整 `npm --prefix backend run test:e2e` 37/37、backend build、`npm run typecheck` 通过。公开投影、完整对象权限矩阵及 Q-012 正式身份边界仍未收口，BAS-002-A03 保持 partial。
- SHR-001/SHR-002 后端选段输入 fail-closed：`MemoryStoreService.updateDiaryVisibility(...)` 现限制四种合法隐私范围；非私密范围缺少 `publicBlockIds`、列表为空或清洗后为空均返回 `invalid_input`，无效隐私值也会拒绝；跨设备改范围返回 `permission_denied`。随 `DIA-005` 正文快照持久化完成后，sharing e2e 也验证选段 ID 必须匹配持久化文本/引用块，未知及图片 block ID 被拒绝。完整内容投影尚未接入后端公开读取 API。
- DIA-005/BAS-003 保存正文快照：保存 API 现在必须提交完整 `contentSnapshot`，Prisma `Diary` 将正文/引用/图片块、角色/人物、封面和海报引用与元数据原子持久化；详情与回忆列表真实读回同一快照，前端 store 不再把摘要合成占位正文，metadata-only 历史记录保持空 blocks，详情合同拒绝缺失/畸形快照。服务端校验 block 唯一性、关联目标及所有照片引用均属于作品 `photoIds`；SHR 范围更新按持久快照只允许文本/引用 block，拒绝未知 ID 与图片 block。验证：完整 Jest 35 suites / 288 项，domain 94 项，backend unit 4 suites / 50 项，backend e2e 38 项，CRE-002 定向 14 项，typecheck、backend build、Prisma generate/db push 通过。历史 metadata-only 作品迁移、真实公开内容读取接口仍未完成。
- 2026-10-15 补充 BAS-003-A04：新增真实 MySQL 事务失败回滚 CASE。e2e 让 `Diary.create` 在事务内执行后，注入后续 `SaveCommand.create` 异常；验证作品与保存命令均未留下、保存结果查无记录、原草稿保留，再移除注入用相同幂等键重试并只产生一篇完整作品。注入只在测试回调中生效，不增加正式服务 failpoint。验证：`npm --prefix backend run test:e2e`（39/39）、`npm --prefix backend run build` 通过；`CASE-BAS-003-004` 从 partial 收口为 passed。BAS-003 整体仍进行中。
- 2026-10-15 补充 BAS-003-A05 快照版本降级保护：`hydrateDrafts()` 发现合法整数但当前不支持的 snapshot version 时保留原数据、不清理，并禁用本次运行的后续快照写入；新增版本 2 回归验证恢复阶段和后续创建草稿都不会覆盖原快照。验证：定向 store CASE 1 项、`npm run test:domain`（3 suites / 95 项）、完整 `npm test`（35 suites / 289 项）和 `npm run typecheck` 通过。此保护不等同于旧格式迁移，CASE-BAS-003-005 继续 partial。
- 2026-10-15 补充 BAS-003-A05 Prisma migration：新增 `20261015000000_initial_schema` 四表基线和 `20261015001000_diary_content_snapshot` nullable column migration，增加 `migrate:deploy` 与隔离验证脚本。`npm --prefix backend run test:migrations` 使用两个临时 MySQL schema，验证全新部署全部 migration；同时从不含正文列的旧 schema 预置 legacy 日记、标记已应用基线后升级，确认 ID/title/summary 保留、新列为 NULL 且最终 schema 无 drift。验证库在脚本退出时清理；现有 `ai_diary` 未被触碰。baseline adoption、legacy 正文回填和数据库损坏恢复仍待完成，A05 保持 partial。
- 2026-10-15 补充 BAS-003-A05 baseline adoption tooling：新增 `backend/scripts/baseline-prisma-migrations.ts` 与 `migrate:baseline` 命令，要求显式 `--confirm-current-schema-is-final`；先核验 datamodel 无 drift、history 是已知连续前缀，之后只通过 `migrate resolve` 写 migration metadata。migration verifier 另外覆盖：旧 schema 有 drift 时命令拒绝且不创建 `_prisma_migrations`；当前 schema 完全匹配时两条 migration 被标记、`migrate status` up-to-date、既有日记保持不变。`npm --prefix backend run test:migrations` 通过。工具未在现有 `ai_diary` 上执行，仍需备份和审阅后由操作方明确调用。
- 2026-10-15 补充 baseline guard 回归：临时库验证无 `--confirm-current-schema-is-final` 时拒绝且不写 migration history；已有一个成功 migration 的合法连续前缀可安全续记剩余迁移；未知/失败/断裂 history 由工具拒绝。`npm --prefix backend run test:migrations` 全部路径通过，现有 `ai_diary` 未执行 baseline。
- baseline adoption final regression：`npm --prefix backend run test:migrations` 重新通过三条路径：clean deployment、旧 schema drift 拒绝且不写 migration history、完整当前 schema 经显式确认后 baseline 并保留日记数据。CRE-002 定向回归 14/14、backend e2e 39/39、backend unit 50/50 和 backend build 通过；baseline 工具仍未在现有 `ai_diary` 执行。
- 2026-10-15 本地数据库 baseline 实际接入：只读 `prisma migrate diff --exit-code` 确认 `ai_diary` 无 drift，并确认没有既有 `_prisma_migrations` 后，使用带 `--confirm-current-schema-is-final` 的 `migrate:baseline` 登记两条 migration。执行前后 `Diary` 行数均为 2；复查 `migrate status` 为 up-to-date，schema diff 仍无差异。该操作只写 migration metadata；生产或其他数据库未触碰。此前“未应用当前库”的记录描述的是执行前状态。

## 2026-10-15 BAS-004-A01 隔离集成验收

- 审计发现旧 `backend` `test:e2e` npm script 把 `DATABASE_URL` 固定到开发库 `ai_diary`，而 `backend/test/app.e2e-spec.ts` 的 `beforeEach` 会删除 `GenerationJob`、`SaveCommand`、`Diary` 与 `Draft`。本轮没有在开发库运行该危险脚本。
- 新增 `backend/src/scripts/run-e2e-tests.ts` 与安全守卫单测；`test:e2e` 现在必须显式提供 `E2E_DATABASE_URL`，只接受本机 MySQL 的 `ai_diary_test_*` / `ai_diary_e2e_*` schema。缺少隔离 URL 时返回退出码 2，不连接数据库；一次性故意失败断言通过该入口返回退出码 1，探针运行后已移除。
- 在新建的 `ai_diary_e2e_20261015_agent01` 临时 schema 上部署两条 Prisma migrations，并以 `E2E_DATABASE_URL=<isolated-local-url> npm --prefix backend run test:e2e` 执行完整 backend e2e（39/39）。随后删除该临时 schema；复查确认该 schema 已不存在，原开发库 `ai_diary.Diary` 仍有 2 条记录。
- 验证：`npm --prefix backend run test -- run-e2e-tests.spec.ts`（3/3）、`npm --prefix backend run build`、`E2E_DATABASE_URL` 缺失时安全拒绝（exit 2）、隔离 backend e2e（39/39）、故意失败断言探针（exit 1）、`npm test`（35 suites / 289 项）与 `npm run typecheck` 通过。BAS-004-A01 与 CASE-BAS-004-001 已收口；CRE-002 的 iOS 原生权限环境异常仍由其业务 CASE 独立跟踪。

## 2026-10-15 BAS-002-A04 与 DIA-005 transport failure 收口

- `src/services/api-client.ts` 新增统一 JSON transport：默认超时 15 秒，可在 client 或单次请求覆盖；超时计时覆盖 header 解析、fetch 与 JSON body 读取；支持 `AbortSignal`，并把 timeout、主动 cancelled、网络失败与畸形 JSON 区分为契约错误。`HttpCoreDiaryRepository` 的所有 fetch 路径现统一经过该入口，保留 `x-device-id`，不自动重放写请求。
- 不确定的 generation job 建单结果没有 `jobId` 时，现有手动重试会复用同一个 generation round/idempotency key；已知 job 终态失败仍走原有新轮次。DIA-005 保存请求若 repository 返回 retryable timeout/provider failure，store 会按首次幂等键查询 `SaveCommand` 结果；已提交时追认同一作品，无结果时保留草稿且不自动重发。
- 新增服务/repository 回归：API 超时、响应体读取超时、AbortSignal cancel、network error 与 malformed JSON；domain 回归覆盖建单同键恢复和“saveDiary 返回 timeout 但 getSaveResult 已有记录”的追认路径。定向 API/repository tests 3 suites / 30 项通过，建单/保存恢复 domain CASE 2 项通过。
- 验证：`npm test -- --silent`（37 suites / 298 项）、`npm run typecheck`、`npm --prefix backend run build`、isolated MySQL backend e2e（39/39）通过；临时 schema 清理后开发库 `Diary` 仍为 2 行。未调用真实 AI provider，未改正式 UI/UX。
- 当前进度按 coverage 有效总数 225 与验收矩阵明确 passed 项重算：89/225 = 39.555...%，四舍五入为 **39.6%**（2026-10-15；partial/blocked/pending 均不计）。BAS-002-A04 从进行中转为通过；A02/A03/A05 与 DIA-005 的 Q-001/Q-008 仍未闭环。
- 同步修正初始基线说明：README/coverage 中“245 条 CASE 未执行”和 BAS-001/BAS-004 初始状态注明为 2026-10-13 的登记快照，当前状态指向验收矩阵/执行快照；execution-context 现反映仓库已有本地 NestJS/Prisma/MySQL 与部分真实服务链路，生产后端/provider/平台集成仍未交付。AGENTS 中的项目阶段说明也更新为 mock 与 service-backed flows 并存。
- BAS-002-A02 客户端密钥边界部分实证：新增 `tools/verify-client-bundle-secrets.js` / `tools/verify-client-bundle-secrets.test.js` 与 `npm run test:client-secret-boundary`（3/3）；一次性非真实 `AI_PROVIDER_API_KEY` canary 执行 Expo iOS export（JS bundle 4.4 MB），扫描器检查 102 个导出文件无匹配。`backend/.env` 不存在；未调用 provider，真实后端凭据调用、请求/响应与日志检查仍待用户提供隔离测试凭据/环境，A02 未计通过。

## 2026-10-15 MAT-001-A02 搜索验收

- `app/library/index.tsx` 的素材列表现按 store 注册的照片目录解析 `materialPhotoIds`，缩略图/预览图片源兼容本地 URI；既有样例照片仍使用打包资源，正式页面布局与交互未改变。
- 新增 `app/__tests__/library-screen-search.spec.tsx`，注册三个非 mock `source: 'device'` 照片 fixture，验证标题片段命中 P1、地点片段返回 P1/P3、无匹配显示空态，以及清除查询后恢复 P1/P2/P3。
- 验证：`npx jest --runInBand app/__tests__/library-screen-search.spec.tsx`（1/1）与 `npm run typecheck` 通过。矩阵通过数从 89 增至 90；coverage 分母仍为 225，当前为 90/225 = 40.0%。
- 测试使用 store 注册的 `file://` 资产 fixture，不访问真实 iOS 媒体库；真实设备导入、权限矩阵、URI 可读性/留存和跨模块读取继续按独立 CASE 阻塞/跳过，不以本次搜索回归代替。
- MAT-001-A05 consumer 接线增量：素材页、日记 `Photo` 组件和明信片页现均从 store 注册的照片目录解析非 mock 设备照片；明信片素材参数不再限定 `mockPhotos` ID，图片源可使用本地 URI，切换到预设明信片的现有交互保持不变。
- 三处 consumer 回归使用同一个 `file://` URI 形式的非 mock 设备照片 fixture，验证素材列表、日记图片组件和明信片页都解析到该 URI；这是 store/catalog 消费证据，不是媒体库导入或实际文件可读性验证，CASE-MAT-001-006 继续 partial。
- 增量验证：`npx jest --runInBand app/__tests__/library-screen-search.spec.tsx app/__tests__/postcard-screen-assets.spec.tsx src/components/diary/__tests__/photo.spec.tsx`（3 suites / 8 tests）、完整 `npm test -- --silent`（39 suites / 302 tests）及 `npm run typecheck` 均通过。

## 2026-10-15 MAT-001-A03 预览状态部分验收

- 素材页确定性页面回归新增：注册照片的预览 image source 保持同一 file URI；关闭预览后返回素材列表；“未生成日记”标记只根据当前已保存日记的 `photoIds` 判断，并在 store 引用更新后同步变化。
- `npx jest --runInBand app/__tests__/library-screen-search.spec.tsx`（2/2）、`npm test -- --silent`（39 suites / 302 tests）与 `npm run typecheck` 通过。fixture 未读取真实设备文件，也未执行真实保存提交或设备导入；CASE-MAT-001-003 仍为 partial，相关真实资源验证列为阻塞后跳过。

## 2026-10-15 MAT-003 装饰预览和关闭验收

- 新增 `app/__tests__/library-screen-decorations.spec.tsx`，逐项验证五种贴纸和三种城市印章的预览名称/资源映射一致，关闭预览返回素材页且不改日记、草稿、素材成员、照片选择或导航状态。A01、A03 可按当前页面证据通过。
- 额外验证京都印章以稳定 ID `stampKyoto` 传入 `/postcard`；`app/postcard` 页面回归进一步验证卡片预览读取 `art.stampKyoto`。真实生成结果资产仍未产生，A02 部分执行；当前 PCD-001 `make()` 只更新 boolean 状态。
- Q-015/Q-009 决定前不推断未知装饰的回退/错误语义；A04 和 CASE-MAT-003-005 记录为阻塞并跳过。
- 验证：`npx jest --runInBand app/__tests__/library-screen-decorations.spec.tsx app/__tests__/postcard-screen-assets.spec.tsx`（2 suites / 11 tests）、完整 `npm test -- --silent`（40 suites / 312 tests）和 `npm run typecheck` 均通过；MAT-003-A01/A03 计入通过后，验收总数为 92/225 = 40.9%。

## 2026-10-15 MAT-004 可独立验收分支

- 新增 `app/__tests__/library-screen-inspiration.spec.tsx`，逐张验证灵感卡问题对应，空/空白/换行回答不能提交，提交尝试不改消息、日记或路由；带未提交回答关闭弹层不发送消息、不改作品，MAT-004-A01/A04 通过。
- 有效输入仍由当前 `sendChat(...)` 本地关键词回复处理，不是 PET-001 真实服务；真实回复、请求/消息关联、失败恢复和迟到响应 CASE-MAT-004-002～005 已记录 blocker 并跳过，未用本地结果冒充真实聊天。
- 增量验证：`npx jest --runInBand app/__tests__/library-screen-inspiration.spec.tsx`（1 suite / 4 tests）、完整 `npm test -- --silent`（41 suites / 316 tests）与 `npm run typecheck` 均通过。MAT-004-A01/A04 纳入通过后为 94/225 = 41.8%。

## 2026-10-15 PCD-001 真实渲染 blocker 审计

- `app/postcard/index.tsx` 的 `make()` 仅将 `generated` 设为 `true`，没有生成文件、可读 URI 或版本绑定结果；CASE-PCD-001-003/004/005 未运行。
- 执行依赖解析检查发现只有 `jimp-compact` 可用；`react-native-view-shot`、`react-native-svg`、`sharp`、`canvas`、`@napi-rs/canvas`、`expo-image-manipulator` 均未安装。现有分享 PNG renderer 将文字画成结构骨架，不能替代明信片原布局和中文寄语的真实卡片图片。
- 真实生成需增加/采用原生视图捕获能力，并让当前生成按钮等到图片可读后再显示成功、在失败时返回可见错误；这将改变现有成功时序/失败反馈，不能在 UI/UX 冻结约束下擅自接线。用户已明确要求先跳过，故 PCD-001 A03/A04/A05 保持阻塞并暂停；本轮不增加依赖、不改变按钮反馈，后续仅在用户重新指定获批渲染方案或调整边界后恢复。

## 2026-10-15 MAT-002-A01/A03 验收证据补齐

- `app/__tests__/library-screen-material-apply.spec.tsx` 验证已注册的非 mock P4 通过素材预览应用到 D1 时，会创建/复用 D1 编辑草稿，将照片加入首个文本块与整篇集合并导航到同一草稿；重复应用会复用原 `draftId` 且不重复引用。草稿创建时已保存 D1/D2 保持不变。
- CASE-MAT-002-001/003 对应 `T-MAT-002-A01/A03`，验收矩阵已列为 passed；矩阵的通过项数量只计这两个明确通过的验收，不将本轮全量测试重复计数。
- 验证：定向 Jest（1 suite / 2 tests）、`npm test -- --silent`（42 suites / 318 tests）、`npm run typecheck`、`git diff --check` 均于 2026-10-15 通过。最终全量前端回归未运行数据库 e2e，也未调用真实媒体库或外部服务。
- fixture 使用 store 注册的 `file://` URI，仅证明目录消费者及草稿引用行为，不证明真实设备文件可读。真实导入/读取仍由 MAT-001/CRE-002 覆盖。A02 保存/放弃与持久化回读未运行：当前 `E2E_DATABASE_URL` 未配置，backend e2e `beforeEach` 会执行 `store.reset()`，不得对默认开发库 `ai_diary` 执行；需准备 disposable local e2e schema。A04 受 Q-015、A05/007 的错误与返回语义受 Q-015/Q-009 阻塞。依据 coverage 有效总数 225 与验收矩阵明确 passed 列动态重算：96/225 = 42.666...%，四舍五入为 **42.7%**（2026-10-15）；partial、blocked、pending 均不计。

## 2026-10-15 MAT-002-A05 无效输入副作用保护

- 审计 `app/library/index.tsx` 发现：原 `applyPhoto(...)` 在确认素材仍注册、目标日记仍存在且包含文本块之前调用 `beginEdit(...)`；无正文目标或预览后素材目录变化会产生编辑草稿，再因后续检查失败而静默退出。
- 新增 `app/__tests__/library-screen-material-apply.spec.tsx` 两个回归：无文本块目标、P4 预览后从 store 照片目录移除。两条用例在修复前均失败，并观察到新草稿已创建；修复后断言未建草稿、D1/D2 未变、未添加引用且未导航。`applyPhoto(...)` 现在先从当前 store 核验照片仍注册及目标仍含文本块，再调用 `beginEdit(...)`。
- 该修复不增加 UI/提示，不改变正常流程。测试只证明 store 目录登记状态，不证明设备文件真实可读、真实 `expo-media-library` 读取失败、目标无日记入口或返回/反馈语义，因此 `T-MAT-002-A05` 仅为部分执行，不计通过。
- 验证：定向 MAT-002（1 suite / 4 tests）、完整 `npm test -- --silent`（42 suites / 320 tests）、`npm run typecheck`、`git diff --check` 均通过；CRE-002 `app/__tests__/album-select-screen.spec.tsx` + `src/services/__tests__/photo-library.spec.ts`（2 suites / 14 tests）通过。页面故障用例按预期输出 `console.warn`，无失败断言。未运行数据库 e2e、未调用外部服务或真实媒体库。
- 验收矩阵明确 passed 项仍为 96；按 coverage 有效验收总数 225 重算为 **96/225 = 42.7%**（2026-10-15）。A05 是 partial，CRE-002 的真实 iOS `E_NO_PERMISSIONS` 仍阻塞，均不计入通过项。

## 2026-10-15 MAT-002-A02 分层保存与放弃证据

- 新增前端状态 CASE：素材 P4 应用到 D1 编辑草稿后执行 `discardDraft(...)`，草稿被移除且已保存 D1/D2 快照保持不变；该用例验证客户端放弃不发保存，不声称后端有草稿删除 API（当前 controller 未提供此接口）。
- 新增 `backend/test/app.e2e-spec.ts` 持久化 CASE：在全新 MySQL schema 创建 D1/D2，经 `/api/diaries/save` 将 `photo-4` 追加至 D1 的整篇照片集和正文快照，验证保存结果仍为原 D1 ID、版本递增为 2、D2 不变、回忆列表仍为 2 篇且 D1 只出现一次。
- 环境与清理：新建 `ai_diary_e2e_20261015_mat002`，仅部署当前两条 Prisma migrations；执行新增定向 e2e（1 passed / 39 skipped）后查询临时 D1 行数为 2 并删除 schema，确认 schema 已不存在；开发库未作为测试目标，清理后只读计数为 2。照片 ID 是后端 fixture，不代表真实媒体资源。
- 验证：`npx jest --runInBand app/__tests__/library-screen-material-apply.spec.tsx`（1 suite / 5 tests）、`npm --prefix backend run build`、隔离 backend e2e（1 passed / 39 skipped）、`npm test -- --silent`（42 suites / 321 tests）、`npm run typecheck` 均通过。A02 仍为 partial：尚未使用 CRE-002/MAT-001 导入的真实 P4 完成素材页到 repository/backend 的完整链路。
- 矩阵通过项仍是 96；依据 coverage 的 225 项重算为 **96/225 = 42.7%**（2026-10-15）。A02/A05 均未计入通过数。

## 2026-10-15 MAT-002-A02 store 请求载荷补充

- `src/store/__tests__/diary-domain.spec.ts` 新增 MAT-002 专属 repository-boundary 回归：用 store 注册的非 mock device P4 应用到 D1 草稿后提交，断言 `saveDiary` 收到原 `diaryId/sourceDiaryId/sourceDiaryVersion`，整篇 `photoIds` 与对应正文 block 的 `photoIds` 都包含 P4；store 收到 adapter 结果后沿用同一 D1、版本递增，D2 不变且没有第二条 D1。
- 定向验证：`npm run test:domain -- --testNamePattern='MAT-002 material photo references are included in the existing diary save request'`（1 passed / 97 skipped）。随后完整 `npm test -- --silent` 为 42 suites / 322 tests，通过 `npm run typecheck`。此 test 的 adapter 用于断言请求载荷，返回值不作为真实保存验收；MySQL 持久化仍由上一条 isolated e2e 单独证明。
- 通过项数量没有变化，仍为 **96/225 = 42.7%**；MAT-002-A02 仍 partial，等待真实设备 P4 及真实 repository/backend 连线后才能继续完整闭环。
- 2026-10-15 full backend regression：以全新 `ai_diary_e2e_20261015_full02` 部署两条 migrations，执行 `E2E_DATABASE_URL=<disposable local schema> npm run test:e2e`，40/40 通过（含 MAT-002 保存案例、DIA-005 保存/版本保护及 CRE-005 provider 故障 CASE）。e2e 按测试 setup 在该库执行 `store.reset()`；运行后临时 schema 已删除并确认不存在，开发库没有作为目标；开发库当前只读 `Diary` 行数为 2。此回归不增加验收通过数，也不解除真实 provider、决策或设备照片 blocker。

### 2026-10-16 · DEV-3 · BAS-002 后端身份校验优先级

- 全面复核后端 controller：`discovery`、`chat`、`anchors` 与 `sharing` 入口先解析 `x-device-id`，再进行 query/body 校验；`generation`、`diaries`、`drafts` 在服务调用前解析身份，未发现先解引用 body 字段的路径。
- 修复 `GET /photos/capabilities` 与 `/health` 之前不要求身份的问题，现在先通过 `resolveDeviceId(...)` 校验有效 `x-device-id` 再返回响应。
- 新增 health、photos、sharing、chat、anchor correction/read-model controller 优先级回归；discovery 对应回归已存在。新增 Jest/e2e 本轮均未运行，留待集中 TEST；未操作数据库或修改验收结果。

### 2026-10-16 · DEV-3 · PET-001 客户端响应契约收紧

- `isPetChatConversation(...)` 现在按 request ID 索引 turn/message 关联，验证 turn sequence 唯一递增、消息顺序稳定、user/assistant 角色归属和 pending/failed/completed 的状态不变量；完成回复的来源元数据必须与 turn 一致，孤立消息、空白正文和不完整失败/成功快照 fail closed。
- `HttpPetChatRepository.failTurn(...)` 现在只接受 `timeout`、`cancelled`、`provider_failed`，未知运行时值在发请求前返回 `invalid_input`。
- 新增 `src/contracts/__tests__/pet-chat-contract.spec.ts` 并扩展 repository spec，覆盖合法各状态、孤立消息、pending 回复、缺失败码、completed 缺回复、乱序、空白正文和未知 failure code；未运行 Jest。前端 typecheck 与 backend build 通过；无 migration、MySQL、provider 或正式页面改动。
- 同步 PET-001 task/CASE 和开发/阻塞/验收/执行记录；所有 CASE 与矩阵 passed 数不变。

### 2026-10-16 · DEV-3 · GRW-003 共享提取取消隔离

- 修复共享锚点提取请求由首个 caller 的 signal 控制 provider，导致首 caller 取消可能中止其他 waiter 的问题。现在各调用者分别竞速自己的 AbortSignal；共享 provider 仅在所有 waiter 均退出后才中止，late result 仍由共享操作 signal 拒绝。
- 增加双 waiter regression：先发起者取消后 provider signal 保持有效，另一 waiter 收到同一结果；单 waiter 取消仍会中止 provider。测试已写未运行。
- 此增量不决定 Q-016 触发/标签/数量、Q-002 自动重试或 Q-001 留存，不接正式页面、不应用 migration。`npm run typecheck` 与 `git diff --check` 通过；后端源码未变，未重复 backend build；Jest 未运行。CASE 与 passed 数不变。

### 2026-10-16 · DEV-3 · GRW-004 幂等重放版本保护

- 修复纠正命令重放读取可变 correction row 的问题：在幂等哈希匹配后，比较记录的 `correctionVersion` 与当前记录；若已被更新，返回 `version_conflict`，不把新内容当旧命令的成功结果。
- 没有为精确回放额外复制历史纠正文本，避免在 Q-001 留存未确认时延长敏感内容副本；没有 schema/migration 变更或数据库操作。
- 新增“更新至 v2 后重放 v1 命令” backend regression，验证旧键冲突且 v2 值保持不变；Jest 未运行。`npm run typecheck`、backend build、`git diff --check` 通过。CASE-GRW-004 与验收 passed 数不变。

### 2026-10-16 · DEV-3 · DSC-003 点赞写入串行化

- `setLike(...)` 在读 target state、更新唯一关系和统计计数前先锁 published/未撤回故事行，避免同一故事多设备写入在事务快照上计算陈旧计数；对不可见故事仍不写关系。
- 新增 service regression 验证锁顺序及不可见状态 fail closed，Jest 未运行。typecheck、backend build、diff check 通过；没有应用 migration 或访问数据库，也未接页面。
- 此锁不保证按客户端发送顺序排定乱序请求；Q-007 的跨设备并发/互动策略仍未确认。CASE/矩阵 passed 数保持不变。

### 2026-10-16 · DEV-3 · GRW-006 报告失败回调版本分类

- 修复报告 provider 拒绝/取消与源日记同时变化时，旧来源请求可能在失败分支被记为普通 `failed` 的问题。Store 现在按活动 request、当前 sourceVersion 和显式取消状态分别返回 `stale` / `cancelled` / `provider_failed`，只允许仍活动的当前请求更新状态。
- Store 等待 provider 时现与 AbortSignal 竞速；provider 即使忽略取消，本地 action 仍及时结束，迟到结果不会覆盖当前状态。
- 新增 sourceVersion 变化后旧 provider failure、provider 忽略 AbortSignal 的 Store regression；Jest 未运行，`npm run typecheck` 与 `git diff --check` 通过。报告页未接线、未调用模型、未改变 unlock/留存规则，GRW-006 CASE 与 passed 数不变。

### 2026-10-16 · DEV-3 · BAS-003 本地快照写入顺序

- `src/store/create-app-store.ts` 为草稿快照 save/clear 增加调用顺序队列，避免并发文件操作迟到完成后用旧状态覆盖新快照；前一写入失败会被隔离，不阻断队列后续操作。
- 后台触发的快照写入失败会记入 Store issue log，显式 `await persistDraftSnapshot()` 的调用继续保留异常处理路径。新增 `draft snapshot writes stay ordered when an earlier write is delayed` regression。
- 本次新增 Jest 尚未运行；`npm run typecheck` 与 `git diff --check` 通过。本条不代表快照 CASE 通过，验收矩阵 passed 数保持不变。未改 UI、留存规则、文件格式或数据库。

### 2026-10-16 · DEV-3 · BAS-001 / MAT-005 配图契约

- 新增 `ai-image-generation-v1` 文档与 TypeScript runtime contract，明确请求版本、稳定 request ID、attempt、完整描述、时间戳、结果来源及生成资产关联字段；Store 登记前校验版本、请求/描述匹配、资产来源标记和独立可读性。
- 新增契约测试并更新 MAT-005 Provider fixture；真实图像 provider、质量评估、超时/重试规则和资产留存仍受 Q-002/Q-001/Q-015 限制。正式素材页未接线，UI/UX 未改。
- 新增 Jest 尚未运行；`npm run typecheck` 与 `git diff --check` 通过。既有 CASE 状态与 96/225 passed 统计不变。

### 2026-10-16 · DEV-3 · CRE-001/002 权限与照片读取复核

- 对照 task、CASE、权限适配器、Store 和相册页复核现有状态：权限说明先于系统授权，相册进入/读取前重查权限，确认时逐张复核可读性，旧请求按版本隔离。
- 未发现不依赖产品决策或设备证据的独立开发缺口，故未改代码、未重跑 CASE/设备。Q-018 的有限/拒绝/撤回恢复分支仍待确认；iOS 模拟器 `E_NO_PERMISSIONS` 继续按环境 blocker 记录，转继续后续任务。

### 2026-10-16 · DEV-3 · DIA-005 保存期间并发编辑保护

- 保存请求以开始时捕获的不可变快照提交；`editRevision` 每次草稿修改递增并写入本地快照，幂等键按来源作品版本、生成轮次和修订号稳定区分。
- 若远端确认前草稿已产生新修订，Store 先提交旧快照，再将较新草稿保留为未保存状态并 rebase 到已返回的作品 ID/版本；本次提交返回现有 `pending` 结果，使当前编辑页不走成功导航。新修订可使用新键再次保存，原修订重试可复用旧键。
- 新增 deferred Store 回归，并扩展跨 store snapshot 恢复断言；均未运行。`npm run typecheck` 与 `git diff --check` 通过；未改页面样式或新增提示，既有 CASE/pass 结果不因未测试增量而增加。

### 2026-10-16 · DEV-3 · DIA-006 非法日期查询 fail-closed

- `core-diary-v1` 为月份与单日筛选补严格格式/日历有效性；内部点分隔月份/日筛选现序列化为 `YYYY-MM`/`YYYY-MM-DD`。client `isMemoriesQuery` 与 `HttpCoreDiaryRepository` 在发请求前拒绝非法输入，后端 `MemoriesController` 在访问回忆数据前拒绝非法月份/日期。
- 新增闰年、无效月/日 contract regression、repository 无网络调用、controller 读数据前拒绝以及页面 wire-format regression；Jest 未运行。`npm run typecheck`、`npm --prefix backend run build`、`git diff --check` 通过。
- 未推断 Q-004 时区、跨日/月归属、近期分组规则；CASE-DIA-006-009 整体仍待决策，CASE-DIA-006-010 仍待执行，验收通过数不变。

### 2026-10-16 · DEV-3 · DIA-007 月度导出边界复核

- 对照 task/CASE/service 确认现有月份分组、成员快照、失败/取消、旧月份结果隔离已有实现；当前 exporter 明确只产生本地演示预览，不写文件或记真实交付成功。
- Q-011 未定真实格式/内容/隐私，Q-001 未定文件留存，Q-004 未定跨月归档；本轮没有独立可开发且不推断规则的文件实现，故记录并跳过真实输出接线。未重跑既有测试、未新增 CASE passed。

### 2026-10-16 · DEV-3 · SHR-001/002 隐私范围与投影复核

- 对照 task/CASE、Store、后端保存校验和 `projectDiaryForSharing(...)` 复核：四种范围只更新目标作品；非私密选段只允许已保存文本/引用块，空选段与非法引用 fail closed；海报与全文预览复用同一投影。
- Q-007/Q-013/Q-014 仍限制真实公开读取、社区发布、匿名细则和导出内容语义。未发现不触及这些决策的独立缺口，未改代码、未重跑 CASE/数据库。

### 2026-10-16 · DEV-3 · SHR-003 匿名结果可读性 fail-closed

- 默认匿名 renderer 输出可读性检查此前对非本地 URI 直接返回可读；现只接受 `file://` 或本地绝对路径，实际读取文件并校验 PNG signature、IHDR 与非零尺寸。网络、`data:`、媒体库及损坏 PNG 不再绕过验证。
- 新增 URI 类型/损坏 PNG regression 尚未运行；`npm run typecheck` 与 `git diff --check` 通过。不修改 Q-013 未标记人物规则、不改变页面交互、不新增匿名质量通过项。

### 2026-10-16 · DEV-3 · SHR-004/005 预览与真实交付复核

- 复核 `SHR-004`：正式页面消费统一匿名/选段投影，目标缺失空态与旧目标保护已有实现；剩余异步渲染反馈和二维码语义分别受当前页面边界/Q-014 约束。
- 复核 `SHR-005`：服务层已有 PNG/PDF 文件准备、失败/取消隔离及确认后记录；PDF/PNG 当前明确不是最终版式，正式页面仍走 demo path，缺平台 SDK/系统出口契约。
- Q-014/Q-013、UI/UX 冻结阻止正式可见接线和完成语义，本轮未发现不依赖这些决策的独立业务缺口；未改文件出口或重跑既有 CASE。

### 2026-10-16 · DEV-3 · PET-001 服务端并发序号复核

- 对照 service/Prisma schema/spec/CASE 复核持久会话：创建 turn 在 conversation row lock 内分配 `nextTurnSequence`，回复、失败、重试也使用同一锁；唯一键冲突后按请求指纹恢复同一 turn，设备隔离与 attempt 检查在事务内完成。
- 未发现可独立于 Q-001/Q-002/Q-003 与正式页面授权推进的服务端竞态缺口；未改代码、未运行 Jest/MySQL。migration 仍未应用，页面仍未接 repository。

### 2026-10-16 · DEV-3 · DSC-001～003 自有服务复核

- 对照 discovery task/CASE/service/controller/contract 复核：只读显式 published snapshot，查询条件/分页有稳定次序与页容量白名单；缺省/推荐/同城类别 fail closed；点赞使用设备唯一关系，故事行锁覆盖写入与服务端计数。
- 当前缺口在 Q-007 发布来源、互动资格/撤回/意图排序与尚未接入的正式页面；没有独立服务层缺口。未改代码、未重跑 backend tests 或访问数据库。

### 2026-10-16 · DEV-3 · GRW-006 报告结构 contract

- 新增 `insight-report-v1` 文档与 runtime validator；request/result 带版本，来源快照唯一，result request/sourceVersion 匹配，来源 ID 必须属于请求集合，且三个固定维度须完整唯一、标题/内容非空。Store 已以该 contract 替换原内联结构断言；开发 mock 携带版本号。
- 新增 contract regression 并更新 Store test fixture，Jest 未运行；typecheck/diff check 通过。报告页、持久报告仓库、真实 provider 未接线；Q-002/Q-005/Q-006/Q-016/Q-001 的质量/统计/解锁/来源/留存规则不变。

### 2026-10-16 · DEV-3 · GRW-001/002/005 决策边界复核

- 对照 task/CASE 与当前个人页、成长树和花朵页：统计仍依赖 `SAMPLE_BASELINE`，标签/锚点词表依赖 GRW-003，花朵/报告解锁阈值仍为静态原型。
- Q-005/Q-006/Q-016 分别阻塞真实统计口径、成长授予/解锁规则和标签词表/来源变更；当前 UI/UX 冻结也阻止把固定数字改为其他呈现。没有可不推断规则的独立实现，未改代码或重跑 CASE，记录后继续。

### 2026-10-16 · DEV-3 · DIA-006 wire format 与 INT-001 依赖审计

- 复核 Store retry 夹具：内部筛选输入仍为 `2026.02` / 日号 `3`，首次 repository 请求及重试断言均使用契约 wire format `2026-02` / `2026-02-03`；无须修改夹具，未运行 Jest。
- 按 README 收尾复核 INT-001 task/CASE 与真实 repositories/services：所有 E2E CASE 依赖未闭环的设备、真实 provider、文件/平台出口、数据库迁移或产品 Q；没有能独立证明业务交付的跨栈实现。此前跨栈测试实验会污染 backend 类型边界，留待 TEST 阶段设计隔离 harness。
- BAS-003 源码审计发现 `draft-snapshot-storage.ts` 的 localStorage/文件系统分支把空值、`readAsStringAsync` 或 JSON parse 异常吞为 `undefined`，与 Store 已有的失败隔离保护脱节。现让这些异常传播至 `hydrateDrafts()` fail-closed 路径，避免损坏快照被当作空快照后覆盖；新增 localStorage/empty/malformed JSON 与 read failure adapter tests，未运行。验收矩阵及 CASE 状态不变。

### 2026-10-16 · DEV-3 · BAS-003 已保存正文快照读取校验

- 对齐 `core-diary-v1` 与后端 `assertDiaryContentSnapshot(...)`：客户端正文 contract 现在拒绝空块、只有 photo block、重复 block ID 和无效 `relatedBlockId`；photo-aware 校验确保 cover/poster/text/photo/person 引用均属于作品的 `photoIds`。
- `HttpCoreDiaryRepository.getDiary(...)` 对坏快照返回结构化 `provider_failed`；回忆 Store 对单篇损坏正文记录 issue 并以空正文隔离，不阻断同一列表的其他有效日记。不会从摘要合成正文，也不回退到不相关样例照片。
- 新增 core contract、repository 和 Store regressions，均未运行；`npm run typecheck`、`git diff --check` 通过。CASE-BAS-003-005 保持 partial，验收通过数不变。
- 进一步发现 Prisma JSON scalar/array 会在后端 mapper 被静默折叠成未提供快照，无法与合法 legacy NULL 区分。现新增 `contentSnapshotStatus: invalid` 读取标记；新隔离 e2e 与 Store regression 未运行，e2e 文件独立 `tsc --noEmit` 静态编译通过，不执行数据库写入。

### 2026-10-16 · DEV-3 · BAS-003 恢复公开选段范围

- 回忆 Store 的 `buildMemoryDiaryItem(...)` 原先从现存内存对象复制 `publicBlockIds`，未消费后端 `DiaryContract.publicBlockIds`，导致新建 Store/回忆列表恢复时选段公开范围丢失；也无法在服务端权威返回 private 时清除本地旧值。
- 现由 hydration 与搜索结果直接恢复服务端范围；`private` 且无 `publicBlockIds` 时保持无选段。新增 Store regression 覆盖启动恢复、搜索结果、`projectDiaryForSharing(...)` 投影和从公开转回私密，尚未运行。
- 仅修复持久数据映射，不改 UI/UX 或 Q-007 公开/社区语义；BAS-003/SHR 状态和验收 passed 数不变。

### 2026-10-16 · DEV-3 · BAS-003 release 样例数据隔离

- `createDefaultAppStoreDeps(...)` 原先在 `__DEV__ === false` 时仍默认加载 `mockDiaries` / `mockPhotos`；`beginCreation()` 还依赖第一篇样例日记作为草稿模板，release 空目录下会崩溃。
- 现将样例日记/照片与其他 mock providers 统一限制于开发/Jest fixture；release 默认列表为空、`currentDiaryId` 为空，月份分组 selector 根据 Store 当前日记计算；无种子日记时创建中性空白草稿，不引用样例作品。无 UI 样式/导航变更。
- 新增 release runtime Store regression，未运行。个人统计 `SAMPLE_BASELINE`、PET-002 固定锚点、个人资料/VIP 原型仍分别受 Q-005/Q-016/Q-012 限制，因此 A03 及 GRW/PET 对应任务仍未闭环；没有新增 CASE passed。

### 2026-10-16 · DEV-3 · BAS-001 generation request runtime contract

- `GenerationJob` response contract 曾只检查 `draftVersion` 是 number，generation create endpoint 则只有 TypeScript body 类型，fractional/negative versions 仍可能进入请求处理。
- 新增共用客户端 create-request contract：ID/幂等键非空，版本为正安全整数；repository 发请求前 fail fast。后端 controller 先解析设备身份，再校验 body；畸形 body 返回 `invalid_input`，无身份仍优先返回 `device_identity_required`。response validator 同步拒绝非法版本。
- 新增 contract、repository 和 controller regression 未运行；typecheck/diff/backend test-file compile 待本轮完成后核验。未调用 provider 或数据库；BAS-001/BAS-002/CRE-005 CASE 状态不变。

### 2026-10-16 · DEV-3 · BAS-001 generation request 版本校验

- generation create request 的客户端接口原先只靠 TypeScript 类型保证 `draftVersion`，HTTP repository 接收运行时小数/非法值仍会发包；后端 controller 也没有 body runtime validation，可能将非法值传到 Prisma。
- `core-diary-v1` 新增共享 create-request validator，要求非空 draft ID/idempotency key 和正安全整数版本；客户端请求前拒绝，后端先解析设备身份再验 body，不合法返回 `invalid_input`，缺身份仍优先 `device_identity_required`。response contract 同步收紧版本号。
- contract/repository/controller regression 已新增未运行；此增量不改变 BAS-001 CASE 通过状态，也没有访问数据库/provider。

### 2026-10-16 · DEV-3 · BAS-001 / CRE-005 generation 幂等载荷校验

- 同设备同幂等键现在绑定原始 `draftId + draftVersion`：一致时返回原 generation job，不一致时返回不可重试 `version_conflict`；数据库唯一键竞争后重读赢家并复核载荷。
- 新增 contract、repository、controller 与隔离 MySQL e2e 回归均未运行。`npm run typecheck`、backend build、`git diff --check` 通过；未调用 provider 或访问数据库，验收 passed 数不变。

### 2026-10-16 · DEV-3 · DIA-005 / BAS-002 保存命令身份边界

- 保存请求在幂等查询前执行基本 runtime 校验；相同设备幂等键绑定 `draftId + sourceDiaryId + sourceDiaryVersion`，同键跨草稿或来源版本复用返回 `version_conflict`。同命令身份仍重放首次结果。
- 新增隔离 MySQL e2e 未运行；前端 typecheck、backend build、diff check 通过。既有 CASE 结果与总 passed 数不变；未访问数据库/provider。

### 2026-10-16 · DEV-3 · CRE-003 / BAS-002 草稿 body 校验

- 草稿建单服务现拒绝畸形请求对象、ID、照片 ID 列表、privacy 与版本，确保非法 body 不进入数据库写入；设备身份错误仍先于 body 错误。
- 新增隔离 e2e 尚未运行，`npm run typecheck`、backend build、diff check 通过。未规定照片数量/去重或来源日记存在性；CASE/passed 状态不变。

### 2026-10-16 · DEV-3 · SHR-001 sharing controller body guard

- `/api/sharing/project` controller 现在先校验设备身份，再验证 body 记录形状、diary ID、隐私枚举和 block ID 列表；Store 入口也加运行时校验，非法输入不执行数据库读取/写入。
- 新增 controller regression 未运行；backend build、typecheck、diff check 通过。原 SHR-001/BAS-002 CASE 结果与 passed 数不变。

### 2026-10-16 · DEV-3 · DIA-002 rewrite request guard

- rewrite controller 现以 `unknown` 接 body，先解析设备身份再校验字段和版本；Store 增加第二层校验，畸形请求以 `invalid_input` 拒绝且不调用 provider。
- 新 controller regression 未运行；backend build 与 diff check 通过。未调用 AI provider，DIA-002/BAS-001/BAS-002 CASE 与通过数不变。

### 2026-10-16 · DEV-3 · DIA-006 query wire validation

- memories controller 现拒绝非十进制/重复分页参数及非字符串 keyword；page/pageSize/month/day 在读取日记数据前验证，缺少身份仍优先拒绝。
- 旧 e2e 日期输入已转成 contract wire format，原成功断言保留。新增 controller regression 未运行；Q-004 和 CASE 状态不变，未增加 passed。

### 2026-10-16 · DEV-3 · BAS-004 Jest e2e setup safety

- `jest-e2e.json` 现直接加载 e2e 数据库环境 guard；即使绕过标准 runner，也要求显式隔离的本机 schema 且 `DATABASE_URL` 与 `E2E_DATABASE_URL` 完全一致。
- runner 会向 Jest 同时传入两个已验证 URL。`run-e2e-tests.spec.ts` 定向单测 4/4 通过；未启动 e2e、未连接数据库，因此配置级早停行为仍待 TEST，BAS-004 既有 CASE 结果未扩大。

### 2026-10-16 · DEV-3 · DSC-001 query runtime validation

- Discovery controller 现在拒绝非十进制/重复分页 query 和非字符串 keyword；service 同样拒绝 malformed query object/keyword，身份优先保持不变。
- 新增 controller/service 回归未运行；Q-007 category 与发布规则、页面接线均未改，DSC CASE/pass 状态不变。

### 2026-10-16 · DEV-3 · PET-001 conversation pagination guard

- Chat conversation list 现拒绝重复及非十进制 `page/pageSize` query；service 在 Prisma 前复核分页对象、数字类型、安全整数、页码和页容量。设备身份校验仍先于 query 校验。
- 新增 controller/service regression 未运行；没有调用数据库或 AI provider，没有改正式 UI、Q 决策或 CASE 状态。验收仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · PET-002 独立范围复核

- 确认 `AnchorReadRepository` 现有 `listByTag` 仅接受明确 `tagId`，无统计聚合 repository；萌宠页仍使用固定统计基线/锚点数，锚点页仍按静态组映射。Q-005/Q-016 未确认，Q-001 仍限制重启缓存范围。
- 当前入口路由和静态列表空态已存在，但不代表真实读模型空态；本轮没有不猜业务规则、不改正式可见行为的独立实现，已在 PET-002 task/CASE 和进度/blocker 记录后跳过。CASE 未执行，验收仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · DSC-002 请求/响应 ID 绑定

- `HttpDiscoveryRepository.getStory(...)` 现要求有效响应的 `id` 与请求 ID 完全一致；畸形本地输入在发包前拒绝。后端 service 对空/非字符串 story ID 增加 Prisma 查询前 guard，controller 仍优先解析设备身份。
- 新增 controller/service/client regression 尚未运行；真实页面、数据库及 Q-007 发布/匿名规则未接线或改动。CASE 状态与 96/225（42.7%）通过数不变。

### 2026-10-16 · DEV-3 · DSC-003 点赞请求绑定

- 点赞 controller/service/repository 现运行时验证 story ID、设备 ID与 boolean target；service 在事务开启前拒绝 malformed 参数，repository 只接受与请求 story ID 一致的返回状态。
- 新增 controller/service/client regression 未运行。现有故事行锁、target-state、Q-007 并发意图规则和正式页面行为未改；CASE 状态及 96/225（42.7%）通过数不变。

### 2026-10-16 · DEV-3 · GRW-001 独立范围复核

- 我的、萌宠和成长概览已共用 `getDiaryStatistics(...)`，但实现仍依赖 `SAMPLE_BASELINE`；Q-005 未定义已保存/草稿、照片/天数/同行人计数语义。资料仍为静态原型且无 profile repository，Q-012/Q-001 分别限制资料范围和恢复。
- 本轮没有可独立开发且不更改正式展示/猜测统计的缺口，已在 task/CASE 与台账登记后跳过；CASE 未执行，验收仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · GRW-002 路由与决策复核

- 四主题路由已传 metadata 稳定 ID，花朵入口/无栈返回已有实现；新增组件 regression 未运行。真实标签、成长状态与统计读模型仍受 Q-016/Q-006/Q-005。
- 锚点页未知/缺省 tag 目前回落静态 friends 组；改变默认/失效显示属于正式可见行为且依赖 Q-016，本轮保持不改。除现有稳定路由外无独立可开发实现，CASE 未执行，验收仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · GRW-003 锚点读取参数边界

- `GET /anchors` 现在要求单值非空 tagId 和十进制分页 query；AnchorReadModelService 对 malformed pagination object/类型/范围做第二层校验，避免进入 Prisma transaction。`HttpAnchorReadModelRepository.listByTag(...)` 同时验证输入并绑定返回 tagId/page/pageSize。
- 新增 controller/service/client regression 未运行；没有触发提取、访问数据库或接正式页，Q-016 默认集合与 Q-002 provider 规则不变。CASE 与 96/225（42.7%）通过数不变。

### 2026-10-16 · DEV-3 · GRW-004 correction input/response binding

- correction GET 的 diaryVersion query 现只接受十进制整数文本；controller/service/repository 对 malformed query/request object fail closed。repository 对 GET 与 PUT 返回值检查 diary/version/anchor，PUT 另检查 source block、trim 后文本和 `expectedVersion + 1`。
- 新增 controller/service/client regression 未运行；无数据库/provider 操作，未接正式页面；并发、幂等与 Q-003/Q-016 规则未更改。CASE 与验收 96/225（42.7%）不变。

### 2026-10-16 · DEV-3 · GRW-005/006 决策与边界复核

- GRW-005 仍是内存 `flowerUnlocked` 与固定里程碑；Q-005/Q-006/Q-001 未确认，未改成长显示或扩大既有 `__DEV__ scenario`。CASE 未执行，登记本轮无独立业务实现。
- GRW-006 已有可替换 provider、明确 mock source、非开发未配置 provider fail closed、版本化 contract 和 Store 乱序/取消保护。正式页仍为 demo、没有报告 repository；接线会改变可见数据来源/失败反馈，“仅本地”说明也依赖 Q-001。无授权/质量/留存决策前无独立接线，mock 不计真实报告，CASE 未执行。
- 两项均未触碰数据库、provider 或 UI；CASE/矩阵 passed 仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · INT-001 全局集成复核

- 对照 J-01～J-06 与当前 task/CASE，仍有真实设备、provider、文件/平台出口、未应用 migration、未接页面及产品 Q 缺口；这些前置不能由独立本地编排替代。
- 不创建跨栈假通过 harness，不连接数据库/设备/外部服务。Expo/Store 混入 backend Node 编译域的隔离方案留到 TEST 轮；CASE-INT-001-001～008 未执行，验收仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · BAS-002 设备身份路由复核

- 枚举 `backend/src` 下 12 个 controller 的 routes，所有 protected operations 都在业务输入处理或 Store/Prisma 操作前解析设备身份；`/health`、`/photos/capabilities` 同样要求身份。本次未发现新的漏身份路由。
- 新增身份优先级 regression 未运行，故不新增验收证据；公开投影、供应商调用与 Q-012 正式身份仍未闭环，CASE 状态和 96/225（42.7%）不变。

### 2026-10-16 · DEV-3 · BAS-003 清理失败与 DIA-001 详情 ID 绑定

- 文件快照清理适配器此前吞掉 `getInfoAsync/deleteAsync` 异常；现将失败交回 Store 的既有后台 issue-log / hydration fail-closed 处理，避免把未清理快照误报为成功。详情 repository 现在在请求前拒绝 malformed ID，并检查返回的日记 ID 与 path ID 一致。
- 新增 adapter/repository regression 尚未运行；未清理数据库、迁移或改 UI。BAS-003/DIA-001 CASE 状态和验收 96/225（42.7%）不变。

### 2026-10-16 · DEV-3 · CRE-005 generation response binding

- 创建响应必须匹配请求 `draftId/draftVersion/idempotencyKey`；轮询/取消必须匹配 path `jobId`。Store 对活动 draft/round/key 和轮询时的当前 jobId 增加第二层检查，错配成功响应不进入进度/结果。
- 新增 repository/Store regression 尚未运行；未触发 provider或数据库。Q-002 重试策略、真实质量/凭据及页面行为不变，CASE 和 96/225（42.7%）通过数不变。

### 2026-10-16 · DEV-3 · CRE-006 人物 ID 唯一性

- Provider 归一化、client generation/content contract 和 backend save snapshot guard 现拒绝单个结果/作品范围内的重复 `person.id`。service 普通结构异常按不可重试 `provider_failed` 分类；异步 generation handler 使用既有分类分支写入失败快照，不产出成功结果。
- 新增 service 与隔离 MySQL e2e 回归未运行；contract/save 回归也待 TEST。未访问真实 provider 或数据库，未新增产品语义。CASE/矩阵未更改，验收仍为 96/225（42.7%）。

### 2026-10-16 · DEV-3 · DIA-001 详情读取缓存隔离

- 详情页远端缓存现在绑定 `diaryId`，各路由目标变化都使旧读取代次失效；新增 UI 层 deterministic regression 覆盖切至本地完整作品、旧响应迟到及返回原目标后重新读取。
- 新测试未运行；未改变 UI/UX 和详情菜单规则。CASE 状态与 96/225（42.7%）验收统计不变。

### 2026-10-16 · DEV-3 · 执行队列和返工上限更新

- 用户新增“依赖优先，依赖就绪任务按简单到困难排序”及“初次开发后最多两轮缺陷修复/复测，仍未通过则暂跳”规则，已同步到 goal 启动提示词、development strategy 与 delivery README。
- 当前仍是 DEV-3，42/42 任务源码盘点历史保留；下一轮代码推进前需基于当前依赖和剩余缺口建立 S/M/L 队列。当前文件中已有新增 CRE-006、DIA-001、DIA-002 回归未运行。CASE/矩阵无改动，验收仍按 96/225（42.7%）记录。

### 2026-10-16 · TEST-5 / DEV-4 / TEST-6 · 本地缺陷回流

- TEST-5 前端全量运行在 GRW-003 cancellation 测试触发未处理 rejection 时异常退出；backend unit 16/17 suites、197/198 tests，失败为 DSC-002 空 story ID 未在 controller 拒绝。DEV-4 补 controller identity-first ID guard，并调整取消断言订阅时序。
- TEST-6 backend unit 17/17 suites、198/198 tests 通过；前端 50/55 suites、429/443 tests 通过，失败 5 suites / 14 tests：GRW-003 取消用例未等待 provider 启动、MAT-001 初始素材成员基线假设错误、DIA-001 占位详情 mock 导致额外读取、CRE-005 测试响应仍绑定旧 `round-1`、MAT-002 目标选择后未触发预期路由且摘要预期未捕获编辑后基线。详情见 `development-progress.md` 及对应 task/CASE。
- TEST-6 `npm run typecheck`、backend build、`git diff --check` 通过。测试发现按当前依赖重排 DEV-5 队列：S：MAT-001 冲突前后目录/成员快照 fixture、DIA-001 非占位详情 fixture；M：MAT-002 诊断目标点击后路由/草稿未推进的原因并捕获应用前快照、CRE-005 request-bound round fixtures、GRW-003 provider-start cancellation synchronization。按 S→M 修复后集中复测。
- 当前进入 DEV-5，不重置 DEV-1/2/3 或 TEST-1～4。未应用迁移、未配置 `E2E_DATABASE_URL`，未运行 e2e/设备/AI/provider/文件 CASE；无新增 CASE passed，验收维持 96/225（42.7%）。

### 2026-10-16 · TEST-7 / DEV-6 · MAT-002 状态读取缺陷

- TEST-7 前端 53/55 suites、439/443 tests 通过，4 条断言失败集中在 MAT-002（3）和 GRW-003 cancellation（1）。MAT-001、DIA-001、CRE-005 在 DEV-5 的本地回归修复已通过。
- MAT-002 调用观测证明 `beginEdit` 已执行，但旧 Zustand snapshot 没有新 draft，故 P4 写入和导航提前中断。DEV-6 在该 action 后重新读取当前 store 再进行既有更新；不改变用户路径、页面反馈或样式。
- GRW-003 已等待 provider 启动；TEST-7 证明当前测试在 waiter release 完成前检查 abort signal。DEV-6 将 await 取消结果后再检查 provider abort 和迟到结果，属于本任务第 2/2 修复轮。
- `npm run typecheck` 暴露 retry fixture 返回的 `ok` literal widening；DEV-6 为 mock 补充契约返回类型。`git diff --check` 通过；backend 源码未改，未重复 backend unit/build；无隔离 DB URL，e2e 未运行。
- 验收矩阵仍 96/225（42.7%），没有 CASE 新增 passed。MAT-002 第 1/2 修复轮、GRW-003 第 2/2 修复轮待 TEST-8 集中复测；若任一仍失败按返工上限暂跳。

### 2026-10-16 · TEST-8 / DEV-7 · BAS-004 legacy runner 依赖

- TEST-8 前端全量 55 suites / 443 tests、typecheck、diff check 均通过。作为 BAS-004-A02 独立 runner 验收，正常与反向命令都在案例开始前报 `MODULE_NOT_FOUND: ../contracts/core-diary-contract`；发现 runner temporary file allowlist 未包括新 runtime dependency。
- CASE-BAS-004-002 当前标未通过，历史正常/反向各 15/15 证据保留但不适用于当前 worktree。DEV-7 将 `core-diary-contract.ts` 加入临时 transpile 清单后只重跑这两种顺序，属于 S 级、首次修复轮 `0/2`。
- 验收 passed 因 BAS-004-A02 暂撤 1 项，按 95/225 = 42.2% 重算。前端 Jest 全绿不覆盖该旧 runner；MySQL e2e 仍因缺少 E2E_DATABASE_URL 未运行。

### 2026-10-16 · TEST-9 / DEV-8 · BAS-004 runner dependency closure

- DEV-7 加入 core diary contract 后，TEST-9 正常/反向命令都进展到下一处缺失模块 `ai-image-generation-contract`，仍未启动领域场景。BAS-004-A02 修复计数现在为 `1/2`，CASE 保持未通过。
- DEV-8 不再逐个模块试错；已盘点 Store 顶层 imports，计划一次补齐 runtime contract/provider 的临时编译，并把 native photo importer、backend HTTP adapters 限定在 no-op test stubs。目标仍是恢复原 E01～15 正/反序运行，不改变断言或业务行为。
- 当前验收 passed 为 95/225（42.2%）；未配置 `E2E_DATABASE_URL`，未触及 MySQL、真实设备、文件或 provider。

### 2026-10-16 · TEST-10 / DEV-8 · Runner 依赖闭包通过

- `tools/run-domain-tests.js` 临时运行目录现转译 core/AI image/insight contracts 与 Store 使用的纯 TypeScript provider，MediaLibrary importer 和 backend adapters 由隔离 stub 代替。当前 worktree 正常及反向顺序各执行 E01～E15，均 15/15；历史 TEST-8/9 两次 module-load 失败保留。
- CASE-BAS-004-002 已恢复 passed，BAS-004 仍整体进行中：CASE-BAS-004-001 direct Jest setup guard 需在隔离 MySQL URL 具备后补成功启动实证。通过项按矩阵重算为 95/225（42.2%）；不将 legacy runner 通过扩张为真实 provider/设备/文件 CASE。

### 2026-10-16 · DEV-9 / TEST-11 · 候选复核与集中回归

- 按 README 依赖关系复核 BAS-001、MAT-001、PET-001、DSC-001～003、GRW-003/004 等仍标记实施中的候选。当前无依赖已满足且可在不改变正式 UI/UX、不选择未确认默认规则的情况下独立完成的新增业务实现；UI 接线、Q 决策、真实 provider/平台与隔离数据库分支继续分开登记。
- 前端 `npm test -- --silent` 为 55/55 suites、443/443 tests；后端 `npm --prefix backend run test -- --silent` 为 17/17 suites、198/198 tests。`npm run typecheck`、`npm --prefix backend run build`、`git diff --check` 均通过。
- `E2E_DATABASE_URL` 未配置，未运行 MySQL e2e/migration 或当前 direct Jest setup guard；未连接开发数据库、真实设备、provider 或平台渠道。TEST-10 normal/reverse domain runner 证据未受代码变更影响，本轮未重复执行。
- 单测/静态检查通过不扩大完整 CASE 结论；BAS-004-A01 仍 partial，coverage passed 维持 95/225（42.2%），无本地失败需要进入缺陷返工轮。

### 2026-10-16 · TEST-12 / DEV-11 / TEST-13 · 数据库门槛及取消收口

- TEST-12 首轮在隔离 MySQL fresh schema 部署 migration 时发现 discovery 与 anchor correction 两个索引标识超过 MySQL 64 字符限制；DEV-11 同批缩短并在全新 schema 部署全部 6 条 migrations，`migrate status` up-to-date、schema diff 无 drift。
- direct Jest e2e 首轮还发现 JSON `null` 在默认 parser 层被提前拒绝，以及生成任务取消后 provider fetch 仍运行并在 Prisma 关闭后被后台任务访问。DEV-11 配置 production/e2e 共用的 JSON primitive body parsing，让 controller 保持 identity-first guard；取消时向 provider 传递 AbortSignal，跟踪并等待在途 generation tasks。
- TEST-13 direct `jest-e2e.json` setup guard 在同一个新建隔离 schema 实际成功启动，完整 e2e 46/46；其中 generation cancellation e2e 使用本地 fetch stub 并验证 provider signal abort。后端 unit 17 suites / 199 tests、backend build、root typecheck、migration status、schema diff、git diff check 均通过。
- CASE-BAS-004-001 从 partial 更新为 passed，唯一新增 passed 后重算 `96/225 = 42.7%`。DSC/GRW migration 部署证据不替代各自 API/provider/页面 CASE；BAS-002/CRE-003 malformed-input 回归也不扩大完整 CASE 范围。
- 三个本轮新建隔离 schema 已在 evidence 收集后逐一删除；未连接或清理 `ai_diary` 开发库，未调用真实 AI provider、设备或平台服务。

### 2026-10-16 · DEV-12 / TEST-14 · first-party MySQL integration

- 依赖与复杂度队列：S 当前无独立业务缺口；M：DSC-001～003、PET-001、GRW-003/004 的自有 HTTP/Prisma persistence 子集已具备迁移和 unit 边界，可不接正式 UI 在隔离 DB 验证；L：真实 provider/质量、设备文件/平台出口、Q 门控和 PCD-001 继续单独延期。
- 新增/reset 扩展 `MemoryStoreService.reset()` 清理 discovery、chat、anchor extraction/correction 测试表；backend e2e 加入三个 service-level flow，覆盖 discovery 查询/详情/点赞、chat turn fail/retry/mock reply 与身份隔离、anchor provider-fixture 持久查询/纠正读写与身份隔离。
- 首轮锚点 DB e2e 发现 Prisma/MySQL correlated `EXISTS(JSON_TABLE)` 查询将已保存 anchor 错误过滤为空。DEV-12 改为 JSON_TABLE join、显式 collation 与 anchor 去重 count/page；首次实际 read-model DB 集成复测通过。既有 GRW-003 cancellation `2/2` 历史保留；未重置计数或 CASE。
- TEST-14 完整 direct Jest e2e 49/49、backend unit 17/199、typecheck、backend build、migrate status、schema diff 和 diff check 通过。临时 `ai_diary_test_dev12` schema 已删除。
- CASE-DSC-001～003、PET-001、GRW-003/004 的相关数据库/服务子项仅更新为部分执行；未有完整 CASE 新增 passed，故 matrix 保持 96/225（42.7%）。合成 fixture/mock 不作真实发布或 AI 质量证据。
