# 开发轮台账

## 当前轮次更正（TEST-14 后）

DEV-9/TEST-11 与 DEV-10/TEST-12/DEV-11/TEST-13 历史保留。TEST-13 已关闭 BAS-004-A01；DEV-12 随后补齐 discovery/chat/anchor 的后端 HTTP+MySQL 集成子集，并发现、修复 GRW-003 JSON_TABLE 查询在 MySQL 下误返空集合。TEST-14 当前完整 backend e2e 49/49、backend unit 17/17 suites、199/199 tests；root typecheck、backend build、migrate status、schema diff、diff check 通过。验收通过项仍为 96/225（42.7%），DEV-12 不改变任何完整 CASE passed。

日期：2026-10-16。当前轮次：`DEV-5`（TEST-6 后的缺陷修复轮；DEV-1/2/3 历史保留）。DEV-1 完成 42 项 task/CASE/源码盘点；DEV-2/3 修复 MAT-005 Store 缺陷、建设 DSC 自有后端/API/客户端 repository，为 GRW-003 增加版本化持久读模型 API/repository、为 GRW-004 增加纠正边界，并为 PET-001 增加持久会话/turn/message API 和 client repository。DEV-3 历史增量还包括收紧 GRW-003 数据库分页、可信 provider fail-closed 与 GRW-004 anchor 来源校验，为 MAT-001 新增设备照片导入服务/Store action，并修复 MAT-002 已有草稿引用被 saved diary 覆盖的问题；BAS-001/CRE-005 增加 generation create runtime 校验、同设备幂等载荷绑定与并发冲突恢复，DIA-005/BAS-002 收紧保存命令重放前 runtime 校验及同设备 key 的草稿/来源版本绑定，CRE-003/BAS-002 补齐草稿建单 body runtime 校验，SHR-001/BAS-002 补齐 sharing API body runtime guard，DIA-002/BAS-001/BAS-002 补齐 rewrite body runtime contract；DIA-006 严格校验 decimal page/pageSize 与重复 query 参数，并修正历史 e2e 日期 wire-format fixture；DSC-001 增加 query wire encoding 与重复参数运行时防线；BAS-004 为直接 Jest e2e 增加第二层隔离数据库 guard。TEST-5/6 与 DEV-4 的缺陷证据和当前 DEV-5 队列见本文末尾及各 task/CASE。迁移未应用，MAT-001 上传 sheet 未接新 action。

DEV-3 PET-001 增量：chat conversation list 现在拒绝指数/十六进制/小数/空白/重复分页 query，service 在 Prisma 前复核分页对象及数值范围；新增 controller/service regression 留待集中 TEST。此项不改变页面接线、Q 决策或 CASE 状态。

DEV-3 PET-002 复核：已有锚点 read repository 仅支持显式 `tagId`，没有统计聚合 repository；正式统计与默认集合仍分别受 Q-005/Q-016 阻塞。本轮无不改变 UI/UX 或猜测业务语义的独立开发项，已登记跳过并等待决策/读模型。

DEV-3 DSC-002 增量：详情 repository 绑定响应 story ID 与请求 ID；后端 service 在查询前拒绝空/非字符串 ID。新增 controller/service/client regression 留待集中 TEST，页面未接线，不改变 Q-007 权限/发布范围或 CASE 状态。

DEV-3 DSC-003 增量：点赞 controller/service/repository 对 story ID、设备 ID与 target boolean 做运行时校验；服务端在事务前拒绝 malformed input，客户端将响应 storyId 绑定到请求目标。新增 regression 留待集中 TEST，原有锁/互动策略、UI 和 CASE 结论不变。

DEV-3 GRW-001 复核：个人、萌宠、成长页面已共用 `getDiaryStatistics(...)`，但函数仍含 `SAMPLE_BASELINE`；真实口径受 Q-005，资料/VIP 范围受 Q-012，缓存受 Q-001。本轮无可独立实现而不改可见行为/猜规则的缺口，已登记延期。

DEV-3 GRW-002 复核：四主题稳定 ID 路由及花朵/无栈返回源码已存在；真实标签、成长提示/状态仍受 Q-016/Q-006/Q-005。未知/缺省 tag 当前回落至静态 friends 组，默认/失效展示待 Q-016，不改正式行为；无其他独立可开发缺口。

DEV-3 GRW-003 增量：锚点列表 API 三层校验单值 tagId/十进制分页，服务层 malformed input 不开启 transaction，客户端绑定响应 tagId/page/pageSize。新增 regression 留待 TEST；不改真实 provider、迁移或 UI。

DEV-3 GRW-004 增量：纠正读取严格解析来源版本 query，controller/service/repository 拒绝 malformed inputs；客户端把读写响应绑定到目标日记、版本、锚点与命令内容。新增 regression 留待 TEST，幂等/并发语义与 UI 不变。

DEV-3 GRW-005/006 复核：成长授予/统计和报告授权/质量/留存依赖 Q-005/Q-006/Q-001/Q-002/Q-016；当前没有安全、独立且不改正式 UI/数据说明的可开发项。GRW-006 provider/contract/mock 状态机保留为开发边界，不称真实报告完成。

DEV-3 INT-001 复核：跨任务真实端到端仍依赖前置业务接线、migration、设备/文件/provider 和 Q 决策；backend 编译域无法直接容纳 Expo Store harness，专用跨栈 harness 留在 TEST 阶段设计。没有可独立形成真实交付的 DEV 代码。

DEV-3 BAS-002 route audit：静态检查当前 12 个 backend controller 的 protected routes，均先解析设备身份；health 与 photos capabilities 也要求身份。没有新增代码缺口；身份回归仍待 TEST，公开投影/真实 provider/正式账号边界继续未完成。

DEV-3 BAS-003/DIA-001 增量：文件快照清理的文件系统异常现传播至 Store issue-log 路径，避免误报已清理；详情 repository 发请求前验证 diary ID，并绑定成功响应到相同 ID。adapter/repository regression 待集中 TEST，CASE 状态不变。

DEV-3 CRE-005 增量：generation repository 绑定创建响应的 draft/version/idempotency key、轮询/取消响应的 jobId；Store 再核验当前 draft、round/key 和活动 jobId。新增 regression 留待 TEST，不改变自动重试/质量规则或 UI。

开发状态独立于 [验收矩阵](autonomous-acceptance-matrix.md)；此前通过结果不自动证明本轮完整开发完成。42 项任务现均已完成逐项 task/CASE/源码盘点；本轮局部实现仍不等同于任务全部交付，开发工作量百分比暂不计算。TEST-1/2 结果和 CASE 结论见下方，不据此虚增验收矩阵 passed 数。

## 本轮状态定义

`未盘点`、`实施中`、`本轮实现完成待测试`、`mock 业务完成待接入`、`已有实现待复验`、`延期/阻塞` 为互斥的任务主状态；一项任务存在混合能力时，在明细中分别记录，不能把外部延期任务整体算作真实交付完成。

每项盘点需写源码依据、已实现业务、缺口、mock 范围、延期能力、待测 CASE 和下一步，随后从下面范围表拆出具体任务行。状态不能只根据文件存在或历史测试通过推定。

## 全范围盘点入口

| 范围 | 任务数 | 包含任务 | 当前主状态 |
| --- | --- | --- | --- |
| 基础 | 4 | BAS-001、BAS-002、BAS-003、BAS-004 | BAS-001～003 已盘点、存在契约/留存/投影缺口；BAS-004 已完成自身 A01～A05 |
| 导航与联调 | 2 | NAV-001、INT-001 | NAV-001 已盘点、正式入口/深链矩阵部分受决策约束；INT-001 依赖全任务与真实链路，后置 |
| 创作 | 6 | CRE-001、CRE-002、CRE-003、CRE-004、CRE-005、CRE-006 | CRE-001～004、CRE-006 已有实现待复验；CRE-005 本轮补生产 mock 隔离，待类型/编译检查与集中测试 |
| 日记与回忆 | 7 | DIA-001、DIA-002、DIA-003、DIA-004、DIA-005、DIA-006、DIA-007 | DIA-001～005、DIA-007 已有实现待复验/规则与外部条件延期；DIA-006 本轮补齐全页回忆聚合，待测试 |
| 隐私与分享 | 5 | SHR-001、SHR-002、SHR-003、SHR-004、SHR-005 | 现有隐私保存/投影/匿名资产/预览/本地导出实现待复验；外部渠道与决策范围延期 |
| 素材 | 5 | MAT-001、MAT-002、MAT-003、MAT-004、MAT-005 | MAT-001～003 已有实现待复验/资产留存延期；MAT-004 等 PET-001；MAT-005 本轮实现 provider/Store 骨架待测 |
| 明信片 | 2 | PCD-001、PCD-002 | 已盘点；PCD-001 保留用户暂停决定，PCD-002 依赖真实 PCD-001 资产与 Q-013/Q-014 |
| 陪伴 | 2 | PET-001、PET-002 | PET-001 实施中；PET-002 已盘点，统计/锚点待决策 |
| 发现 | 3 | DSC-001、DSC-002、DSC-003 | DEV-2 已增加显式发布快照读取/详情/设备级幂等点赞 API；页面与发布写入未接线，Q-007 决策分支仍待定 |
| 成长 | 6 | GRW-001、GRW-002、GRW-003、GRW-004、GRW-005、GRW-006 | GRW-003/004 migration 已在 TEST-13 disposable schema 部署无 drift，TEST-14 增加 read/correction 服务数据库子集；真实 provider、Q 决策和正式页面仍未接线，CASE 仅部分执行；GRW-001/005 仍受统计/成长决策约束；GRW-002 稳定 tagId 路由和 GRW-006 report/provider 骨架待测 |

统计：42 项范围均已做任务级依赖分类，并已完成 42/42 逐项源码盘点。当前按互斥主状态重算：整项任务实现完成 1 项（BAS-004）、mock 业务完成 0 项、已有实现待复验 21 项、延期/决策阻塞 7 项、实施中 13 项（PET-001、CRE-005、DIA-006、MAT-001/002、MAT-005、DSC-001/002/003、GRW-002/003/004/006）。开发工作量百分比不计算，盘点完成不代表开发完成。前端最近完整回归仍为 TEST-11 的 55/55 suites、443/443 tests；TEST-14 后端 unit 17/17 suites、199/199 tests，隔离 MySQL e2e 49/49，root typecheck、backend build、Prisma migration status/diff 与 `git diff --check` 通过。真实 provider、设备、文件和受 Q 约束的正式入口仍未验收。

## 测试缺陷与修复闭环

| 缺陷 | 输入 / 环境 | 预期与实际 | 严重度 / 影响 | 修复与复测 |
| --- | --- | --- | --- | --- |
| MAT-005-D1，mock 静态资源未被识别 | `hybrid-dev` Store；描述“日落时分，老街亮起温柔的灯”；Jest 将资源导入映射为 `{ testUri: ... }` | 预期可读 bundled image 入库；初测 `generateMaterialImage` 返回 `provider_failed`，未登记资产 | S2；只阻断新 Store 的本地 mock 成功，正式页面未接线，无既有素材或外部服务影响 | `hasReadableImageSource(...)` 统一接受原生数字句柄、URI 资源对象和 Jest `testUri`；TEST-2 定向 MAT-005 7/7，前端全量 340/340 通过 |
| MAT-005-D2，取消未能结束尚未启动/未响应的调用 | 有效请求后立即取消；可控 provider 不响应 AbortSignal；Jest 5 秒超时 | 预期取消后 Promise 返回 `cancelled` 且迟到结果不入库；初测调用超时，provider resolver 尚未建立 | S2；可能留下未结束的 Store 调用；无持久化或外部副作用 | Store 对 provider/readability 等待与 abort 信号竞速，并在启动前检查当前状态；TEST-2 定向断言和全量 Jest 通过，迟到结果仍不登记 |
| DSC-TEST-01，service 单测漏配 Prisma mock | 社区详情“未发布/不存在” service 用例；mock PrismaService | 预期未发布故事返回 `not_found`；首次实际抛 `TypeError`，原因是测试替身未定义 `discoveryStory.findFirst`，不是生产查询失败 | S3；仅测试夹具缺失，不影响 API/数据库/用户数据 | 补充 `findFirst` mock 并断言 query filters；该中间复测时 8 suites / 74 tests 通过；后续增加 category guard 后最终 TEST-4 为 8 suites / 77 tests 全通过 |
| DSC-TEST-02，category 仅由 service 校验 | Controller test 使用已 mock service；category 分别缺省、`recommended`、`local` | 预期 API 边界拒绝未确认类别；首次 controller 把值交给 mocked service 并返回成功，真实 service 原本会拒绝 | S2 边界缺口；仅单测替身绕过了真实 service 校验，未读取数据 | Controller 改为显式要求 `category=latest` 并在查询前拒绝其他值，service 层保留二次校验；backend unit 8 suites / 77 tests 和 build 全通过 |

TEST-1 初测：`npm test -- --silent`，45 suites / 340 tests，338 passed、2 failed；当时 backend unit 为 6 suites / 61 tests 全通过。社区首次测试（TEST-3）为 7/8 suites、74/77 tests 通过：一项 service fixture 漏配 `findFirst`，另三项 controller 测试暴露 category 入口未拒绝缺省/推荐/同城。DEV-3 修正 fixture 并在 controller 加显式 category 白名单后，TEST-4 `npm --prefix backend run test -- --silent` 为 8 suites / 77 tests 全通过，backend build 通过。TEST-2 定向 MAT-005 7/7、前端全量 45/45 suites / 340/340 tests、`npm run typecheck`、`git diff --check` 通过。两条 MAT 缺陷见 [MAT-005 CASE](../test-cases/MAT-005.md)，两条社区测试发现均保留在本台账。上述本地测试不等于真实 provider、published snapshot MySQL/e2e 或完整业务 CASE 通过。`E2E_DATABASE_URL` 未配置，数据库 e2e 未运行。

## DEV-1 / DEV-2 / DEV-3 实施明细

| 任务 | 状态 | 源码依据 | 本轮开发内容 | mock / 外部能力 | 缺口与待测范围 |
| --- | --- | --- | --- | --- | --- |
| PET-001 | 实施中 | `src/services/chat-reply-provider.ts`、`src/store/create-app-store.ts`、`src/types/diary.ts`、`backend/src/modules/chat/chat-sessions.{controller,service,module}.ts`、`backend/src/modules/chat/chat-sessions.{controller,service}.spec.ts`、`backend/prisma/schema.prisma`、`backend/prisma/migrations/20261016001000_pet_chat_sessions/migration.sql`、`src/contracts/pet-chat-contract.ts`、`src/repositories/http-pet-chat-repository.ts`、`src/repositories/__tests__/http-pet-chat-repository.spec.ts`、`src/store/adapters/backend-pet-chat-adapter.ts` | 在既有 provider/request state 外新增设备归属会话列表/详情、用户消息 pending turn、回复完成、固定失败码、显式重试 attempt、稳定 turn 排序和幂等重放；前后端 contract 与 HTTP repository 已建并注入 adapter。DEV-3 本轮另加严格分页 query wire guard 及 service 二次校验；正式页面与 Store send/retry 未接 repository，UI/UX 未改。默认 chat/image/report mock 已额外限定 `hybrid-dev` 开发运行时 | 回复仍由现有 `ChatReplyProvider` 提供；hybrid-dev 开发 mock 标注 `source: mock`；当前无可信服务端 provider，production 在创建/重试/回复写入前 fail closed，所有非测试运行环境拒绝客户端自报 `source: provider`。开发 mock 不混标 provider。服务不硬编码回复或静默将持久化失败当成功。真实模型与质量评测受 Q-002；migration 已在 TEST-13 disposable schema 部署，但不建立 Q-001 未确认的 retention/TTL/跨设备承诺 | TEST-13 schema 部署 6/6 migrations 无 drift；backend unit 17/199 通过。CASE-PET-001-001～009 仍未执行，持久 API 尚无数据库 e2e 断言；正式页面 send/retry 未接 repository；Q-001/Q-002/Q-003 及可见失败/重试接线仍待处理 |
| BAS-001 | 已有契约，扩展待实施 | `src/contracts/core-diary-contract.ts`、`src/contracts/ai-image-generation-contract.ts`、`src/contracts/insight-report-contract.ts`、`docs/reference/delivery/contracts/core-diary-v1.md`、`docs/reference/delivery/contracts/ai-image-generation-v1.md`、`docs/reference/delivery/contracts/insight-report-v1.md`、`docs/reference/delivery/contracts/discovery-read-v1.md`、`backend/src/modules/generation/generation.controller.ts`、`backend/src/common/diary-generation-evaluation.ts` | DEV-3 已补配图/洞察版本 contract、回忆日期校验、generation create 字段/版本运行时校验及同键幂等载荷保护；保存、草稿和 rewrite API 进一步明确 body runtime guard 与 identity precedence。新增 regression 均待集中 TEST | 社区发布写入、匿名投影、推荐/同城与撤回规则仍受 Q-007/Q-013；成长统计/导出业务规则及 AI 正式质量标准仍受相关 Q 限制 | CASE-BAS-001-004 质量通过仍受真实 provider/Q-002 限制；CASE-BAS-001-005 进行中；本轮 request/controller/repository/e2e regression 待集中 TEST |
| BAS-002 | 已有基础服务，发布/投影/其他对象待实施 | `backend/src/common/device-identity.ts`、`backend/src/common/memory-store.service.ts`、`backend/src/modules/{diaries,memories,sharing,discovery}/*.controller.ts`、`backend/src/modules/generation/generation.controller.ts`、`backend/src/modules/drafts/drafts.controller.ts`、`src/services/api-client.ts`、`src/repositories/http-core-diary-repository.ts` | 已有设备身份、日记保存/读取、回忆查询、隐私范围写入；DEV-2 增加显式 published snapshot 社区读取/点赞；DEV-3 generation、draft、sharing、rewrite 在服务边界验证请求字段，保存命令重放前校验结构并按草稿/来源版本绑定幂等 key | 不从 Diary privacy 自动发布；公开投影/匿名与撤回受 Q-007/Q-013；真实账号范围受 Q-012；未配置 AI 服务不得回退 mock 成功 | 社区 read model 来源/客户端接线和完整对象权限矩阵仍缺；本轮 generation/save/draft/sharing/rewrite 新回归未运行；CASE-BAS-002-003 partial、A05 双环境部分未执行 |
| BAS-003 | 已有部分持久化，留存/资产待决策 | `backend/prisma/schema.prisma`、`backend/src/common/memory-store.service.ts`、`backend/test/app.e2e-spec.ts`、`src/services/draft-snapshot-storage.ts`、`src/services/__tests__/draft-snapshot-storage.spec.ts`、`src/contracts/core-diary-contract.ts`、`src/repositories/http-core-diary-repository.ts`、`src/store/create-app-store.ts`、`src/store/__tests__/diary-domain.spec.ts` | DEV-3 串行化本地草稿快照 save/clear、持久化 `editRevision`，修复 localStorage/文件系统坏快照 fail-open，并收紧日记正文读取 contract；数据库 scalar/array 坏快照下发 invalid marker、Store 隔离；回忆 hydration/search 恢复远端 `publicBlockIds`；release 默认不注入样例日记/照片，空 `currentDiaryId`、月份 selector 不再指向样例记录，无种子日记时可创建空白草稿。新增延迟写、修订恢复、损坏快照、公开选段及 release runtime 回归待测。`npm run typecheck`、backend build、隔离 e2e 文件 `tsc --noEmit` 与 `git diff --check` 通过；未运行 Jest/e2e/数据库持久化复验 | Q-001/Q-015 限定完整留存范围；Q-005/Q-016/Q-012 仍限制正式统计、锚点与资料/VIP 语义；未增加数据库字段或迁移 | 聊天/锚点等仓库、资产 URI 生命周期、历史正文回填及更广泛数据库损坏恢复仍缺；CASE-BAS-003-001/002/005/006/007 未闭环 |
| BAS-004 | 已完成（本任务 A01～A05） | `jest.config.js`、`src/test-utils/fakes/create-async-fault-plan.ts`、`backend/src/scripts/run-e2e-tests.ts`、`backend/test/jest-e2e.json`、`backend/test/e2e-database-safety.ts`、`tools/run-domain-tests.js` | 分层测试、故障注入、隔离 e2e 入口与正反序 runner 已验证；direct Jest setup guard 要求显式本机隔离 `E2E_DATABASE_URL` 与 `DATABASE_URL` 一致 | 测试替身与真实 provider/设备/文件证据分离；e2e 限定本机专用 test/e2e schema；临时 schema 测试后清理 | TEST-13/14 direct Jest setup guard 正常启动，当前完整隔离 MySQL e2e 49/49；backend unit 17/199、migrate status、schema diff、backend build、typecheck、diff check 通过；CASE-BAS-004-001～005 均通过 |
| CRE-001 | 已有实现待复验 | `src/services/photo-permission.ts`、`app/permission/photos.tsx`、`app/_layout.tsx`、`app.json` | 系统媒体权限、说明页后请求、draft 关联、重复请求锁与迟到回调保护已实现；本轮无业务改动 | iOS 系统授权属于平台真实集成；Q-018 限定有限/拒绝/撤回矩阵 | CASE-CRE-001-006 未做真实 iOS 验证；决策分支待 Q-018，TEST 轮集中复验本地路径 |
| CRE-002 | 已有实现待复验/环境延期 | `src/services/photo-library.ts`、`app/album/select.tsx`、`src/components/diary/photo.tsx`、`src/store/create-app-store.ts` | 真实相册目录、分页、暂存确认、可读性复核和竞态隔离已实现；本轮按启动/变更门槛复核既有阻塞，不重跑 14 项 CASE | 使用 `expo-media-library`，不是第三方供应商 API；原生权限异常 E_NO_PERMISSIONS 及 Q-003/Q-008/Q-018 仍隔离记录 | CASE-CRE-002-007 设备读取阻塞；本轮未重试已知模拟器失败。集中 TEST 轮复验未被本轮代码影响的本地范围 |
| CRE-003 | 已有实现待复验 | `src/types/diary-capabilities.ts`、`app/create/template.tsx`、`src/store/create-app-store.ts`、`backend/src/common/memory-store.service.ts`、`backend/src/modules/drafts/drafts.controller.ts` | 旅行类型显式写入；客户端领域与真实后端拒绝未开放类型；DEV-3 服务层新增草稿 body 字段/枚举/版本 runtime 校验，历史 emotion 读取/编辑仍保留 | 无第三方依赖；照片数量/去重和历史来源存在性不在本次校验中新增规则 | 新 malformed-input e2e 未运行；既有 CASE-CRE-003-001～005 结果不变，TEST 轮集中复验 |
| CRE-004 | 已有实现待复验/规则延期 | `src/types/character-capabilities.ts`、`src/services/character-catalog.ts`、`app/create/character.tsx`、`src/store/create-app-store.ts`、`backend/src/common/memory-store.service.ts` | 角色目录白名单、草稿同步、浏览链路角色保留、无效角色拒绝及目录失败恢复已有实现 | 角色目录目前来自本地 catalog，不需第三方服务；角色更换是否重生成与浏览后是否二次确认受 Q-008/Q-009 | 代码无新的独立缺口；CASE-CRE-004-006 与决策相关分支保留待定，其他既有 CASE 集中复验 |
| CRE-005 | 本轮实施中/真实接入延期 | `backend/src/common/diary-generation.service.ts`、`backend/src/common/diary-generation.service.spec.ts`、`backend/.env.example`、`backend/src/common/memory-store.service.ts`、`backend/src/modules/generation/generation.controller.ts` | 增加 provider 生产门禁；DEV-3 补 generation create runtime 校验、同设备幂等键载荷一致性和并发 P2002 重放恢复。新增 request/controller/e2e regression 未运行 | deterministic mock 限于非生产；生产只允许显式配置的真实 provider。保留既有 `openai-compatible` 适配器，不发起外部请求 | 真实 provider 凭据、质量评测与 Q-002 策略延期；新增 generation validation/idempotency CASE 证据待集中 TEST |
| CRE-006 | 已有实现待复验/边界延期 | `app/companion/naming.tsx`、`src/store/create-app-store.ts`、`src/store/diary-domain.ts`、`backend/src/common/diary-generation.service.ts` | 命名只更新当前草稿人物元数据；保存失败保留输入，跳过保留候选；人物候选由生成结果而非旧草稿兜底 | deterministic 结果仅供开发，不当作真实识别；Q-003 命名边界、Q-010 跨作品记忆、Q-001 留存待定 | CASE-CRE-006-007 真实 AI/留存未验；正式输入计量待决策，其余既有 CASE 留待集中复验 |
| DIA-001 | 已有实现待复验/入口延期 | `app/diary/[id]/index.tsx`、`src/store/create-app-store.ts`、`src/repositories/http-core-diary-repository.ts`、`src/components/diary/{diary-paper,photo}.tsx` | 真实单篇读取、loading/not-found/error 区分、旧回包保护、角色布局及坏图占位已有实现 | 公开菜单入口受 Q-009；锚点业务依赖 GRW-003/004 | CASE-DIA-001-001/006 部分执行，真实设备坏 URI未验证；A04/A05 依赖项未闭环 |
| DIA-002 | 已有实现待复验/新关联 guard 待静态检查/AI质量延期 | `app/diary/[id]/edit.tsx`、`src/store/create-app-store.ts`、`backend/src/common/diary-generation.service.ts`、`backend/src/modules/generation/generation.controller.ts`、`src/repositories/http-core-diary-repository.ts`、`src/contracts/core-diary-contract.ts` | 草稿隔离、逐块编辑、provider rewrite 接线、失败保留原文已有实现；DEV-3 controller/Store body guard 后又增加上下文指纹、目标响应关联、正安全整数版本和请求 ID 键编码 | `deterministic` rewrite 是非生产 mock；真实改写质量与策略受 Q-002/Q-003/Q-008 | 新增 Store/repository/contract 回归未运行；最新静态检查需重跑；CASE-DIA-002-008 真实质量未执行，CASE-DIA-002-009 待决策 |
| DIA-003 | 已有实现待复验/规则延期 | `src/store/create-app-store.ts`、`src/store/diary-domain.ts`、`app/diary/[id]/edit.tsx`、`app/album/select.tsx` | 整篇照片引用归一化、段落引用合并、关联图片块同步、取消/失败不提交及换图后重生成门禁已有实现 | 继续使用真实相册资产；Q-003/Q-008/Q-001 决定上限、既有作品换图规则与留存 | CASE-DIA-003-009 待决策；本轮未重跑已记录 CASE |
| DIA-004 | 已有实现待复验/规则延期 | `app/create/character.tsx`、`src/store/create-app-store.ts`、`src/components/diary/diary-paper.tsx` | 更换角色复用原编辑草稿，保留正文/照片引用，保存仍用原日记 ID；目录失败与取消有既有保护 | Q-008 尚未确认更换角色是否需重生成 | CASE-DIA-004-006 待决策；本轮未重跑既有页面/领域 CASE |
| DIA-005 | 已有实现待复验/规则延期 | `src/store/create-app-store.ts`、`src/types/diary.ts`、`src/repositories/http-core-diary-repository.ts`、`backend/src/common/memory-store.service.ts`、`backend/prisma/schema.prisma` | DEV-3 追加持久 `editRevision` 并纳入保存幂等键；保存期间修改时保留较新草稿并 rebase；后端保存命令重放前验证基本输入，并拒绝同设备 key 跨 `draftId` 或来源版本复用，保持同命令身份首次结果重放语义。新增 Store/MySQL 回归未运行 | Q-001 决定完整恢复范围，Q-008 决定既有作品换图下限；已有真实保存服务保留 | 新增保存键身份冲突 e2e 与并发保存 Store regression 待集中 TEST；CASE-DIA-005-010 仍待决策 |
| DIA-006 | 本轮实施中/Q规则延期 | `backend/src/modules/memories/memories.controller.ts`、`backend/src/modules/memories/memories.controller.spec.ts`、`src/repositories/http-core-diary-repository.ts`、`src/repositories/__tests__/http-core-diary-repository.spec.ts`、`src/store/create-app-store.ts`、`src/contracts/core-diary-contract.ts`、`app/(tabs)/memories.tsx` | 已有全页聚合防截断；DEV-3 校验 Gregorian 月/日并统一 wire format；controller 现拒绝非十进制/重复分页 query 和非字符串关键词，在读取数据前返回 `invalid_input`，设备身份优先。修改了一个旧 e2e 点分隔日期夹具为合法 wire format，保留原断言。新增 contract/repository/controller/store/UI 回归未运行；backend build、typecheck、diff check 通过 | 查询仍走自有后端；Q-004 的跨日月/近期分组规则未改；未约束时区 | CASE-DIA-006-010 与本轮 query/date 校验回归待集中 TEST；Q-004 下的 CASE-DIA-006-008/009 保持待决策 |
| DIA-007 | 已有实现待复验/真实文件延期 | `src/store/diary-domain.ts`、`app/profile/monthly.tsx`、`app/(tabs)/profile.tsx`、`src/services/monthly-export.ts`、`src/store/create-app-store.ts` | 月份分组/成员导航/空态及导出取消、失败、月份版本隔离已有实现 | 当前 export adapter 仅返回“合集预览”，明确不写文件；真实输出规格/权限依赖 Q-011/Q-001，跨月归档依赖 Q-004 | CASE-DIA-007-006/007/008 待决策；本轮不把预览当真实交付，不运行文件/设备 CASE |
| SHR-001 | 已有实现待复验/决策延期 | `app/share/privacy.tsx`、`src/store/create-app-store.ts`、`backend/src/modules/sharing/sharing.controller.ts`、`backend/src/common/memory-store.service.ts`、`backend/src/modules/sharing/sharing.controller.spec.ts` | 四种隐私范围真实持久化、选段校验、暂存/提交、失败保留及 D1/D2 竞态保护已有实现；DEV-3 controller/Store 新增分享 body runtime guard，身份错误优先 | 真实社区发布/身份受 Q-007，入口返回受 Q-009，公开撤回与完整留存受 Q-013/Q-001 | 新 malformed-body controller regression 未运行；CASE-SHR-001-008 待决策，既有 CASE 状态不变 |
| SHR-002 | 已有实现待复验/公开读取延期 | `src/store/diary-domain.ts`、`app/share/result.tsx`、`backend/src/common/memory-store.service.ts` | `publicBlockIds` 统一投影过滤正文/图片/封面/摘要/海报；私密预览保持整篇，非法/空选段服务端拒绝 | 本地规则可执行，无外部 API；Q-013/Q-014 限制跨段图片归属和最终导出，后端尚无公开内容读取 API | CASE-SHR-002-007 待决策；不能把范围保存成功当公开读取完成，本轮不改正式分享页面 |
| SHR-003 | 已有实现待复验/真实视觉延期 | `src/store/diary-domain.ts`、`src/services/share-asset-preparation.ts`、`src/services/__tests__/share-asset-preparation.spec.ts`、`src/components/diary/photo.tsx`、`app/share/result.tsx` | 已知姓名/别名匿名投影、选段组合、人脸坐标裁切及 PNG 像素遮挡均已有实现；DEV-3 默认可读性校验实际读取本地文件并核对 PNG signature/IHDR/尺寸，拒绝非本地 URI 和损坏文件；新增 regression 待测，typecheck/diff check 通过 | 不依赖模型 API；Q-013 限定无标记/漏检/元数据语义，Q-014 限定正式导出规格 | CASE-SHR-003-002/005/006 仍 partial；新 regression 未运行，正式页没有接入匿名资产失败状态 |
| SHR-004 | 已有实现待复验/页面状态延期 | `app/share/result.tsx`、`src/store/diary-domain.ts`、`src/services/share-asset-preparation.ts` | 海报/全文预览共用当前投影、无效目标空态、关闭回原页及目标切换保护已有实现 | 本地预览不要求第三方；Q-014 阻塞正式版式/真实二维码，Q-009 阻塞常规入口 | CASE-SHR-004-005/007 未闭环；异步渲染加载/错误反馈证据未补，正式 UI/UX 本轮未改 |
| SHR-005 | 已有编排与本地文件，平台/页面接线延期 | `src/services/share-delivery-orchestrator.ts`、`src/services/share-export-file-service.ts`、`src/services/share-asset-preparation.ts`、`app/share/result.tsx` | 服务层有私密外部分享拦截、准备/确认分离、按作品+版本+出口去重；本地 PNG/PDF 可写文件，PDF CJK 字体映射已有 macOS 预览证据 | 正式页面仍调用 `recordShareDemo(...)`；平台 adapter 明确 unsupported，不写真实成功记录。Q-013/Q-014/Q-001 限制平台、规格、权限和文件留存 | CASE-SHR-005 多项 partial/待决策；本轮未运行文件/系统分享/外部渠道测试，不擅自接线改变反馈 |
| MAT-001 | 实施中：设备照片导入 service/Store action 已建，页面待接线 | `src/services/photo-library.ts`、`src/services/__tests__/photo-library.spec.ts`、`src/store/create-app-store.ts`、`src/store/__tests__/material-photo-import.spec.ts`、`app/library/index.tsx`、`src/components/diary/photo.tsx`、`app/postcard/index.tsx` | 新增可注入真实 MediaLibrary 资产导入、现有权限读取、顺序 Image.getSize 解码探测、非网络 URI/source 校验、整批失败隔离、设备 ID 去重及 mock ID 冲突拒绝；Store 只在校验后原子登记资产与素材成员，同系统 ID 重导刷新当前 URI。原有目录隔离/多消费者 URI 解析保留，正式上传 sheet 仍未接 action | 不主动请求权限、不下载 iCloud 资源、不改正式 UI/UX；URI 重启留存受 Q-001/Q-015，格式/容量/元数据受 Q-003，设备权限矩阵受 Q-018 | 本轮 `npm run typecheck`、`git diff --check` 通过；新服务/Store Jest 已编写未运行；无真实 iOS 解码/导入证据，CASE-MAT-001-001/003/004/005/006 状态不变；页面接线需 UI/UX 授权 |
| MAT-002 | 实施中：修复当前草稿素材追加覆盖，真实资产链路待接 | `app/library/index.tsx`、`app/__tests__/library-screen-material-apply.spec.tsx`、`src/store/create-app-store.ts`、`src/store/diary-domain.ts`、`backend/src/common/memory-store.service.ts`、`backend/test/app.e2e-spec.ts` | `applyPhoto(...)` 现基于被复用草稿的当前首个 text block 追加去重照片 ID；保留未保存正文/标题/摘要/引用，不再用 saved diary 引用覆盖草稿；目标不存在/无正文仍在新建草稿前阻断，页面反馈/导航不变。已有 store→repository 请求断言及隔离 MySQL保存/读回证据保留 | 新真实设备导入 service 仍未接素材页，fixture 不证明 P4 文件真实可读或单次 app-to-backend 联调；Q-015 的 A04 CASE 语义仍待确认，Q-001/Q-015 的 URI 留存范围不推断 | 新增现有草稿保留 regression 已写未运行；CASE-MAT-002-004 仍待决策，002/005 仍 partial；本轮未运行数据库 e2e |
| MAT-003 | 已有预览映射待真实明信片输出 | `app/library/index.tsx`、`src/theme/assets.ts`、`app/postcard/index.tsx` | 八种开放贴纸/印章有稳定资源映射，关闭无副作用；`stampKyoto` 路由可传到卡片预览 | PCD-001 当前 `make()` 不产生实际图像文件；未知装饰语义受 Q-015/Q-009 | CASE-MAT-003-002 partial、004 未执行、005 待决策；不把卡片预览当生成资产 |
| MAT-004 | 页面输入骨架已有，服务链路依赖 PET-001 | `app/library/index.tsx`、`src/store/create-app-store.ts`、`src/services/chat-reply-provider.ts`、`backend/src/modules/chat/*`、`src/repositories/http-pet-chat-repository.ts` | 空白提交拦截、灵感卡与未提交关闭无副作用已有实现；页面把当前问题与回答拼成一条用户消息，Store 为本地 mock turn 生成 request ID。DEV-3 已新增 PET-001 持久会话/turn/message API 与 client repository，但素材入口/Store 未调用该 repository | 问题/回答未经 PET 持久 API 关联，失败和恢复也未接入页面；真实 provider 未配置。网络等待/失败反馈受 UI/UX 冻结，Q-001/Q-002/Q-003 未决；migration 已在 TEST-13 disposable schema 验证，但不建立产品留存承诺 | CASE-MAT-004-002～005 保持阻塞/未完成；正式入口接线需满足可观察恢复授权；本轮不将本地 mock 或未测 PET API 计为真实 CASE |
| MAT-005 | 实施中：本地 Store 增量已复测，真实能力延期 | `src/services/ai-image-generation-provider.ts`、`src/contracts/ai-image-generation-contract.ts`、`docs/reference/delivery/contracts/ai-image-generation-v1.md`、`src/store/create-app-store.ts`、`src/store/__tests__/material-image-generation.spec.ts`、`app/library/index.tsx` | 历史 TEST-2 定向 7/7、全量前端 340/340 通过；DEV-3 增加配图版本契约与 Store runtime 校验，新回归待测 | `source: mock` 明确，仅混合开发模式启用；非开发模式 fail closed；真实图片模型/文件持久化未接。正式页面仍走 `photo-9` 示例路径；UI/UX 未获授权前不接线 | 新 contract regression 待集中 TEST；历史本地回归通过不替代真实 CASE；真实资产、MAT-002/PCD-001、Q-001/Q-002/Q-003/Q-015 与页面反馈边界仍待闭环 |
| PCD-001 | 已有预览/真实渲染暂停 | `app/postcard/index.tsx`、`app/__tests__/postcard-screen-assets.spec.tsx`、`src/theme/assets.ts` | 当前可读取预设/注册素材与装饰 ID；`make()` 仍仅设置 `generated=true`，无真实卡片渲染资产 | 用户此前暂停决定继续有效；增加渲染依赖并改成功时序/失败反馈需重新授权 | CASE-PCD-001-003/004/005 继续暂停；本轮不加依赖、不改页面、不制造假 PNG |
| PCD-002 | 已有出口演示/平台及输出待决策 | `app/postcard/index.tsx`、`docs/reference/delivery/tasks/PCD-002.md` | 页面现有微信/朋友圈/保存选项只显示本地 Alert；无真实文件、系统保存或平台 adapter | 依赖 PCD-001 当前卡片真实资产；渠道/权限/输出语义受 Q-013/Q-014，文件留存受 Q-001 | 所有真实出口 CASE 未执行/待决策；保留演示与正式交付区分，不接平台或生产出口 |
| NAV-001 | 已有实现待复验/入口决策延期 | `src/hooks/use-diary-flow.ts`、`src/components/navigation/bottom-tabs.tsx`、`app/modal/more-actions.tsx`、`app/diary/[id]/replace-photos.tsx` | 草稿离开确认、more-actions ID 传递与换图草稿复用已有实现；页面映射覆盖和路由安全边界已盘点 | 正式详情入口受 Q-009；权限恢复/深链受 Q-018；未新增正式 UI/路由 | CASE-NAV-001-003 待决策；001/002/004/006 矩阵仍 partial，集中 TEST 轮验证 |
| INT-001 | 全局集成后置 | `docs/reference/delivery/tasks/INT-001.md`、`docs/reference/delivery/test-cases/INT-001.md`、相关 repositories/services | task/CASE 明确列出 J-01～J-06 真实端到端流程；当前各模块尚有真实 provider、设备、文件、Q 决策缺口，无独立可提前闭环的端到端代码 | 真实设备/外部 provider/平台环境及数据隔离要求按各 task/CASE；不使用跨栈 mock 成功替代真实证据 | CASE-INT-001-001～008 保持未执行/待决策，待所有依赖业务闭环后统一执行 |
| PET-002 | 决策/统计读模型与默认集合延期，本轮复核无独立可开发项 | `app/(tabs)/pet.tsx`、`src/store/diary-domain.ts`、`app/profile/anchors.tsx`、`src/repositories/anchor-read-model-repository.ts` | 萌宠页日记统计沿用 `SAMPLE_BASELINE`、锚点数写死 12，页面锚点组/成员仍为静态 ID；现有 anchor repository 只支持显式 `tagId` 查询，没有统计聚合 repository。入口路由和当前静态页空态已存在，但不等于真实数据空态 | Q-005 决定统计范围，Q-016 决定锚点来源/默认分类，Q-001 决定缓存/恢复；不选择默认 tag、不移除固定展示或增改正式反馈 | CASE-PET-002-001～006 未执行；待 Q-005/Q-016 与共享真实读模型明确后接线，届时按 Q-001 定义恢复范围 |
| DSC-001 | DEV-2/3 后端查询与客户端 repository 已建，页面/发布源未接线 | `backend/src/modules/discovery/*`、`src/contracts/discovery-contract.ts`、`src/repositories/http-discovery-repository.ts`、`src/store/adapters/backend-discovery-adapter.ts`、`app/(tabs)/discover.tsx` | 独立 published 快照读取、字段搜索、显式 `category=latest`、稳定排序、分页与响应校验；DEV-3 对分页十进制编码、重复参数与非字符串 keyword 加 controller/service 双层 guard；未从 Diary privacy 自动发布，未决分类 fail closed | Q-007 发布源/推荐/同城/撤回、Q-001 缓存仍未定；正式列表页仍为本地 mock | TEST-13 对应 migration 已在 disposable schema 部署且无 drift；backend unit 17/199 通过，但没有 seed published story 的 DSC API e2e，页面未接线；CASE 状态不变 |
| DSC-002 | DEV-2/3 后端详情和客户端 repository 已建，页面未接线 | `backend/src/modules/discovery/*`、`src/contracts/discovery-contract.ts`、`src/repositories/http-discovery-repository.ts`、`app/discover/[id].tsx` | 按稳定 story ID 读取已发布独立快照；不回查日记表，未发布/未到时/撤回统一 not_found；client 校验字段及结构化错误 | Q-007/Q-013 发布投影、匿名及撤回；Q-001 缓存；详情页仍未接 repository | TEST-13 migration 在 disposable schema 部署无 drift；本轮尚无 published fixture 的 API e2e，前端/client Jest 属于本地层且无身份切换集成；CASE 未通过 |
| DSC-003 | DEV-2/3 后端点赞和客户端 repository 已建，页面未接线；本轮错误/身份边界增量待集中测试 | `backend/src/modules/discovery/discovery.{controller,service}.ts`、`backend/src/modules/discovery/discovery.controller.spec.ts`、`src/repositories/{discovery-repository,http-discovery-repository}.ts`、`src/repositories/__tests__/http-discovery-repository.spec.ts`、`backend/prisma/schema.prisma`、列表/详情页面 | target-state PUT、设备唯一关系和客户端目标状态 repository，复用共享身份/超时 client；显式未启用点赞返回结构化 `interaction_not_available`（HTTP 409）；discovery 路由先解析 `x-device-id` 再校验输入，仅允许显式启用的已发布记录 | Q-007 点赞资格/撤回并发、Q-001 留存未定；页面还用本地点赞状态 | TEST-13 migration 在 disposable schema 部署无 drift；backend unit 17/199 通过；MySQL 并发/点赞 API/页面同步仍未验，CASE 状态不变 |
| GRW-003 | 实施中：provider/source-version boundary 与持久读模型/API/client repository 已建，待集中测试 | `src/contracts/anchor-contract.ts`、`src/services/anchor-extraction-provider.ts`、`src/services/anchor-extraction-service.ts`、`backend/src/modules/anchors/anchor-read-model.{controller,service}.ts`、`backend/src/modules/anchors/anchor-read-model.service.spec.ts`、`backend/prisma/schema.prisma`、`backend/prisma/migrations/20261016002000_diary_anchor_read_model/migration.sql`、`src/contracts/anchor-read-model-contract.ts`、`src/repositories/http-anchor-read-model-repository.ts`、`src/repositories/__tests__/http-anchor-read-model-repository.spec.ts`、`src/store/adapters/backend-anchor-read-model-adapter.ts`、`docs/reference/delivery/contracts/anchor-read-model-v1.md`、`app/profile/anchors.tsx` | request/result 绑定 diary/version/source block；provider run 按设备+日记+版本、requestId、attempt、snapshotHash 持久；写入锁来源日记行并验证 owner/version/source text/quote block；同结果重放幂等、旧 attempt/source version 冲突；MySQL 查询先连接当前设备/版本日记及成功 provider extraction，再用 JSON_TABLE 校验来源块并在数据库侧 count/page；mock 不入持久表；repository 注入 adapter，正式页仍使用静态锚点 | Q-016 约束 trigger/count/taxonomy/default/source changes；Q-002 质量/可信 provider/重试；Q-003 摘录边界；Q-001 留存/清理；无可信 server provider 时所有非测试运行环境写入 fail closed | TEST-13 migration 在 disposable schema 部署成功、无 drift；backend unit 17/199 通过，但 read-model DB lifecycle、JSON_TABLE 查询和 CASE-GRW-003-001～008 未实际执行；正式页仍静态 |

| GRW-001 | 统计/资料决策延期，本轮复核无独立可开发项 | `app/(tabs)/profile.tsx`、`src/store/diary-domain.ts`、`src/components/profile/growth-entry-card.tsx`、`app/(tabs)/pet.tsx`、`app/profile/insights.tsx` | 我的、萌宠和成长页面共用 `getDiaryStatistics(...)`，但它仍用固定 `SAMPLE_BASELINE` + 本会话记录；头像/昵称/VIP 为静态原型，资料 repository 尚无，现有导航/月份路由已能用 | Q-005 统计算法、Q-012 资料/会员范围、Q-001 留存/身份恢复待确认；不改正式数字、资料展示或设置行为 | CASE-GRW-001-001～007 未执行；待 Q-005/Q-012 与真实资料/统计读模型明确后恢复 |
| GRW-002 | 部分实施：稳定 ID 路由已有，真实读模型/决策延期 | `src/components/profile/growth-artwork.tsx`、`src/components/profile/growth-assets.json`、`app/profile/insights.tsx`、`app/profile/anchors.tsx` | 四个主题按钮通过稳定 ID 导航，锚点页兼容旧文案参数；花朵入口及无栈返回已有源码。未知/缺省 tag 仍回落静态 friends 组，正式默认/失效展示待决策；路由视觉未改 | 真实词表/关联受 Q-016，成长提示受 Q-006，统计受 Q-005；不使用静态四主题伪造真实个人集合 | `growth-artwork.spec.tsx` 待 TEST；CASE-GRW-002-001～007 未执行；Q 决策/读模型闭环后恢复 |
| GRW-003（DEV-1 基线） | 固定锚点映射仍在正式页面；提取服务边界见上方 DEV-3 行 | `app/profile/anchors.tsx`、`src/mocks/photos.ts`、`src/store/create-app-store.ts` | 页面仍以固定 `diary-*` 数组、首句/同行者匹配及样例封面回退展示；DEV-3 另建的 provider/service 尚未替换该数据源 | 提取方案/数量/触发与原文变化受 Q-016，质量受 Q-002，留存/身份受 Q-001，短摘受 Q-003 | CASE-GRW-003 未执行；固定页面映射不计真实锚点 |
| GRW-004 | 实施中：版本化纠正持久服务/API与客户端 repository 已建，待集中测试 | `backend/src/modules/anchors/anchor-corrections.{controller,service,module}.ts`、`backend/src/modules/anchors/anchor-corrections.{controller,service}.spec.ts`、`backend/prisma/schema.prisma`、`backend/prisma/migrations/20261016000000_anchor_corrections/migration.sql`、`src/contracts/anchor-correction-contract.ts`、`src/repositories/http-anchor-correction-repository.ts`、`src/repositories/__tests__/http-anchor-correction-repository.spec.ts`、`src/store/adapters/backend-anchor-correction-adapter.ts`、`docs/reference/delivery/contracts/anchor-correction-v1.md` | 读写按设备、日记、来源版本、anchor ID 定位；事务锁来源日记行并校验当前拥有者/版本、成功 provider extraction 中的真实 anchor ID 与 text/quote block；纠正版本 compare-and-update，保存命令设备级幂等；不改原日记正文。repository 注入 Store adapter，但正式页面未接线 | 未确认的 Q-001 留存期限、Q-003 输入长度、Q-016 源变化/下游传播不作推断；GRW-003 两项 migration 已在 TEST-13 disposable schema 部署且无 drift；无可信 server provider 时非测试运行环境拒绝锚点写入 | TEST-13 backend unit 17/199 与 migration smoke 通过；本轮 correction API DB lifecycle/query/身份 CASE 未执行，正式页面未接线；CASE-GRW-004-001～009 状态不变 |
| GRW-005 | 决策/真实成长读模型延期，本轮复核无独立可开发项 | `app/profile/flowers.tsx`、`src/components/profile/growth-artwork.tsx`、`src/store/create-app-store.ts` | 花朵页固定 2/3 进度和里程碑；`flowerUnlocked` 是内存 boolean，没有合格事件计算。`scenario=unlocked` 仍仅在既有 `__DEV__` 分支 | Q-006 决定成长资格/阈值/撤销，Q-005 决定统计输入，Q-001 决定留存；不扩大开发参数、不改展示 | CASE-GRW-005-001～006 未执行；规则与真实事件读模型明确后恢复 |
| GRW-006 | provider/contract/Store mock 边界已建，真实授权/质量/留存延期 | `app/profile/report.tsx`、`src/services/insight-report-provider.ts`、`src/contracts/insight-report-contract.ts`、`src/store/create-app-store.ts` | 版本化三维 contract、来源 ID/版本校验、同源防重、旧源 stale/cancel guard、mock 来源隔离和未配置 provider fail closed 已有源码；正式报告页仍为 demo path | mock 仅在开发运行时；无真实 provider/质量表；`flowerUnlocked` 不是服务端授权；远端报告留存与页面“仅本地”说明受 Q-001 | contract/Store Jest 待集中 TEST；CASE-GRW-006-001～008 未执行；真实 provider、报告 repository、接线待 Q-001/Q-002/Q-005/Q-006/Q-016 与 UI 边界明确 |

## 延期与恢复

- AI 推理、提取方案及平台专属交付按 [外部能力清单](../external-dependencies.md) 处理；业务层可用可替换 mock 开发，不再因真实凭据缺失停整项。
- 产品 Q 与 UI/UX 边界保留，相关分支单独登记；旧 CASE 设备/供应商证据缺失属于验收延期，不自动作为本地业务开发 blocker。
- PCD-001 此前暂停决定仍有效；上次中断时试写的跨 store/HTTP/MySQL backend e2e 直接引入 Expo/RN 类型，故已撤下该测试代码；既有 backend-only MySQL CASE 未改。backend 标准编译中另发现 Node 工程默认 DOM 类型与 Node 全局声明冲突，`backend/tsconfig.json` 限定 `lib: ["es2021"]` 后 `npm run build` 通过。集中 TEST 轮需设计不污染 backend TS 编译域的跨栈 harness，且不复用历史 40/40 证明新场景。
- 下一步仍在 DEV-3：MAT-003/004/005 已按 task、CASE、页面与 provider/service 复审；真实明信片 renderer 继续受 PCD-001 暂停，MAT-004 持久聊天接线受 UI/UX 冻结及 Q-001/Q-002/Q-003 约束，MAT-005 真实 provider/文件与页面反馈仍待外部能力/授权。PET、DSC 与 GRW 自有服务范围已审计；DIA-006 页面和 Store 统一发送 `YYYY-MM` / `YYYY-MM-DD`，内部筛选仍保持 `YYYY.MM`，重试夹具已对应 wire format。INT-001 依赖真实业务链路且没有可独立闭环的集成代码；此前跨栈测试实验会引入 Expo/RN 类型，不重复创建。BAS-003 已隔离 release 默认样例日记/照片并支持无样例创建；统计、锚点、资料原型数据仍受 Q-005/Q-016/Q-012 决策约束。BAS-003 另有快照/正文完整性及 `publicBlockIds` 恢复增量，相关回归待集中 TEST；本轮静态检查通过。完整开发盘点无独立可开发遗漏后，才进入集中 TEST。

## TEST 轮问题回流格式

| 轮次 | CASE/任务 | 输入/环境 | 预期与实际 | 严重度/证据 | 下一 DEV 轮修复 | 复测结果 |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-1 / DEV-2 / TEST-2 | MAT-005-D1/D2；见同名 CASE 文件 | hybrid-dev Store、Jest asset mapping、可控 provider | D1 初测拒绝 bundled image；D2 取消后调用超时。DEV-2 修复后定向及全量前端复测通过 | S2；TEST-1 为 338/340，TEST-2 为 340/340；无真实 provider/文件副作用 | 已修复资源映射与取消竞速；后续继续其他任务，不把局部测试计为真实配图 CASE | 定向 7/7、全量 45 suites / 340 tests、typecheck、diff check 通过 |

## DEV-3 BAS-002 身份边界增量（2026-10-16）

- `/photos/capabilities` 与 `/health` 现先调用 `resolveDeviceId(...)`；`discovery`、`chat`、`anchors`、`sharing` 也先解析身份再校验 query/body。`generation`、`diaries`、`drafts` 在受保护服务调用前解析身份，未发现提前解引用请求 body 的缺口。
- health e2e 与 photos、sharing、chat、anchor correction/read-model 的身份优先级 regression 已写；discovery 已有对应回归。新增/相关 Jest/e2e 均未运行，待 TEST 集中执行。
- 此增量不改变 BAS-002 主状态或 42 项任务主状态统计；BAS-002-A03/CASE-BAS-002-003 仍 partial，验收仍为 96/225（42.7%）。

## DEV-3 PET-001 响应契约校验（2026-10-16）

- `src/contracts/pet-chat-contract.ts` 加强持久聊天快照验证：turn 与 message 必须按 request ID 关联，消息 ID/turn sequence 唯一且排序稳定；pending/failed turn 不得带助手回复，failed 必须有固定失败码，completed 必须有唯一对应回复并保持来源元数据一致；拒绝孤立消息和空白正文。按 request ID 建索引，避免逐消息扫描全部 turn。
- `HttpPetChatRepository.failTurn(...)` 现于发请求前校验固定 failure code，拒绝运行时畸形值。
- 新增 `src/contracts/__tests__/pet-chat-contract.spec.ts` 并扩展 `src/repositories/__tests__/http-pet-chat-repository.spec.ts`，覆盖合法快照、畸形关联和未知 failure code；Jest 未运行，留待集中 TEST。正式宠物页仍未接持久 repository，UI/UX、migration、AI provider 均未改动。
- PET-001 CASE 状态不变；本地 typecheck/backend build/diff check 作为静态开发检查，不计验收通过。DEV-3 任务主状态总数不变。

## DEV-3 GRW-003 共享提取请求取消隔离（2026-10-16）

- 修复相同日记版本/快照共用 provider 请求时的取消串扰：每个 caller 的 `AbortSignal` 只取消自身等待；仍有 waiter 时保留底层提取，最后一个 waiter 退出才 abort provider。已取消/已结束的共享项不会被后续调用复用。
- `src/services/__tests__/anchor-extraction-service.spec.ts` 补充“一个 waiter 取消不影响另一个 waiter”回归，并强化单 waiter 取消时 provider signal 确实终止；Jest 未运行，待集中 TEST。
- 仅修正服务层并发边界；没有改变触发时机/标签/数量、自动重试、页面/UI、持久化或数据库。CASE-GRW-003-001～008 不变，验收仍为 96/225（42.7%）。

## DEV-3 GRW-004 幂等重放版本保护（2026-10-16）

- 修复旧纠正命令重放返回后续新纠正值的问题：服务对照命令记录的 `correctionVersion` 与当前纠正行；若已被后续命令取代，返回 `version_conflict`，避免把新值误报为旧请求结果。
- 不将历史纠正文复制到幂等命令快照，避免在 Q-001 留存期限未定时额外延长敏感文本副本的保留；没有新增 schema/migration 或改动持久数据。
- 新增 backend service regression 验证 v1 经 command-2 更新至 v2 后，command-1 重放返回冲突且当前值不变；Jest 未运行。`npm run typecheck`、backend build、`git diff --check` 通过。GRW-004 CASE 状态不变，待集中 TEST。

## DEV-3 DSC-003 点赞事务串行化（2026-10-16）

- `DiscoveryService.setLike(...)` 现在先锁定仍 published、未撤回的故事行，再检查 `likesEnabled`、写设备级 target state 并读取关系与计数；同一故事的服务端写入按数据库锁顺序串行，避免并发事务按旧快照返回陈旧计数。
- 新增 service regression 检查 row lock 先于 upsert、不可见故事不写关系。Jest 未运行；typecheck、backend build、diff check 通过。migration 未应用、数据库未触碰，列表/详情 Store 与页面未接线。
- 锁不决定网络乱序下哪个用户意图优先，Q-007 并发互动策略仍待确认；DSC-003 CASE 状态与验收通过数不变。

## DEV-3 GRW-006 旧来源失败回调隔离（2026-10-16）

- `generateInsightReport()` 的 catch 路径现在比较当前 sourceVersion 和活动 request：来源已变化/请求已被替代时状态归为 `stale`；显式取消仍是 `cancelled`；当前来源上的 provider 故障才归为 `failed`。迟到失败不覆盖新来源状态。
- Store 等待 provider 时与 AbortSignal 竞速；即使 provider 忽略 signal，显式取消仍会结束 action Promise，后续结果被 request/source guard 丢弃。
- 新增 Store regression 验证来源版本变化后收到旧 provider failure 仍返回 `stale`，以及 provider 忽略 AbortSignal 时取消仍及时结束；Jest 未运行，typecheck/diff check 通过。未接正式页面、未增加数据留存、未调用外部模型。
- Q-001/Q-002/Q-005/Q-006/Q-016 门控与 GRW-006 CASE 状态不变，验收通过数仍为 96/225（42.7%）。

## DEV-3 BAS-001 / CRE-005 generation 幂等载荷绑定（2026-10-16）

- `GenerationJob` 的数据库唯一键为 `(ownerDeviceId, idempotencyKey)`。`MemoryStoreService.createGenerationJob(...)` 现校验重放请求的 `draftId + draftVersion` 与原任务一致；不一致抛 `version_conflict`，并发创建遇到 Prisma `P2002` 后重新读取赢家任务并重复校验。
- 共享 request contract、客户端发包前校验、后端身份优先 body 校验及 response 正安全整数校验已接通。新增 contract/repository/controller regression 和隔离 MySQL e2e，覆盖有效重放、并发重复、同键不同草稿/版本冲突；均未运行，列入集中 TEST。
- 本轮最新 `npm run typecheck`、`npm --prefix backend run build`、`git diff --check` 通过。未运行 Jest/e2e，未调用 provider，未操作数据库；BAS-001/BAS-002/CRE-005 CASE 与验收通过数不变。
- MAT-002 跨栈 Store/HTTP/MySQL e2e 场景当前未纳入 backend 编译域；按既有台账记录保留为 TEST harness 待办，不将该场景视为已覆盖或通过。

## DEV-3 DIA-005 / BAS-002 保存命令身份保护（2026-10-16）

- `MemoryStoreService.saveDiaryWithCommand(...)` 现于幂等查询前校验保存请求的基本运行时结构、受支持隐私值、正安全整数版本、日期、public block ID 数组及完整正文快照，畸形输入结构化返回 `invalid_input`。
- `SaveCommand` 重放及并发唯一键竞争恢复现校验 `draftId + sourceDiaryId + sourceDiaryVersion`；同一设备幂等键被其他草稿或来源版本复用时返回 `version_conflict`。同身份重试仍返回首次保存结果；现有首次结果重放断言未改变。
- 新增隔离 MySQL e2e 覆盖跨草稿/来源版本重用；未运行。`npm run typecheck`、`npm --prefix backend run build`、`git diff --check` 通过；未运行 Jest/e2e、未操作数据库/provider。DIA-005/BAS-002 CASE 与验收 passed 数不变。

## DEV-3 CRE-003 / BAS-002 草稿建单 runtime contract（2026-10-16）

- `MemoryStoreService.createDraft(...)` 现于数据库操作前校验请求对象、可选 ID、类型/角色字符串、照片 ID 数组成员、支持的隐私枚举及正安全整数版本，畸形输入返回结构化 `invalid_input`。
- 该边界不增加照片数量/去重规则，也不要求历史编辑用 `sourceDiaryId` 在建单时必须存在；沿用现有 CRE-003 行为与 CASE 前置。
- 新隔离 e2e 覆盖畸形照片列表、隐私/版本、缺身份优先及失败不落库，尚未运行。前端 typecheck、backend build、diff check 通过；CRE-003/BAS-002 CASE 状态与验收 passed 数不变。

## DEV-3 SHR-001 / BAS-002 sharing body runtime guard（2026-10-16）

- `SharingController.project(...)` 现先解析设备身份，再验证未知 body 的对象结构、非空 `diaryId`、隐私枚举和选段数组；`MemoryStoreService.updateDiaryVisibility(...)` 增加服务层二次校验，避免畸形对象进入查询或写入。
- 新增 controller 回归覆盖缺失身份优先及 valid-identity 下 `null`/缺字段/非法隐私/畸形选段均返回 `invalid_input` 且不调用 Store；回归未运行。backend build、typecheck、diff check 通过，SHR-001/BAS-002 CASE 与验收通过数不变。

SHR-001 契约补充：`POST /sharing/project` 先要求有效设备身份，再验证 body 结构；非私密仍必须选择已持久化的文本/引用 block。当前 runtime guard 不更改四种范围含义、页面交互或公开发布规则。

## DEV-3 DIA-002 rewrite request runtime guard（2026-10-16）

- `GenerationController.rewriteBlock(...)` 现对未知 body 执行运行时验证，要求非空草稿/块/角色 ID、正安全整数版本、`text|quote` 类型、非空原文及字符串照片数组；身份先于 body 校验。`MemoryStoreService.rewriteDraftBlock(...)` 增加第二层校验。
- 新增 generation controller regression 覆盖 malformed body 不触发 Store、缺身份优先；尚未运行。backend build 与 diff check 通过；没有调用 AI provider，DIA-002 CASE 与验收 passed 数不变。

## DEV-3 DIA-006 MemoriesQuery wire validation（2026-10-16）

- `MemoriesController` 现仅接受十进制数字文本的 `page/pageSize`，拒绝指数/十六进制/小数/空白与重复 query 参数；month/day 与 keyword 也按运行时字符串校验，并保持设备身份优先。
- 修正既有隔离 e2e 日期筛选参数为 contract 的 `YYYY-MM` / `YYYY-MM-DD`，成功状态和结果断言保持不变。新增 controller regression 未运行；backend build/diff check 通过，`CASE-DIA-006-009` 决策状态和 `CASE-DIA-006-010` 未执行状态不变。

## DEV-3 BAS-004 direct e2e database guard（2026-10-16）

- 发现 `backend/test/jest-e2e.json` 可绕过 `run-e2e-tests.ts` 直接执行，存在只靠 Jest 配置读取开发 `DATABASE_URL` 的风险。现在配置加载 `e2e-database-safety.ts`，在 e2e spec/app 初始化前校验 `E2E_DATABASE_URL` 为允许的本机专用 schema，且与实际 `DATABASE_URL` 完全一致。
- 标准 runner 会把验证后的 URL 同时传给两个变量；`npm --prefix backend run test -- --runTestsByPath src/scripts/run-e2e-tests.spec.ts` 定向单测 4/4 通过，覆盖缺失/危险 URL 和 URL 不一致。未启动 e2e、未连接/清理数据库；backend build 与 diff check 通过。CASE-BAS-004-001 既有通过结论不因本轮新 guard 扩大，setup guard 的直接 e2e 启动效果留待 TEST。

## DEV-3 DSC-001 discovery query runtime guard（2026-10-16）

- `DiscoveryController.listStories(...)` 现先校验设备身份，再要求分页值为十进制整数文本、keyword 为单一字符串；`DiscoveryService.listStories(...)` 对 query 对象和 keyword 做第二层校验，malformed 请求不触发数据库查询。
- 缺省/recommended/local category 仍按 Q-007 fail closed，不改变页面或发布流程。新增 controller/service regression 未运行；backend build 与 diff-check 通过，DSC CASE/passed 数不变。

## DEV-3 CRE-006 人物 ID 关联边界（2026-10-16）

- Provider `normalizePeople(...)` 拒绝同一生成结果中的重复候选 ID；核心生成结果/保存快照 contract 与后端 `assertDiaryContentSnapshot(...)` 同步拒绝重复人物 ID。ID 被当前 Store 按候选定位并被命名页用于列表 key，因此只收紧该关联键唯一性，不增加名称唯一、角色唯一或跨作品记忆语义。
- 新增 `backend/src/common/diary-generation.service.spec.ts` provider regression、`backend/test/app.e2e-spec.ts` 同一 `jobId` 失败快照回归、core contract 与已有 save e2e 重复 ID 断言。全部未运行；未调用 provider、未操作数据库。CASE 状态与验收 passed 数不变；必要静态检查待本轮执行。

## DEV-3 DIA-001 详情路由缓存关联（2026-10-16）

- `app/diary/[id]/index.tsx` 的远端读取缓存现在带 `diaryId`，并在每次读取 effect 分支开始时递增请求版本；切换到本地完整作品会立即展示路由目标，旧在途读取不能覆盖或在返回旧路由时冒充新读取。
- `app/__tests__/saved-diary-screens.spec.tsx` 新增跨目标缓存、迟到回调和返回后再读回归，尚未运行；页面视觉、反馈、路径均未改变。DIA-001 CASE 状态及 96/225 验收通过数不变。

## 2026-10-16 执行规则更新：依赖就绪后易到难、两轮返工上限

- 当前阶段仍为 DEV-3；DEV-1 的 42/42 任务源码盘点已完成，不因本次规则调整重置轮次。当前互斥主状态统计仍按本台账现存范围表记录：整项实现完成 0、mock 业务完成 0、已有实现待复验 22、延期/决策阻塞 7、实施中 13。下一轮选择代码工作前，先基于 task 依赖给仍可执行任务标 `S/M/L`，并把具体由易到难候选队列写入本台账；当前尚未完成这次复杂度重排，不虚构任务排序。
- 新规则：依赖图优先，依赖就绪集合内按 `S → M → L`。初次开发不计返工；每项任务在失败验收后最多两轮合并修复，每轮后复测。两轮后仍未通过则标“达到返工上限，暂跳”，记录 CASE、缺陷、证据和恢复条件，转其他就绪任务。环境/产品 blocker 无修复机会不消耗计数；历史已有失败/修复只按 task/CASE 中可核实记录计数，无法核实的标“待审计”，不能默认清零。
- 中断前最新未验证增量：CRE-006 重复 person ID provider/save guard；DIA-001 详情缓存 diaryId 绑定；DIA-002 rewrite 绑定照片上下文及请求/响应目标。对应新增 provider、Store、repository、contract、screen/e2e 回归尚未运行。`npm run typecheck` 最近一次通过发生在 DIA-002 这批新改动之前；需恢复代码工作后补静态检查。验收矩阵仍为 96/225（42.7%），本次未增加 CASE passed。

## TEST-5 / DEV-4 / TEST-6 缺陷回流（2026-10-16）

- TEST-5 backend unit 为 16/17 suites、197/198 tests；`DiscoveryController.getStory` 缺少 identity 解析后的空 story ID guard，service mock 被绕过时错误返回成功。DEV-4 在身份解析后增加 controller runtime guard。TEST-6 backend unit 复测为 17/17 suites、198/198 tests，通过。
- TEST-5 前端 Jest 在 GRW-003 caller-cancellation 用例触发取消时因未处理 rejection 中断，无法形成 suite 统计。DEV-4 提前订阅 matcher 后，TEST-6 正常跑完并发现该测试取消前未确认 provider 已启动；目前不能据此判断产品层取消边界通过。GRW-003 首次缺陷修复轮记为 `1/2`，DEV-5 需增加 provider-started 同步后保留全部 signal/结果断言。
- TEST-6 前端全量结果为 50/55 suites 通过、429/443 tests 通过，5 suites / 14 tests 失败：MAT-001 1 项、DIA-001 1 项、CRE-005 7 项、MAT-002 4 项；另 GRW-003 1 项。问题与成因已分别记入同名 task/CASE，不更新 CASE passed。
- 已确认 DEV-5 的依赖就绪修复队列，按 S → M 排序：S：MAT-001 冲突测试比较导入前后 catalog/membership 基线；DIA-001 第二次读取 mock 返回完整非占位正文，避免误触发第三次请求。M：MAT-002 诊断素材目标行点击后路由/草稿未推进的实际分支，并基于应用前草稿快照断言；CRE-005 从建单请求动态构造轮询/取消响应的 ID/version/key；GRW-003 等 provider 实际启动后再测试最后 waiter abort 及共享 waiter 隔离。分类只用于返工安排，不改变验收要求和既有 UI/UX。
- DEV-4 已证明 DSC-002 空 ID controller guard 通过；其余本地失败在 DEV-5 修复后须集中重测。未修改生成、素材、详情或分享正式 UI；未连接 iOS/文件出口/provider，未运行 E2E。`E2E_DATABASE_URL` 未配置，数据库 migration/e2e 保持未运行。
- 当前进入 `DEV-5`，不重置 DEV-1/2/3、TEST-1～4 历史。42/42 任务源码盘点历史保留；开发与验收主状态须在本轮复测后按当前证据重算。验收仍为 96/225（42.7%），本轮无 CASE passed。

## TEST-7 / DEV-6 缺陷回流（2026-10-16）

- TEST-7 前端集中复测为 53/55 suites、439/443 tests 通过，2 suites / 4 tests 失败。MAT-001 冲突回归、DIA-001 详情读取回归、CRE-005 generation Store 回归均已通过；这些确定性子集不改变对应全业务 CASE 结果。
- MAT-002 仍有 3 条页面断言失败。新增观测确认目标选择调用 `beginEdit(target.id)`，但未调用 `setDraftBlockPhotos`、未导航；根因是 `applyPhoto(...)` 在 `beginEdit` 更新 Zustand 后继续用旧 `store` snapshot 读取 `drafts[id]`，读不到刚创建/复用的 draft 并提前返回。DEV-6 在 action 后改读 `useAppStore.getState().drafts[id]`，仅修正状态读取时机，不改布局、路由规则或页面反馈。
- GRW-003 剩余 1 条 cancellation assertion 在 provider-started 同步后仍紧接 `abort()` 检查 signal；服务需先让 cancellation promise/finally 释放 waiter，再 abort 最后一个 provider waiter。DEV-6 将先 await cancellation rejection，再断言 signal 已 abort并验证迟到响应不生效；不改服务行为或契约。
- `npm run typecheck` 本轮失败于 `src/store/__tests__/diary-domain.spec.ts` 的 retry `createGenerationJob` Jest mock，返回类型将 `ok: true` 扩宽成 `boolean`（TS2322），属新 fixture annotation 缺失。DEV-6 将显式标注为 `Promise<RemoteResult<GenerationJobContract>>`，不绕过检查。
- DEV-5 修复轮后复测确认：MAT-001 `1/2`、DIA-001 `1/2`、CRE-005 `1/2` 已通过本地复测；MAT-002 `1/2`、GRW-003 `2/2` 仍失败，DEV-6 是这两项当前缺陷线最后允许的修复/集中复测轮。失败继续保留，不计 CASE passed。
- DEV-6 复杂度/依赖队列：M：MAT-002 基于真实 Zustand 更新后的状态继续照片应用；M：GRW-003 仅调整并发取消回归的 promise 收口顺序；S：CRE-005 修正 Jest mock literal typing。顺序与原因已按依赖和复杂度记录；不越过真实媒体、AI、数据库或 Q/UI 决策前置。
- TEST-7 `git diff --check` 通过；backend 源码未变，TEST-6 backend 17 suites / 198 tests 的通过证据仍适用，本轮未重复执行。数据库 e2e 因 `E2E_DATABASE_URL` 缺失未运行；验收仍 96/225（42.7%），无新增 CASE passed。

## TEST-8 / DEV-7 BAS-004 runner 依赖回归

- TEST-8 在 DEV-6 前端全量 Jest（55 suites / 443 tests）与 typecheck/diff check 通过后，执行 `node tools/run-domain-tests.js` 和 `DIARY_DOMAIN_TEST_ORDER=reverse node tools/run-domain-tests.js`。两者均在 E01～E15 执行前失败，临时 transpile 目录缺少 `../contracts/core-diary-contract`；不是领域断言失败，也未触碰数据库。
- `src/contracts/core-diary-contract.ts` 的 runtime dependency 是 `src/types/diary-capabilities.ts`，后者已在 runner 文件清单中；DEV-7 的 S 级修复候选是把新增 contract 加入临时转译清单，并对当前版本正常/反向各 15/15 复测。
- BAS-004-A02 / CASE-BAS-004-002 历史正常/反向 15/15 结果保留，但不适用于新增 import 后的当前 worktree。当前 CASE 暂记未通过；该首次集中失败的修复计数为 `0/2`，验收 passed 从 96 调整为 95，`95/225 = 42.2%`。
- TEST-8 后前端业务套件为 55/55、443/443；`npm run typecheck` 与 `git diff --check` 通过。backend 未变化，不重复运行；未配置 `E2E_DATABASE_URL`，没有 e2e/database 操作。DEV-7 只修复本地 test runner 资源装载，不改业务或正式 UI。

## TEST-9 / DEV-8 BAS-004 依赖清单继续收口

- DEV-7 将 `core-diary-contract.ts` 加入 runner 临时编译清单后，TEST-9 normal/reverse 再次失败，错误前进至 `../contracts/ai-image-generation-contract`。E01～E15 仍均未执行；新导入到 Store 的 runtime dependencies 不只一个 contract。
- 已复核 `create-app-store.ts` 的静态 runtime imports。DEV-8 将一次补齐 core/AI-image/insight-report contract 与纯 TS providers，并对原生 MediaLibrary importer及 backend HTTP adapters 使用隔离 stub；不引入外部 provider、网络或数据库。
- BAS-004-A02 / CASE-BAS-004-002 仍未通过；历史 15/15 不适用于当前 worktree。BAS-004 缺陷修复轮计 `1/2`，DEV-8 为第二轮集中修复/复测机会。若仍不能正常与反向均 15/15，按上限暂跳并保留未解原因。
- 当前验收仍 `95/225 = 42.2%`；前端业务 Jest 55/55、typecheck 和 diff-check 通过，backend 在 TEST-6 后未修改。未配置 `E2E_DATABASE_URL`，TEST-9 只调用本地 in-memory runner，无数据库/真实外部调用。

## TEST-10 / DEV-8 修复复测

- `tools/run-domain-tests.js` 现临时转译 core/AI image/insight contracts 与 Store 使用的本地 providers；原生 MediaLibrary importer、五个 backend HTTP adapters 由临时目录 no-op stubs 隔离，未接触 Expo native、网络或数据库。
- 当前 worktree `node tools/run-domain-tests.js` 与 `DIARY_DOMAIN_TEST_ORDER=reverse node tools/run-domain-tests.js` 分别完整执行 E01～E15，均为 15/15；正常/反向顺序用同一回归资产，未删除或放宽断言。CASE-BAS-004-002 恢复通过，修复轮 `2/2` 成功闭环，TEST-8/9 模块加载失败历史保留。
- CASE-BAS-004-002 当前 worktree normal/reverse 各 15/15，修复轮 `2/2` 已闭环；CASE-BAS-004-001 的 Jest setup guard 仍缺隔离 MySQL 成功启动证据，因 `E2E_DATABASE_URL` 未配置保持 partial。当前 passed 按 coverage 225 重算为 95/225（42.2%）。本轮未执行 e2e/migration/设备/provider CASE，未操作数据库。

## DEV-9 依赖复核与下一候选

- 42 项源码盘点历史保持完整；按当前主状态复核仍为：整项实现完成 0、mock 业务完成 0、已有实现待复验 22、延期/决策阻塞 7、实施中 13、未盘点 0、达到返工上限暂跳 0。验收通过数独立为 95/225（42.2%），不折算开发工作量。
- S：当前无未处理的独立 S 级业务缺口。TEST-10 BAS-004 runner 依赖修复已完成，MAT-001/DIA-001/CRE-005 的本地缺陷回归在 TEST-7 已通过。
- M：MAT-001 导入 sheet 接线、PET-001/MAT-004 持久聊天 UI 接线、DSC 页面读取/互动和 GRW 页面读模型接线都需要改变正式入口的实际请求/等待/错误呈现或选择默认数据，受当前 UI/UX 冻结及 Q-009/Q-007/Q-005/Q-016 等规则阻塞；不在 DEV-9 擅接。BAS-004-A01 当前 Jest setup guard 成功启动需要 disposable MySQL `E2E_DATABASE_URL`，该环境缺失。
- L：CRE-005/DIA-002/MAT-005/PET-001/GRW-003/006 的真实 provider 与质量评测、SHR-005/PCD-002 渠道文件交付、PCD-001 renderer（用户暂停）、BAS-003 迁移/legacy restore 与 INT-001 全栈 e2e 分别受供应商/凭据、Q-001/Q-002/Q-011/Q-014/Q-016、用户授权或隔离数据库前置阻塞。已写 mock/服务 boundary 不计真实接入完成。
- 因当前无可在不猜业务规则、不更改 UI/UX 且不触碰不安全资源条件下推进的独立业务代码，下一轮仅在取得产品 Q、UI/UX 边界授权、真实 provider/平台能力或隔离 DB 后恢复对应分支；新第三方接入仍需先登记供应商与恢复动作。PCD-001 原暂停决定保留。

## TEST-11 集中回归（2026-10-16）

- TEST-11 前端 `npm test -- --silent`：55/55 suites、443/443 tests 通过；后端 `npm --prefix backend run test -- --silent`：17/17 suites、198/198 tests 通过。
- `npm run typecheck`、`npm --prefix backend run build` 与 `git diff --check` 均通过。TEST-10 后 runner 源码未变，未重复运行；TEST-10 normal/reverse 各 15/15 的当前证据继续有效。
- 本轮无单测失败，不产生新的缺陷修复轮。以上是当前本地回归与静态检查，不自动将整项 task/CASE 标记通过；没有增加 CASE passed。
- `E2E_DATABASE_URL` 未配置，未运行 direct Jest e2e setup guard、隔离 MySQL e2e 或 migration；未访问开发数据库、真实 iOS 相册/文件、AI provider 或平台渠道。
- 验收矩阵仍为 95/225（42.2%）。继续 DEV-10 前置是可用的隔离数据库、所需设备/真实 provider/平台能力，或用户对相关 Q 与正式可见行为边界的确认；PCD-001 renderer 继续暂停。

## TEST-12 / DEV-11 / TEST-13 · 数据库集成与缺陷修复（2026-10-16）

- TEST-12 在全新 schema `ai_diary_test_dev10` 部署 migration 时，MySQL 拒绝 discovery 索引 `DiscoveryStory_publicationStatus_publishedAt_withdrawnAt_date_id_idx`（长度超过 64）。DEV-11 将 `DiscoveryStory` index 映射为 `DiscoveryStory_visible_latest_idx`，字段与顺序不变。
- 在新 schema `ai_diary_test_dev11` 继续扫描后，`AnchorCorrection` 唯一索引 `AnchorCorrection_ownerDeviceId_diaryId_anchorId_sourceDiaryVersion_key` 同样超过 64。DEV-11 为唯一约束显式映射 `AnchorCorrection_owner_diary_anchor_version_key`；扫描全部 migration identifiers 确认没有其他超长标识。
- 完整 direct Jest e2e 的首轮还发现 `null` JSON body 被 Express strict parser 在 controller 前拒绝，缺少 `invalid_input`/identity-first 响应；且生成任务取消后 provider 请求仍运行，e2e suite 全部断言完成后 Node 进程因已关闭的 Prisma client 访问而非零退出。
- DEV-11 新增共享 `configureApiBodyParser(...)`，production 与 e2e bootstrap 均在关闭默认 body parser 后，以 strict-false JSON parser 将合法 primitive body 送入 controller runtime guard；设备身份仍优先。生成任务由 Store 持有 controller/promise，取消时向 provider fetch 传递 AbortSignal；`reset()` 与 module destroy 会 abort 并等待后台任务，防止重复恢复和断连后查询。取消 e2e 使用本地 fetch stub，未调用真实 provider。
- TEST-13 在隔离 schema `ai_diary_test_dev11b` 应用 6/6 migration；`prisma migrate status` up-to-date，`migrate diff` 无 drift。当前 `jest-e2e.json` direct invocation 的 setup guard 成功，完整 backend e2e 46/46；backend unit 17 suites / 199 tests、typecheck、backend build、`git diff --check` 均通过。
- 修复计数：DSC-001、GRW-004 migration 缺陷及 CRE-003/BAS-002 malformed-body、CRE-005 provider cancellation/生命周期均记 TEST-12 首轮修复 `1/2`，TEST-13 复测通过。CASE-BAS-004-001 当前通过；仅此 CASE 新增一个明确 passed，其他 task CASE 不因 migration 部署或 e2e 总数而自动扩项。
- 测试期间建立的 `ai_diary_test_dev10`、`ai_diary_test_dev11`、`ai_diary_test_dev11b` 均为本轮专用 schema；完成验证后逐一核对并删除。未将 URL 指向 `ai_diary` 开发库。
- coverage 有效分母 225、矩阵 passed 96（42.7%）。42 项当前主状态为 1 完成、0 mock业务完成、21 已有实现待复验、7 延期/决策阻塞、13 实施中。下一轮仍按 task 依赖及 S/M/L 重排，PCD-001 暂停和未决 Q/外部条件不变。

## DEV-12 / TEST-14 · 第一方 MySQL service integration

- 复杂度/依赖队列：S 当前无独立缺口；M 选择已依赖 BAS-001～004 且 schema 可部署的 DSC-001～003、PET-001、GRW-003/004 HTTP+MySQL service 子集，直接复用同一隔离 e2e harness，不接正式页面；L 真实 provider/质量、iOS 媒体、平台文件出口、Q-001/002/007/016 决策继续延期。
- `MemoryStoreService.reset()` 现按外键顺序清理 discovery like/story、chat message/turn/conversation、anchor/ extraction 与 correction command/record，避免新增业务表污染 e2e 用例。`backend/test/app.e2e-spec.ts` 新增三条 MySQL HTTP flow：explicit published discovery filtering/order/target-state like，chat fail→retry→mock reply/device isolation，provider-fixture anchor begin/complete/replay/tag query/correction read-write/device isolation；均使用合成隔离数据。
- TEST-14 的初次锚点 read-model MySQL 调用确认一条 provider anchor 已写入，却因 correlated `EXISTS(JSON_TABLE(...))` count query 返回 `total=0`。修复为关联 JSON_TABLE 来源段落、显式 `utf8mb4_unicode_ci` 比较，并对 anchor row `COUNT(DISTINCT ...)` / `SELECT DISTINCT`，防重复 source block 扩大结果。首次缺陷与实际输入、预期/实际、根因已同步至 GRW-003 CASE；后续复测同一 MySQL flow 通过。此前 GRW-003 cancellation 修复轮 `2/2` 历史保留不重置；此处是首次 DB read-model integration 的实现验证。
- TEST-14 最终完整隔离 MySQL e2e 49/49、backend unit 17 suites / 199 tests、root typecheck、backend build、migrate status up-to-date、schema diff 无 drift、git diff check 全通过。与 TEST-13 相同，本轮未访问开发库/生产库、未调用真实 AI/provider、未接入设备媒体库或真实渠道。
- CASE-DSC-001/002/003、PET-001、GRW-003/004 根据真实 HTTP+MySQL 证据更新为部分执行；无整项 CASE 新增 passed，coverage 仍 96/225。Synthetic published rows 与 `source: provider` test-only anchor fixture 不代表正式发布流程或真实 AI 质量，正式 UI/UX 继续未接。
- TEST schema `ai_diary_test_dev12` 在本轮创建，迁移/e2e 结束后删除；下一阶段仍需推进全范围 task 依赖队列，并在新增真实证据前不扩大通过结论。
