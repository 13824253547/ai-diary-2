# 自动推进阻塞台账

## 新策略下的使用方式（2026-10-15）

当前按 [开发策略](../development-strategy.md) 和 [能力分类](../external-dependencies.md) 进行 DEV/TEST 轮转。TEST-14 backend unit 17 suites / 199 tests、隔离 MySQL e2e 49/49、typecheck、backend build、migration status、schema diff 与 diff check 均通过；BAS-004-A01 direct Jest setup guard 已通过，BAS-004 blocker 已关闭。TEST-14 为 discovery/chat/anchor 增加的数据库集成只补 partial CASE evidence，不解除页面、provider、留存和产品决策 blockers。测试临时 schema 已清理，未使用开发库。

DEV-1 已完成 42 项源码盘点；DEV-2/3 包含 MAT-005 缺陷修复、DSC-001～003 第一方 API/client repository、GRW-003 持久 read model/API、GRW-004 anchor correction service、PET-001 持久聊天 API/client repository，并将 chat/image/report 默认 mock 限定为 hybrid-dev 开发运行时。TEST-1 前端初测 338/340，MAT-005 两项 S2 缺陷已修复；TEST-2 前端全量 340/340、typecheck/diff check 通过。社区 backend unit 经 service fixture 和 category guard 两项修正后为 8 suites / 77 tests 全通过。GRW-003/004、PET-001 本轮 Prisma Client 生成、typecheck、backend build、diff check 通过；社区 client 与 anchor/chat 新 Jest 均未运行。社区、锚点读模型/纠正及 PET chat migration 未应用。无 `E2E_DATABASE_URL`，隔离 MySQL e2e 未运行。未改正式 UI/UX、未调用外部 provider 或操作数据库。当前开发状态与待测范围见 [开发台账](development-progress.md)。

DEV-1 对 SHR-001～005 的源码复核确认：本地隐私保存/投影、已知区域匿名像素资产、海报/全文预览与 PNG/PDF 服务层编排均有实现；正式页面仍是明确演示路径，平台 adapter 未配置时为 unsupported。Q-007/Q-013/Q-014 与正式 UI/UX 冻结仅阻塞其对应分支，不据既有测试将平台交付/公开读取写为已完成；本轮未执行 SHR CASE。

## 记录格式

| 任务 | 验收 / CASE | 类型 | 阻塞内容 | 当前已完成 | 恢复建议 |
| --- | --- | --- | --- | --- | --- |

## 当前阻塞

本轮已补齐新建整篇换图链路的隔离与重新生成证据，并修掉了 `replace` 模式会把上一轮不可见旧照片混入本次确认集合的问题；当前新增未闭环点仍主要集中在 `CRE-005`、`DIA-005`、`DIA-006` 及基础层待决策规则。

2026-10-15 DEV-1 源码复核发现 `DIA-006` 启动 hydration 与筛选请求都只读取首个 100 条结果，后续页面没有续取；已补全页聚合、页容量白名单及稳定排序，并新增未运行的 contract/repository/controller 回归。该缺口的代码已完成待测试，Q-004 跨日/月和近期分组规则仍独立待决。

2026-10-16 DEV-3 发现 `DIA-005` 保存请求进行中继续编辑会被迟到成功回调覆盖。已增加持久草稿修订号、修订级保存幂等键及成功旧快照后的本地 rebase；新增 deferred 回归与跨 Store 修订恢复断言尚未运行，列入集中 TEST，不影响旧 CASE 历史证据或通过数。

2026-10-16 DEV-3 复核 `DIA-006` 时发现非法年月/日期会被当作普通空结果。按 core contract 已补 Gregorian 日期格式/范围校验：客户端请求前返回 `invalid_input`，后端在读取数据前拒绝；新增 contract/repository/controller 回归未运行，Q-004 时区与跨月归属规则未推断。

2026-10-16 DEV-3 复核匿名资产时发现默认 readability check 对非本地 URI fail-open；已收紧为只接受本地文件、实际读取字节并校验 PNG signature/IHDR/尺寸，网络/data/媒体库和损坏文件拒绝。新增 SHR-003 service regression 未运行；typecheck/diff check 通过。Q-013 未标记人物语义与正式分享页接线仍是独立未闭环项。

2026-10-16 DEV-3 为 GRW-006 补充 `insight-report-v1` provider contract 和 Store validator；新的 contract/Store regression 未运行，typecheck/diff check 通过，故不计通过。真实 provider、报告质量、授权时机、来源统计和留存仍分别受 Q-002/Q-006/Q-005/Q-001/Q-016 限制。

| 任务 | 验收 / CASE | 类型 | 阻塞内容 | 当前已完成 | 恢复建议 |
| --- | --- | --- | --- | --- | --- |
| BAS-001 | T-BAS-001-A04 / CASE-BAS-001-004 | 待决策 | 已为 `CRE-005` 建立固定夹具、自动结构校验和人工评分模板；MAT-005 配图边界现有版本化 v1 contract，但正式质量评测维度、真实 provider 执行门槛与统一通过标准仍未完全确认（Q-002）。新增配图契约回归尚未运行；本轮 typecheck/diff check 通过 | 已建立 `core-diary-v1`、`ai-image-generation-v1` 基础业务契约，并补充 `ai-quality-evaluation-v1.md`、`cre-005-quality-baseline.md` 与可执行 runner；Store 登记配图前现核对版本/请求/来源/描述与可读性 | 后续扩展成长/统计/导出契约与 AI 评测表；取得 Q-002 确认和真实 provider 后补正式质量评测，集中 TEST 执行新配图契约回归 |
| BAS-002 | T-BAS-002-A02/A03/A05 | 进行中 | A04 已按当前契约与测试证据收口；A02 的客户端 canary bundle scan 已通过，但真实 provider 凭据、真实请求/响应/日志和双环境实证未具备；A03 仍缺公开内容读取、完整对象权限矩阵和 Q-007/Q-012 正式边界；A05 仍缺真实服务环境执行证据 | 后端 e2e 已验证设备归属、跨设备拒绝、保存同键幂等、版本冲突及取消；缺失/空白 `x-device-id` 与非法公开选段均 fail-closed。客户端统一 `ApiClient` 的可配置超时/主动取消、建单未知响应同键恢复及保存 timeout 追认已由前端/仓库回归覆盖；正文快照随作品事务持久化。Expo iOS export 的一次性 canary 未进入 bundle；`backend/.env` 缺席，未调用 provider | 操作方配置真实测试 provider 凭据与隔离服务环境后执行真实调用及请求/响应/日志检查；Q-007/Q-012 收口后实现并验收公开读取和身份边界 |
| BAS-003 | T-BAS-003-A01/A02/A03/A04/A05/A06 | 进行中 | 草稿、日记、保存命令和生成任务已接入 Prisma/MySQL，已保存作品现持久化正文内容快照，未提交草稿也已实现同设备本地恢复、坏记录隔离及恢复故障保护；A04 已通过事务内写失败回滚及同键重试 e2e；A05 有真实 migration path、未知本地快照版本保护，并已将本地 `ai_diary` 在无 drift 核验后 baseline。DEV-3 已将默认 mock diaries/photos 限定到开发/Jest runtime，release 默认数据为空且无样例 `currentDiaryId`，无种子日记仍可建立空白草稿；新增 runtime regression 未运行。A03 仍未整体通过：个人统计 `SAMPLE_BASELINE`、宠物锚点固定数和资料/VIP 原型分别受 Q-005/Q-016/Q-012 限制。快照 save/clear 顺序队列、持久 `editRevision`、坏正文隔离、公开范围恢复等新增 regression 也尚未测试。按 Q-001/Q-015 定义的完整重启范围、素材/衍生资产生命周期、legacy 正文回填与更广泛数据库损坏恢复仍未完成 | `draft -> save -> memories` e2e 已走真实数据库；新建/编辑正文快照已在详情与回忆列表读回，并在同一保存事务中更新；缺快照和越界照片引用被拒绝。事务故障 e2e 在 `Diary.create` 后使 `SaveCommand.create` 失败，验证数据库回滚、草稿保留及相同幂等键成功重试。migration verifier 在隔离 MySQL schema 验证空库部署、旧 schema 升级和现有 schema baseline；漂移和无确认请求被拒绝，baseline 后 2 条日记记录不变、2 条 migration 状态 up-to-date。store regression 验证遇到不支持版本会保留完整快照并跳过后续写入。全量 Jest 35 suites / 289 项、domain 3 suites / 95 项、完整 backend e2e 39 项、backend unit 50 项、typecheck/build 通过（均为既有证据，本次新增回归未运行） | 等待集中 TEST 验证 release runtime fixture gate、数据恢复和损坏隔离；Q-005/Q-016/Q-012 收口后再完成正式统计/锚点/资料语义，Q-001/Q-015 收口后推进完整重启恢复与资产生命周期 CASE |
| CRE-005 | T-CRE-005-A01/A06 | 进行中 | 既有生成任务、结构校验、故障分类/重试、取消和迟到回调均有 deterministic 证据；DEV-1 新增生产 provider 门禁，生产缺配置或指定 deterministic 时 fail closed，新增单测尚未运行 | 本轮 `npm run typecheck`、backend build、`git diff --check` 通过；既有 provider unit、backend e2e 和页面回归是历史证据，不覆盖本轮新门禁。真实 provider 与密钥托管尚未联调；Q-002 的重试矩阵与质量阈值待确认 | 集中 TEST 轮执行新门禁单测及既有相关 CASE；取得真实凭据及 Q-002 决策后执行 CASE-CRE-005-010；不以 deterministic provider 结果替代真实质量验收 |
| CRE-001 | T-CRE-001-A01/A03 / CASE-CRE-001-006 | 进行中 | 权限说明页和系统请求已完成，`CRE-002` 也已接入真实相册目录，并在相册页进入前增加了原生权限重同步；但“未授权时真实资源读取次数为 0”的实证、`Q-018` 的有限访问/拒绝/撤回矩阵与实机证据仍未收口，因此系统权限闭环仍未完全完成 | `src/services/photo-permission.ts`、`src/store/create-app-store.ts`、`app/permission/photos.tsx`、`app/_layout.tsx` 与 `src/services/photo-library.ts` / `app/album/select.tsx` 已打通真实授权到真实相册读取；`app/__tests__/photo-permission-screen.spec.tsx` 与 `app/__tests__/album-select-screen.spec.tsx` 已覆盖说明页先展示、草稿绑定、授权不改私密状态、重复授权请求锁、基础读图链路和 denied 回落权限引导 | 待 Q-018 收口后补有限访问/拒绝/撤回矩阵，并在 iOS 设备/模拟器上补系统授权和资源可读性证据 |
| CRE-002 | T-CRE-002-A05 / CASE-CRE-002-006/007/008 | 进行中 | 当前已接入真实相册目录、页面内暂存选择、新建/替换确认写回、取消去留、确认前可读性复核、进入读取前的原生权限重同步，以及旧请求/旧草稿不回写和分页去重；新建链路的整篇换图也已修掉“不可见旧照片混入本轮确认集合”的问题。剩余主要是 iOS 实机/模拟器上的真实资源删除、撤权与有限访问矩阵，以及 Q-003/Q-018/Q-008 对应的上限/有限访问/换图下限规则未收口。当前已在模拟器上进一步收窄阻塞：即使 TCC 库显示 `kTCCServicePhotos|io.com.shihangbiji.www.aidiary|2|4`，Metro 仍会输出 `E_NO_PERMISSIONS`，说明阻塞点在模拟器原生权限环境而不是页面选择逻辑 | `src/services/photo-library.ts`、`app/album/select.tsx`、`src/components/diary/photo.tsx`、`src/store/create-app-store.ts` 与 `app/__tests__/album-select-screen.spec.tsx` 已验证 0/1/2 张门禁、新建/替换确认、新建取消继续/放弃、替换取消、第三张失效后阻断确认、旧请求不覆盖新相册、旧草稿迟到结果不污染新草稿、分页去重、分页失败反馈保留当前勾选、denied 时直接回落权限引导，以及未保存新建草稿在 `replace` 模式下不会再混入上一轮旧照片 | 继续在 iOS 设备/模拟器上执行真实资源删除/撤权验证；模拟器卡住或黑屏时先刷新并重跑被打断 CASE。若模拟器持续返回 `E_NO_PERMISSIONS`，可切换真实设备继续补齐 `CASE-CRE-002-007`，同时等待 Q-003 / Q-018 / Q-008 收口后补完整矩阵 |
| CRE-004 | CASE-CRE-004-006 | 待决策 | 浏览模式在授权、选图、模板之后是否需要再次回到角色页确认，仍受 Q-009 约束；当前只能确认“角色不会丢失”，不能把页面顺序硬编码成正式规则 | `src/store/__tests__/diary-domain.spec.ts` 已验证 browse 流程中的 `draftId` 与 `characterId` 会持续保留，不会在授权或模板步骤中丢失角色选择 | 待 Q-009 收口后补页面顺序断言与对应 CASE 执行 |
| CRE-006 | T-CRE-006-A02 / CASE-CRE-006-003 | 待决策 | 各候选可分别命名已落地，多同行者输入框也已收口为唯一可访问标签并验证互不串值；但正式长度上限、字符计量、Emoji/组合字符与空白裁剪规则仍受 Q-003 限制；当前 `maxLength=16` 仅是原型边界，不能作为正式验收口径 | 已完成命名输入、别名保留、正文不改写、保存失败保留输入、空称呼回落、跳过保留候选，以及多同行者独立输入的代码与测试证据 | 待 Q-003 收口后补 UI/领域/请求层的正式边界断言 |
| CRE-006 | CASE-CRE-006-007 / CASE-CRE-006-008 | 进行中 | 当前已去除“无候选伪造人物”的错误兜底，并把命名保存留在当前草稿内；但真实 AI 候选识别结果、跨重启留存恢复，以及跨作品人物记忆/纠正范围仍未完成，分别受 `CRE-005` / `BAS-003` 进度和 Q-010 限制 | `backend/src/common/diary-generation.service.ts`、`src/store/diary-domain.ts`、`src/store/create-app-store.ts` 与命名页/领域测试已完成确定性闭环，确保当前不会再从旧草稿或 mock personIds 虚构候选 | 待真实 provider 与留存链路闭环后执行 CASE-CRE-006-007，并在 Q-010 收口后补长期人物记忆范围 CASE |
| DIA-001 | T-DIA-001-A04/A05 / CASE-DIA-001-004/005/008 | 待决策 | 当前详情页“更多操作”已携带真实 `diaryId` 进入 `/share/privacy`，锚点入口也已带着当前日记上下文进入 `/profile/anchors`；但正式详情菜单路径仍受 `NAV-001 / Q-009` 限制，锚点业务断言也仍依赖 `GRW-003/004`，因此对应往返与联调 CASE 还不能诚实收口 | `src/repositories/http-core-diary-repository.ts`、`src/store/create-app-store.ts`、`app/diary/[id]/index.tsx` 与 `app/__tests__/saved-diary-screens.spec.tsx` 已完成真实单篇读取、摘要占位补全、读取失败重试和旧回包保护，详情页不再回退样例作品 | 待 `NAV-001 / Q-009`、`GRW-003/004` 收口后补正式菜单往返、锚点联调和对应 CASE |
| DIA-001 | CASE-DIA-001-006 | 进行中 | 详情页的真实读取、失败重试、三种开放角色的布局分支，以及历史 `emotion` 作品可读已有自动化证据，坏图时的可见占位也已补到组件层；当前只剩真实设备上的坏 URI 注入还未单独执行，因此 A06 仍有半段证据待补 | `app/diary/[id]/index.tsx` 已区分 loading / not_found / error，`app/__tests__/saved-diary-screens.spec.tsx` 已验证回忆摘要占位自动远端补全、读取失败可重试和切换作品时旧回包不覆盖当前详情；`src/components/diary/diary-paper.tsx` / `src/components/diary/__tests__/diary-paper.spec.tsx` 已补三种开放角色的布局分支与同内容证据；`src/components/diary/photo.tsx` / `src/components/diary/__tests__/photo.spec.tsx` 已补“图片暂时不可用”占位和正文继续可读的组件证据 | 后续补真实设备坏图注入，确认 `DiaryPaper` 在真实资源失效场景下的完整可见反馈 |
| DIA-005 | CASE-DIA-005-010 | 待决策 | 主体验收 A01~A07 已全部形成代码与测试证据，当前仅剩 Q-001 对应的完整跨重启恢复口径、Q-008 对应的既有换图保存下限未定，导致 CASE-DIA-005-010 不能诚实执行 | 保存结果查询、同幂等键追认、冲突保留草稿、等待确认后跳转、重试保存入口、来源不存在回退回忆、退出后继续编辑不导航且不提交、放弃清理、放弃后列表快照不变、成功后阻断快速重复提交、列表唯一新增/数量稳定、三张图片下限、防误开正式详情、真实回忆列表入口串联、延迟重写结果丢弃保护、提交后草稿禁改，以及未提交草稿的同设备本地恢复和坏快照隔离均已落地；本轮又补齐了生成运行中、少于三张图片、来源缺失三类保存前置失败的领域断言 | 待 Q-001 / Q-008 收口后补执行完整重启恢复与既有换图场景 |
| DIA-002 | CASE-DIA-002-008 / CASE-DIA-002-009 | 待决策 | 当前已打通真实 rewrite contract/repository/backend provider 边界，且页面级失败反馈矩阵也已补齐；剩余阻塞集中在正式质量阈值、候选采用方式、文本边界与生成期间手动编辑覆盖策略，分别受 Q-002、Q-003、Q-008 限制，不能把 deterministic 改写文案当成最终业务完成 | `backend/src/common/diary-generation.service.ts` / `src/store/create-app-store.ts` / `app/diary/[id]/edit.tsx` 已把原先的前端固定文案替换成真实服务边界，并通过 contract、repository、domain、backend unit tests 和页面测试验证作用域、失败语义、超时分类、畸形输出保留原文，以及超时 / provider 失败 / 畸形结果的中文可见提示 | 待 Q-002 / Q-003 / Q-008 收口后，补真实 AI 质量评测与文本边界矩阵，再执行 CASE-DIA-002-008/009 |
| DIA-003 | CASE-DIA-003-009 | 待决策 | `DIA-003` 的工程缺口已补齐：整篇换图与段落引用换图的关系不变量、可读性校验、失败原子性、取消不提交和保存后重读都已有真实代码与页面/领域证据。当前只剩 Q-003 / Q-008 / Q-001 对应的上限、既有换图下限/重生成和留存规则尚未确定，因此 `CASE-DIA-003-009` 不能诚实执行 | `src/store/create-app-store.ts` / `src/store/diary-domain.ts` / `src/store/__tests__/diary-domain.spec.ts` / `app/__tests__/album-select-screen.spec.tsx` / `app/__tests__/edit-screen.spec.tsx` 已验证整篇换图、段落引用、资源失效拦截、确认失败不提交、关闭面板不提交，以及保存后重读一致性 | 待 Q-003 / Q-008 / Q-001 收口后，补执行下限、顺序与重生成边界矩阵 |
| DIA-004 | CASE-DIA-004-006 | 待决策 | `DIA-004` 的开放目录、内容保留、取消返回保护、无效角色阻断与保存沿用原作品 ID 均已有当前仓库代码与测试证据；当前唯一剩余阻塞是 Q-008 尚未确认“换角色是否需要重生成”规则，因此 `CASE-DIA-004-006` 不能诚实执行 | `app/create/character.tsx` / `app/__tests__/character-screen.spec.tsx` / `app/__tests__/character-screen-replace.spec.tsx` / `app/__tests__/character-screen-replace-back.spec.tsx` / `src/store/create-app-store.ts` / `src/store/__tests__/diary-domain.spec.ts` / `src/components/diary/__tests__/diary-paper.spec.tsx` 已验证开放角色目录、目录失败恢复、未知角色不会覆盖当前角色、更换后正文/图片引用保持不变、replace 选择后返回原编辑页、replace 直接返回不改原草稿，以及保存后仍按同一 `diary-1` 落盘并切到新布局 | 待 Q-008 收口后，再执行是否需重生成的待决策 CASE |
| DIA-007 | CASE-DIA-007-006 / CASE-DIA-007-007 / CASE-DIA-007-008 | 待决策 | `DIA-007` 已补齐真实月份分组、成员隔离、同名成员按正确 `diaryId` 打开详情，以及无日记空态不伪造分册的证据；本轮也已补上月度导出失败/取消收口、跨月份覆盖提示、月份与成员版本快照固定，以及旧月份迟到结果的 `superseded` 忽略，因此 `CASE-DIA-007-004/005` 不再阻塞。当前剩余未闭环点只在真实交付文件格式/内容/隐私、跨月归档与文件留存，分别受 Q-011 / Q-004 / Q-001 待决策约束 | `app/(tabs)/profile.tsx` / `app/profile/monthly.tsx` / `src/services/monthly-export.ts` / `src/store/create-app-store.ts` / `src/store/__tests__/monthly-export.spec.ts` / `app/__tests__/monthly-screen.spec.tsx` / `app/__tests__/profile-screen.spec.tsx` 已验证个人页真实月份入口、月度装订成员隔离、失败/取消提示、取消后迟到结果不复活，以及 1 月导出切到 2 月后仅保留当前月份快照 | 待 Q-011 / Q-004 / Q-001 收口后，再执行真实交付文件、跨月归档和留存权限矩阵 |
| NAV-001 | T-NAV-001-A03 / CASE-NAV-001-003、T-NAV-001-A04 / CASE-NAV-001-004、T-NAV-001-A06 / CASE-NAV-001-006 | 进行中 | `NAV-001` 本轮已补齐 `more-actions`、`replace-photos`、`leaveDraft` 和底部导航离开确认的真实回归，但详情页常规“继续编辑 / 公开范围 / 分享”入口仍未按正式菜单路径接入，继续受 Q-009 限制；冷启动、公开深链、未授权照片路径与 37 页面/别名/布局的全量矩阵也还没有补完。Q-018 仍限制部分权限恢复场景的最终验收 | `app/__tests__/more-actions-screen.spec.tsx`、`app/__tests__/replace-photos-route.spec.tsx`、`src/components/navigation/__tests__/bottom-tabs.spec.ts`、`app/__tests__/photo-permission-screen.spec.tsx`、`app/__tests__/album-select-screen.spec.tsx`、`app/__tests__/edit-screen.spec.tsx`、`app/__tests__/saved-diary-screens.spec.tsx` 已验证入口参数隔离、草稿复用、无效目标不串篇、未保存离开确认和保存后回详情等当前可落地链路 | 待 Q-009 收口详情正式菜单入口，并继续补冷启动/深链/权限恢复与页面映射整表核验；当前先按 partial/passed 口径推进 NAV-001 文档与 CASE |
| SHR-001 | Q-007 / Q-009 / Q-013 / CASE-SHR-001-008 | 待决策 | `T-SHR-001-A01~A05` 已在当前范围内形成真实保存、页面回显、防重、失败保留旧值、跨页竞态隔离，以及失败后重开回最后一次成功保存值的证据，不再阻塞；当前仅剩社区权限、返回路径、公开撤回语义与重启恢复边界等待决策项 | `backend/prisma/schema.prisma`、`backend/src/modules/sharing/sharing.controller.ts`、`src/repositories/http-core-diary-repository.ts`、`src/store/create-app-store.ts`、`src/store/__tests__/diary-domain.spec.ts`、`backend/test/app.e2e-spec.ts`、`app/__tests__/share-privacy-screen-entry.spec.tsx` 与 `app/__tests__/share-privacy-screen-regression.spec.tsx` 已覆盖首次默认私密、四种范围真实保存读回、目标失效空态、失败不返回成功、防重、D1/D2 竞态隔离，以及失败后重开回旧值 | 待 Q-007 / Q-009 / Q-013 / Q-001 收口后，再执行社区权限、正式返回目标、撤回语义与重启恢复相关 CASE-SHR-001-008 |
| DIA-006 | T-DIA-006-A05 | 进行中 | 已完成真实后端检索、筛选保持、真实回忆源隔离、组件级空态/重试入口、一月/二月/全部结果集切换、未保存草稿不进入回忆月份或结果集、选日关闭保留、周条/月历日期标记、近期分组显隐与结果跳详情验证；同标题不同 ID 的详情读取、最近回忆分组入口的唯一标签与正确 `diaryId` 路由、跨分组同标题各自按自身 `diaryId` 跳详情，以及详情返回后筛选状态不丢失、无返回栈时兜底回 `/(tabs)/memories` 也都已补齐，因此 `CASE-DIA-006-005` 已通过；当前剩余阻塞只在 Q-004 未定，导致跨日/月规则与近期分组是否完全服从筛选仍不能诚实收口 | 月份/日期/关键词查询、地点检索、请求版本保护、真空仓库不回退 mock、按原条件重试、一月/二月/全部结果集切换、未保存草稿过滤、选日保留、当前结果集下的近期分组显隐、结果卡片按 ID 跳详情、同标题不同 ID 不串篇、最近回忆分组入口按正确 `diaryId` 打开、跨分组同标题也不串篇，以及详情返回保留筛选等组件与页面证据均已落地 | 待 Q-004 收口后继续补跨日/月规则验证与“近期分组是否完全服从筛选”的剩余联调 |
| SHR-002 | CASE-SHR-002-007 / Q-013 / Q-014 | 待决策 | `T-SHR-002-A01~A05` 已全部具备当前范围内的真实代码和自动化证据，不再阻塞；当前仅剩待决策 CASE-SHR-002-007。Q-013 / Q-014 尚未定义跨段共享照片、关联引用句归属，以及长图/PDF 等真实导出格式对公开内容语义的最终规则，因此这些边界不能诚实判定为通过或失败 | `src/store/diary-domain.ts`、`src/store/create-app-store.ts`、`app/share/result.tsx`、`src/store/__tests__/diary-domain.spec.ts`、`app/__tests__/share-result-screen.spec.tsx` 与 `app/__tests__/share-privacy-screen-regression.spec.tsx` 已覆盖选段过滤、图片/封面/摘要重算、quote-only 不回退原图、重复/未知 ID 归一化、最新投影版本刷新，以及失败后重开回最后一次成功保存值 | 待 Q-013 / Q-014 收口后，把共享图片归属与真实导出格式语义并入正式 CASE-SHR-002-007，再决定是否补新的领域/页面/导出回归 |
| SHR-003 | T-SHR-003-A02 / A05、CASE-SHR-003-002/005/006 | 进行中 | 当前已完成匿名文本替换、匿名 + 选段组合的分享页回归，以及匿名资产准备失败阻断；`Photo` 组件也已能按 `faceRects` 和当前裁切尺寸绘制展示层遮挡，匿名资产 key 已按作品/目标/版本隔离；本轮又补了“渲染器返回不可读匿名文件时直接按失败收口”的服务保护，并把默认匿名产物推进为真实 PNG 像素衍生文件。当前剩余主要是补不扩展正式前端路径前提下的完整真实视觉验收，以及补真实导出链路的最终证据。Q-013 / Q-014 继续限制“漏检人脸、其他身份信息、导出规格与匿名资产交付语义”的最终验收 | `src/store/diary-domain.ts`、`src/components/diary/photo.tsx`、`app/share/result.tsx`、`src/services/share-asset-preparation.ts`、`src/store/__tests__/diary-domain.spec.ts`、`src/components/diary/__tests__/photo.spec.tsx`、`src/services/__tests__/share-asset-preparation.spec.ts` 与 `app/__tests__/share-result-screen.spec.tsx` 已验证匿名文本投影、匿名 + 选段组合、宽/高裁切下的人脸遮挡坐标、真实 PNG 像素匿名资产、失败阻断、不可读匿名文件拦截，以及作品/目标/版本缓存隔离 | 后续先补不扩展正式页面能力前提下的真实视觉 CASE，并执行真实导出链路 CASE；Q-013 / Q-014 收口后再把漏检人脸、元数据和导出规格并入正式矩阵 |
| SHR-004 | T-SHR-004-A04 / CASE-SHR-004-005/007 / Q-014 | 进行中 | 当前分享页已具备统一投影海报、全文预览、无效目标空态、预览关闭回原页与切换目标不残留旧内容的页面证据，因此 `A01~A03` 已可按当前证据推进；剩余主要是 A04 的真实异步读取/渲染失败反馈，以及二维码面板和最终海报规格仍受 Q-014 影响 | `app/share/result.tsx` 与 `app/__tests__/share-result-screen.spec.tsx` 已验证统一投影、无图不回退、私密整篇、无效 `diaryId` 空态、关闭预览不改记录，以及切换目标后旧内容不残留 | 后续补异步读取/渲染失败的服务或页面证据，并在 Q-014 收口后再决定二维码/海报最终规格与真实集成矩阵 |
| SHR-005 | T-SHR-005-A02/A03 / CASE-SHR-005-003/004/008/009 / Q-013 / Q-014 | 进行中 | 当前已在 `src/services/share-delivery-orchestrator.ts` 中补上分享交付编排的基础规则：私密外部分享前置拦截、确认完成后才记平台/导出记录、取消/失败/不支持不误记成功，以及按 `diaryId + version + mode` 隔离的操作去重；`src/services/share-export-file-service.ts` 也已补上真实本地导出，`save` 会生成 PNG 文件、`pdf` 会生成可读取 PDF 文件。剩余阻塞在于正式页面仍停留于 `recordShareDemo(...)` 演示路径，当前 PNG 仍是结构化拼版输出，仓库也尚未接入 `expo-sharing` 或平台 SDK，且 Q-014 尚未收口最终文件规格、系统保存/打开语义与渠道结果契约，因此真实外部渠道、iOS 系统导出矩阵和匿名/选段最终视觉验收都还不能诚实宣称完成 | `src/services/share-export-file-service.ts` / `src/services/__tests__/share-export-file-service.spec.ts` 已验证真实 PNG/PDF 文件生成与可读性；`src/services/share-delivery-orchestrator.ts` / `src/services/__tests__/share-delivery-orchestrator.spec.ts` 已验证私密拦截、取消不误记成功，以及按目标/版本隔离的重复提交规则；`src/store/create-app-store.ts` / `src/store/__tests__/diary-domain.spec.ts` 已验证确认事件只记一次，且旧版本或错目标回调不会污染当前作品；匿名资产准备继续复用 `src/services/share-asset-preparation.ts` | 下一步先把页面里的 `recordShareDemo(...)` 替换为正式交付编排，再决定真实导出/分享适配器契约；Q-014 收口后补文件规格、系统保存/打开矩阵与渠道结果矩阵，Q-013 收口后补隐私变化竞态 |
| MAT-001 | T-MAT-001-A01/A03/A04/A05 / CASE-MAT-001-001/003/004/006/007/008 | 依赖/实施边界 | A02 已通过；A03 的预览 URI 与已保存引用标记有确定性页面证据，但未证明文件实际可读或执行真实保存出口；A05 的统一目录消费已部分接线。DEV-3 新增基于 `expo-media-library` 的导入服务与 Store action，但正式上传 sheet 仍未调用它。页面接线受 UI/UX 冻结；URI 留存受 Q-001/Q-015，许可矩阵受 Q-018，格式/容量/元数据受 Q-003 | 新 action 读取现有权限、以 Image.getSize 顺序探测解码、拒绝不可读/仅云端资源、校验同批 ID/source 并在成功后原子登记；重复系统 ID 不复制成员并刷新当前 URI，mock ID 冲突整批拒绝。`npm run typecheck`、`git diff --check` 通过；新服务/Store Jest 已写未运行；未访问真实 iOS 媒体库 | TEST 轮验证服务/Store contract 与 `Image.getSize` 对真实设备 URI 的行为；真实设备权限、URI 留存与页面入口需在 UI/UX 边界获准后完成。Q-001/Q-015/Q-018/Q-003 未收口前不承诺跨重启 URI、批量上限或全权限行为，不新增 CASE 通过 |
| MAT-002 | T-MAT-002-A05 / CASE-MAT-002-005/007；真实资产边界 | 进行中/部分边界已确认 | A01/A03 与 A04 已有本地注册资产页面回归：素材照片替换首段引用、旧照片保留在整篇集合、重复应用不产生重复 ID，并保留其它未保存草稿内容。DEV-14 更新 CASE-MAT-002-004 为已执行。A02 仍是页面放弃、store repository 请求和 MySQL 保存回读的分层证据；没有真实设备 P4，也未在一次运行中连通素材页、真实 repository 和 backend。A05 已验证目标无文本块或 P4 在预览后不再注册时不会创建编辑草稿/改 D1/D2/导航；真实文件仍注册但不可读、媒体库读取错误及具体反馈/返回路径未验证。Q-015 只局部确认首段替换及草稿其它修改保留；真实导入/留存和其它目标范围仍待确认 | `app/__tests__/library-screen-material-apply.spec.tsx` 与 DIA-003 定向回归合计 3 suites / 135 tests 通过；`npm run typecheck`、`git diff --check` 通过。`src/store/__tests__/diary-domain.spec.ts` 与 isolated MySQL e2e 提供分层保存证据；没有真实媒体导入或文件可读性证据 | 等待 CRE-002/MAT-001 提供真实可读设备素材后补一次客户端到服务端链路；Q-009/Q-015 其它导航、失败反馈和资产范围明确后再执行 CASE-MAT-002-007，不新增 UI |
| MAT-002-A02 | T-MAT-002-A02 / CASE-MAT-002-002 | 真实素材/集成边界 | 分层测试链路均已验证，但 repository 请求断言使用受控 adapter，后端保存使用元数据 ID `photo-4`；仍未证明真实导入 P4 文件可读，也未在一次真实 app/repository/backend 流程提交并读回 | 页面放弃状态、store 保存请求载荷、定向 isolated e2e 均通过；本轮又在全新 disposable schema 执行完整 backend e2e（40/40）。full02 测试库已删除并确认不存在；开发库未作为测试目标，测试后当前 `Diary` 计数为 2 | 待 CRE-002/MAT-001 提供真实可读设备照片后，使用 disposable local schema 补 app/repository/backend 联调并回读 D1/D2；不把 adapter 请求测试、`file://` fixture 或后端纯 ID 引用当作真实文件验收 |
| MAT-003 | T-MAT-003-A02/A04 / CASE-MAT-003-002/004/005 | 依赖/实施边界 | A01/A03 已由页面回归验证；A02 已验证稳定装饰 ID 路由及其在明信片卡片预览中的映射，但依赖 PCD-001 的可读取生成图片资产，而现有 `make()` 不产生图像文件；A04 未知装饰参数的正式回退/提示及从明信片返回素材的规则受 Q-015/Q-009 约束 | `app/__tests__/library-screen-decorations.spec.tsx` 验证八种已开放装饰的预览映射、关闭不改日记/草稿/素材引用，以及 `stampKyoto` 路由参数；`app/__tests__/postcard-screen-assets.spec.tsx` 验证明信片卡片预览解析该装饰。未验证 PCD 图片生成结果，也未选择未知 ID 的正式语义 | 暂停依赖真实图片资产输出和未知参数决策的 CASE；PCD-001 需提供真实可读渲染资产后再验 A02，Q-015/Q-009 收口后补 A04/005 |
| PCD-001 | T-PCD-001-A03/A04/A05 / CASE-PCD-001-003/004/005 | 实现边界/用户选择 | 当前页面 `make()` 只切换 `generated` boolean，不生成可读图片资产；仓库无 native view capture、SVG/image manipulation 或 canvas 渲染依赖。正确接线需新增原生捕获依赖、等待真实资产可读后再显示成功，并对失败提供可辨识反馈；这会改变现有按钮成功时序/失败反馈，受正式 UI/UX 冻结约束 | 已检查 `app/postcard/index.tsx`、PCD-001 task/CASE、依赖清单；`require.resolve` 确认 `jimp-compact` 可用，但 `react-native-view-shot`、`react-native-svg`、`sharp`、`canvas`、`@napi-rs/canvas`、`expo-image-manipulator` 均不存在。分享导出 Jimp 输出是日记拼版/结构化文字骨架，不是明信片原卡片真实渲染。用户已明确要求先跳过；本轮未加依赖、未调整正式按钮反馈，也未实现假 PNG/模板替代 | 按用户指示暂停 PCD-001-A03/04/05；仅在用户重新指定获批渲染方案或交互边界后恢复，当前继续其他独立 CASE |
| MAT-004 | T-MAT-004-A02/A03 / CASE-MAT-004-002～005 | 依赖/真实服务/页面授权 | 页面 A01/A04 已通过；当前提交把所选问题与回答合并为一条本地 user message，Store 有 client requestId，但仍经 `sendChat(...)` 本地 mock，不调用 PET-001 session repository。真实持久回复/失败恢复未接通；接入会改变等待/失败可观察行为，受 UI/UX 冻结。Q-001/Q-002/Q-003 限制留存/质量与重试/输入边界，真实 provider 未配置 | `app/__tests__/library-screen-inspiration.spec.tsx` 的空/空白提交和关闭无副作用证据保持有效；PET-001 持久 API 与 repository 已建，但没有将本地 mock 或未运行 API 测试视为真实 CASE | 不改现有提交/导航反馈；待 UI/UX 对等待/失败恢复有明确授权后，复用 PET-001 request/turn API 接线并用隔离服务验证。真实 provider 与 Q 决策继续延期 |
| PET-001 | T-PET-001-A02/A03/A05/A06 / CASE-PET-001-002/003/005/006/007/008/009 | 外部能力/决策/留存/页面授权 | DEV-3 已新增持久会话/turn/message Prisma/API/client repository；Prisma Client、typecheck、backend build 通过，但 migration 未应用、Jest 未运行，正式页面/Store send/retry 仍未接线。既有页面还没有失败/重试可见状态；直接接线会改变等待/失败体验，当前 UI/UX 授权不足。Q-001 未定 retention/删除/跨设备，Q-002 未定质量/安全/超时/自动重试，Q-003 未定长度/键盘矩阵 | `ChatReplyProvider` 继续把 deterministic mock 放在 provider 边界并标注 `source: mock`；开发服务允许显式 `source: mock`，所有非测试运行环境拒绝调用方自报 `source: provider`，生产还拒绝会话创建/重试/回复写入。服务只持久化固定失败码和请求轮次，不保存原始异常。新增 controller/service/client tests 已写未运行；本轮未调用模型或操作数据库 | TEST 轮用隔离数据库验证设备归属、来源隔离、同请求幂等、乱序/重放、固定失败码与 attempt 恢复；Q-001 确认后再定实际保留/清理及跨设备行为。页面可见失败/重试接线等 UI 授权边界明确后处理；真实 provider/质量 CASE 仍受 Q-002 |
| MAT-005 | T-MAT-005-A01/A02/A04/A05 / CASE-MAT-005-001～008 | AI外部能力/页面接线 | 真实图像模型、可下载资产与留存尚未实现；正式页面仍直接登记 `photo-9` 示例，接入新 action 会改变失败/取消反馈，受 UI/UX 冻结限制；Q-002/Q-003/Q-001/Q-015 约束质量/恢复/输入/资产生命周期 | TEST-1 记录两项 S2 Store 缺陷；DEV-2 修复图片源判断和取消等待后，TEST-2 定向 7/7、前端全量 45 suites / 340 tests、typecheck/diff check 通过。未调用模型、未写文件；mock 子集不计 CASE passed | 等真实 provider/资产条件和 Q 决策；正式页面接线等待可见失败/取消行为授权。真实 CASE 与 MAT-002/PCD-001 链路仍待执行 |
| PCD-002 | T-PCD-002-A01/A02/A03/A05 / CASE-PCD-002-001/003/005/006/007/008 | 依赖/平台与规格 | 当前明信片素材页可以预览，但 PCD-001 尚无真实可读当前卡片资产；PCD-002 现有“微信/朋友圈/保存图片”动作只展示 Alert，没有实际文件或平台交付。正式实现受 Q-013 隐私与 Q-014 输出/权限/渠道契约约束，且改变现有按钮完成反馈前需满足 UI/UX 授权边界 | `app/postcard/index.tsx` 显示当前素材/装饰预览及演示 Alert；本轮已核对 task/CASE，未改页面、未安装依赖、未执行出口测试 | 保留 PCD-001 用户暂停决定；待实际卡片 renderer、Q-013/Q-014 和可见反馈边界明确后再接本地保存/平台 adapter |
| PET-002 | T-PET-002-A01/A02/A03/A04 / CASE-PET-002-001～006 | 决策/真实读模型 | 当前萌宠页日记数叠加固定样例基线、锚点数固定为 12，默认锚点组来自静态 ID；anchor read repository 已建立但只接受显式 `tagId`，统计聚合 repository 尚无。Q-005/Q-016 分别阻塞统计口径和默认集合定义 | `app/(tabs)/pet.tsx`、`src/store/diary-domain.ts`、`app/profile/anchors.tsx`、`src/repositories/anchor-read-model-repository.ts` 已核对；本轮确认入口/静态空态已存在，无独立代码缺口，不猜测默认 tag 或改变正式反馈 | 待 Q-005/Q-016 与共享真实统计/锚点读模型定义后接线、执行 CASE；重启缓存按 Q-001 处理 |
| DSC-001 | T-DSC-001-A01～A07 / CASE-DSC-001-001～010 | 自有服务/决策/页面接线 | DEV-2 已增加独立 published 快照列表 API、搜索/latest/分页；调用必须显式传 `category=latest`，缺省、推荐、同城类别 fail closed，未把最新排序冒充默认推荐。尚无发布 writer、内容 fixture、页面 repository/状态接线。Q-007 决定故事源、推荐/同城、撤回与可见范围 | API 查询硬过滤 publishedAt/status/withdrawnAt；不从 diary privacy 自动创建。Controller/service tests 通过 backend 8 suites / 77 tests；migration 未应用 | Q-007 决策后实现获准发布/撤回入口和分类规则；另补 migration/MySQL/client/page CASE，不把空 read model 当真实发现完成 |
| DSC-002 | T-DSC-002-A01～A04 / CASE-DSC-002-001～007 | 自有服务/决策/页面接线 | DEV-2 已增加按 ID 读取独立 published snapshot API；尚无发布快照生产者、真实 fixture、页面接线、网络重试/身份缓存保护。Q-007/Q-013 决定投影/匿名/撤回，Q-001 决定缓存 | 非 published/无发布时间/withdrawn 统一 not_found，不回查来源日记；backend unit 覆盖 controller/service，8 suites / 77 tests 全通过；migration 未应用 | Q 决策后构建获准发布来源及 client repository；再补隔离 MySQL/API/page CASE，未增加通过项 |
| DSC-003 | T-DSC-003-A01～A05 / CASE-DSC-003-001～007 | 自有服务/决策/页面接线 | DEV-2 已增加 target-state PUT 与设备级唯一 likes 表/API；当前 UI 仍为 Store 布尔值/静态计数，未接服务；Q-007 决定点赞资格/匿名/撤回交互，Q-001 决定留存 | like 关系用 `(storyId, ownerDeviceId)` 复合主键；只有显式 `likesEnabled=true` 才可写，默认 false。DEV-3 修正禁用点赞错误映射为 `interaction_not_available`/409，并使 discovery 路由先解析身份再校验输入；client 不误报 `invalid_input`。历史 controller/service unit 在 backend 8 suites / 77 tests 中通过，新增 controller/client Jest 未运行；本轮 typecheck/backend build/diff check 通过。migration 未应用、数据库未触碰 | 集中 TEST 验证结构化错误与身份优先级；Q-007 确认后启用获准资格和撤回语义，完成 repository/UI 接线并用隔离 MySQL 验证幂等/多设备；当前不宣称真实点赞完成 |
| GRW-001 | T-GRW-001-A01/A04/A05 / CASE-GRW-001-001/004/005/006/007 | 决策/真实读模型 | 个人资料来源未接服务，日记统计仍使用 `SAMPLE_BASELINE`；正式增量/去重受 Q-005，账号/VIP范围受 Q-012，缓存与身份切换受 Q-001 | `app/(tabs)/profile.tsx`、`src/store/diary-domain.ts`、`growth-entry-card.tsx` 已核查；本轮不改固定统计或资料展示 | Q-005/Q-012 定义后建立共享资料/统计读模型，补空态/失败/身份恢复 CASE |
| GRW-002 | T-GRW-002-A01/A03/A05 / CASE-GRW-002-001/003/005/006/007 | 决策/成长读模型 | 主题标签及进度仍来自静态图与文案，无真实标签/成长读模型；Q-016/Q-006/Q-005 限制生产主题、成长提示与统计 | DEV-1 将当前树主题点击改为传已有 metadata `tagId`，锚点页兼容旧 `tag`；typecheck 通过，新增组件测试未运行，其他既有 CASE 未复验 | 先沿用稳定 ID 契约接读模型；决策前不把四个展示标签或“差3片叶子”推广为真实用户规则 |
| GRW-003 | T-GRW-003-A01/A04/A05/A06/A07 / CASE-GRW-003-001/004/005/006/007/008 | 决策/AI提取/留存/页面接线 | DEV-3 已增加 versioned anchor read model/API/client repository，migration 未应用、CASE/Jest 未运行，正式页面仍由固定 `diary-*` 映射供数且无 save-event 接线。Q-016/Q-002/Q-003/Q-001 分别限制触发/标签/数量与源变更、质量/重试、摘录边界、恢复范围 | 写入校验设备归属、当前日记版本和 text/quote block；标签查询现于 MySQL 侧关联当前版本/成功提取并校验来源块后分页，不把全部候选载入应用层；无可信 provider 时所有非测试运行环境 fail closed，mock 不写持久表；未设 Diary 删除外键，旧 orphan 清理待决策 | 隔离 TEST 验证 MySQL 8.4 JSON_TABLE 查询、服务契约和 migration；Q 决策前不接自动触发、默认分类/传播或留存清理；不得把 mock/source 声明或未运行测试计真实锚点/CASE 通过 |
| GRW-004 | T-GRW-004-A03/A06/A07 / CASE-GRW-004-003/006/007/008/009 | 留存/并发/决策/真实锚点依赖 | DEV-3 已新增版本化纠正 Prisma/API/client repository 及 GRW-003 read-model schema/API；纠正读写现要求 anchor ID 命中同设备、同作品版本的 succeeded/provider row 并校验来源块。两项 migration 均未应用、正式页面未接线、CASE 未执行。Q-001/Q-003/Q-016 仍限制留存期限、字数和源变化/传播；原页面仍读写 Zustand `correctedAnchors` | `anchor-correction-v1` 定义设备归属、来源版本、expected correction version、幂等键与空白拒绝；Prisma Client 生成、typecheck、backend build、diff check 的既有检查通过；本轮 backend/client Jest 未运行；未改日记正文或 UI/UX | TEST 轮补 backend/client 单测及隔离 MySQL migration/e2e；缺隔离 DB 时记录并跳过。Q 未确认前不设置字数、留存/同步规则或跨域传播；可信 provider 接入前非测试运行环境拒绝提取写入；正式页面接线保持 UI/UX 授权边界 |
| GRW-005 | T-GRW-005-A01/A03/A05/A06 / CASE-GRW-005-001/003/004/005/006 | 决策/成长状态 | 成长页里程碑和2/3进度固定；解锁是内存 boolean 可直接设置，没有已保存业务事件驱动/幂等成长记录；资格/撤销受 Q-006，计数受 Q-005，恢复受 Q-001 | `scenario=unlocked` 仍是既有 `__DEV__` 分支；本轮未新增参数或改正式入口，不以手动状态作为自动成长证据 | Q-006 决定事件资格和阈值、Q-005 决定输入后，再实现可重放/持久成长读模型并复测 |
| GRW-006 | T-GRW-006-A01/A03/A04/A05/A06 / CASE-GRW-006-001～008 | AI/决策/真实报告 | 固定报告页仍未接 provider；DEV-1 已新增三维 provider/Store mock 骨架和来源版本/结构校验，但本地 `flowerUnlocked` 不构成真实授权，报告也未持久化。Q-002/Q-006/Q-016/Q-005/Q-001 限制质量、触发、来源、统计与留存 | `src/services/insight-report-provider.ts`、`src/store/create-app-store.ts`、`src/store/__tests__/insight-report-generation.spec.ts` 已建立；`npm run typecheck` 通过，测试未运行；未调用模型/数据库，正式报告页不变 | TEST 轮运行 mock/乱序/失败单测；待解锁/来源/质量/留存规则后接真实 provider 与 repository；mock 不算报告交付 |
| GRW-001 | T-GRW-001-A01/A04/A05 / CASE-GRW-001-001/004/005/006/007 | 决策/真实读模型 | 个人资料来源未接服务，日记统计仍使用 `SAMPLE_BASELINE`；正式增量/去重受 Q-005，账号/VIP范围受 Q-012，缓存与身份切换受 Q-001 | `app/(tabs)/profile.tsx`、`src/store/diary-domain.ts`、`growth-entry-card.tsx` 已核查；本轮不改固定统计或资料展示 | Q-005/Q-012 定义后建立共享资料/统计读模型，补空态/失败/身份恢复 CASE |
| GRW-002 | T-GRW-002-A01/A03/A05 / CASE-GRW-002-001/003/005/006/007 | 决策/成长读模型 | 主题标签及进度仍来自静态图与文案，无真实标签/成长读模型；Q-016/Q-006/Q-005 限制生产主题、成长提示与统计 | DEV-1 将当前树主题点击改为传已有 metadata `tagId`，锚点页兼容旧 `tag`；typecheck 通过，新增组件测试未运行，其他既有 CASE 未复验 | 先沿稳定 ID 契约接读模型；决策前不把四个展示标签或“差3片叶子”推广为真实用户规则 |
| GRW-003（旧盘点补充） | T-GRW-003-A01/A04/A05/A06/A07 / CASE-GRW-003-001/004/005/006/007/008 | 决策/AI提取/留存/页面接线 | 当前持久 read model/API 已在 DEV-3 增量实现但 migration 未应用、页面仍用固定映射；Q-016/Q-002/Q-003/Q-001 继续限制触发/分类/语义/质量/摘录/留存 | provider/read model 契约已建，写入 source block 严格验证，mock 结果不进入持久表；新增 Jest 未运行，无数据库操作、无真实 provider 证据 | 隔离测试后再依据 Q 逐分支接线；保留旧历史 CASE 状态，不把新代码或 mock 计 passed |
| GRW-004（旧盘点补充） | T-GRW-004-A03/A06/A07 / CASE-GRW-004-003/006/007/008/009 | 留存/并发/决策/真实锚点依赖 | 版本化纠正服务/API和 GRW-003 read-model code 已建立，均未应用 migration，正式页面仍读写内存字典且纠正 API 未校验 anchorId 对应的持久提取记录。Q-001/Q-003/Q-016 限制留存、长度与来源变化后的传播语义 | 当前是待测工程增量，不计持久留存或真实锚点关联验收通过 | 集中 TEST 使用隔离 DB 验证权限、来源块、版本冲突与幂等；再将纠正查询绑定真实 read model；决策前不定义输入上限/跨域传播，正式 UI 接线维持冻结边界 |
| GRW-005 | T-GRW-005-A01/A03/A05/A06 / CASE-GRW-005-001/003/004/005/006 | 决策/成长状态 | 成长页里程碑和 2/3 进度固定；解锁是内存 boolean 可直接设置，没有已保存业务事件驱动/幂等成长记录；资格/撤销受 Q-006，计数受 Q-005，恢复受 Q-001 | `scenario=unlocked` 仍是既有 `__DEV__` 分支；本轮未新增参数或改正式入口，不以本机会话状态作为自动成长证据 | Q-006 决定事件资格和阈值、Q-005 决定输入后，再实现可重放/持久成长读模型并复测 |
| GRW-006 | T-GRW-006-A01/A03/A04/A05/A06 / CASE-GRW-006-001～008 | AI/决策/真实报告 | 固定报告页仍未接 provider；DEV-1 已新增三维 provider/Store mock 骨架和来源版本/结构校验，但本地 `flowerUnlocked` 不构成真实授权，报告也未持久化。Q-002/Q-006/Q-016/Q-005/Q-001 限制质量、触发、来源、统计与留存 | `src/services/insight-report-provider.ts`、`src/store/create-app-store.ts`、`src/store/__tests__/insight-report-generation.spec.ts` 已建立；`npm run typecheck` 通过，测试未运行；未调用模型/数据库，正式报告页不变 | TEST 轮运行 mock/乱序/失败单测；待解锁/来源/质量/留存规则后接真实 provider 与 repository；mock 不算报告交付 |
| INT-001 | 全任务 | 全局集成后置 | J-01～J-06 仍依赖真实设备/provider/文件平台出口、若干未应用 migration、正式 repository 页面接线及产品 Q；backend Node 编译域不能直接引入 Expo Store harness | DEV-3 复核 task/CASE 与 backend runner；无独立可形成真实交付的本地链路，本轮未连数据库、设备或外部服务 | 后续 TEST 轮设计独立跨栈 harness，并在隔离库/真实设备及外部条件具备后执行；CASE-INT-001-001～008 维持未执行/待决策 |

2026-10-15 补充：`src/services/__tests__/photo-library.spec.ts` 已通过 fault plan 覆盖资产读取中途撤权错误被分类为不可读照片；与 `CASE-CRE-002-006` 页面门禁证据配套。仍未解除 `CASE-CRE-002-007` 的 iOS 模拟器 `E_NO_PERMISSIONS` 环境阻塞，也未验证实机撤权时序。此记录为 A03 中间状态；后续补齐的确定性故障矩阵见下方最终复验。

2026-10-15 补充：`share-export-file-service.spec.ts` 与 `share-delivery-orchestrator.spec.ts` 已通过注入式 writer 拒绝验证文件服务失败分类和确认事件阻断；真实 iOS 系统保存权限/实际文件出口仍待补，`SHR-005` 继续 partial。

2026-10-15 最终复验：`CASE-BAS-004-003` 已覆盖 paused/stale generation callback、迟到 `jobId` 取消、保存写失败/同幂等键重试、`E_NO_PERMISSIONS` 与真实文件 writer 拒绝，且均断言业务结果；`npm run test:domain`（88 项）、fault plan 单测（3 项）、photo/export/orchestrator 服务套件（9 项）、typecheck 通过。因此 `T-BAS-004-A03` 从当前阻塞台账移除并在验收矩阵标为 passed。真实 iOS 权限/文件系统仍按 CRE-002 / SHR-005 独立追踪。

CRE-005 本轮另补了 provider 请求兼容配置与服务单测：`AI_PROVIDER_RESPONSE_FORMAT` 支持默认 JSON 模式或按需关闭，生成/rewrite 温度可以独立配置，异常配置会回退或在网络调用前拒绝。它不受外部决策阻塞；剩余 blocker 仍是正式 provider 凭据/质量评测及 Q-002 确认的产品策略，本轮未据此提前收口验收状态。

CRE-005 照片归属校验已从部分结果类型扩展到普通文本/引言块、显式封面、海报、人物照片/头像与 rewrite 照片引用；所有显式越界 ID 都按不可重试 `provider_failed` 拒绝，可选照片数组缺失或为 `null` 仍按空数组处理。人物候选即使因缺少合法 `id` / `name` 将被忽略，候选内越界照片引用也会先行拒绝；`blocks` 非对象元素、空正文/图片说明/引用及契约必需字段缺失也会导致结构失败，不再以默认/mock 值伪造成功。provider 单测 43 项、backend build，以及 photo block、普通文本块、malformed 人物、malformed block、缺标题和空正文六条生成任务 e2e 均通过。这只补强确定性结构校验，不解除真实 provider 凭据/质量评测或 Q-002 正式重试与质量策略 blocker。

SHR-005 的 PDF 中文乱码问题已用标准 `STSong-Light` / `UniGB-UCS2-H` Type0 字体映射修复，并通过 macOS Quick Look 视觉复核；剩余阻塞转为 iOS/跨阅读器渲染、系统保存/打开出口及 Q-014 最终规格，A02 仍保持 partial。SHR-003 已补无效人脸矩形的服务层拒绝与边界裁切像素证据，尚未解除正式页面接线和真实视觉验收缺口。

2026-10-15 补充：DIA-005 来源版本检查此前在事务外，存在两个不同保存命令同时基于同一旧版本通过预检的并发窗口。本轮已改为事务内 `updateMany` 条件匹配来源版本，并以真实数据库 e2e 验证不同命令并发时一个成功、另一个 `version_conflict`，同一幂等命令并发重试时两次均追认同一结果，作品版本只递增一次；该工程缺口已闭环，不改变 `CASE-DIA-005-010` 对 Q-001/Q-008 的待决策状态。

2026-10-15 补充：`CASE-DIA-005-006` 新增后续编辑后重放旧保存键的真实数据库回归，保存接口现返回原 `SaveCommand` 记录中的 `draftId/savedVersion`，与查询接口一致。DIA-005 A05 的该工程缺口已闭环；`CASE-DIA-005-010` 的跨重启恢复与既有换图下限仍分别等待 Q-001/Q-008。

2026-10-15 补充：DIA-005 store 的 `saveDraft` 兼容 action 不再先写本地并异步丢弃远端失败，而是等待 `submitDraft` 确认；对应 deferred 测试验证等待与失败都不误标作品已保存。BAS-004 旧 runner 的异步执行与反向顺序已通过，未引入新的产品 blocker；Q-001/Q-008、Q-002/Q-004 及 CRE-002 iOS 原生权限阻塞保持原状。

2026-10-15 复验：异步兼容保存入口与旧 Node runner 更新通过 typecheck、domain（92 项）、完整 Jest（35 suites / 283 项）及正常/反向 legacy runner（各 15 项）；DIA-005 仅余 `CASE-DIA-005-010` 规则待决策，CRE-005、DIA-006 和 CRE-002 原有外部/待确认 blocker 均未改变。

2026-10-15 补充 BAS-003-A03：本地草稿快照读取/清理异常现已捕获并记录，避免 `hydrateDrafts()` reject 后短路根布局中的回忆同步；故障测试确认不调用快照清除/覆写且远端回忆仍可加载。A03 整体仍在进行中：`hybrid-dev` 下新建 store 默认包含 mock diaries，首页与统计仍消费该状态；当前不能把生产空身份无样例数据宣称为通过，也不擅自改变既定页面呈现。

2026-10-15 补充 BAS-002-A03：后端 `resolveDeviceId(...)` 现拒绝缺失或空白 `x-device-id`，并返回 `device_identity_required`；身份单测 4/4、完整 backend e2e 37/37、backend build 与前端 typecheck 已通过，省略或发送空白身份头的请求都不会继承旧共享 `device-anonymous` 草稿。公开投影、完整对象权限矩阵和 Q-012 正式身份边界仍未完成。

2026-10-15 补充 SHR-001/SHR-002 后端校验：保存 API 已持久化 block snapshot；`/api/sharing/project` 拒绝非私密范围缺失/空选段、非法隐私值、未知 block ID 与图片 block ID。完整 backend e2e 38/38、backend unit 4 suites / 50 项通过；错误请求不改旧范围，其他设备无法修改目标作品。真实公开内容读取 API 仍未接入，不据此宣称公开交付已完成。

2026-10-15 补充 DIA-005/BAS-003 正文保存：正文快照已通过新建/编辑 MySQL e2e 写入并从详情/回忆列表读回；服务端拒绝缺失快照及越界照片引用，前端不再用摘要生成占位正文。全量 Jest 35/288、domain 94、backend e2e 38、backend unit 50、typecheck/build 通过。跨重启口径、legacy metadata-only 作品迁移与照片资产生命周期仍未完成；`CASE-DIA-005-010` 保持 Q-001/Q-008 待决策。
2026-10-15 补充 BAS-003-A04：保存事务中途异常现由 e2e 专用 Prisma transaction proxy 在 `Diary.create` 后、`SaveCommand.create` 时注入；实测已回滚日记行且无保存命令，原草稿保留，移除代理后同幂等键重试成功。backend e2e 39/39、build 通过，`CASE-BAS-003-004` 解除；BAS-003 的 A01/A02/A03/A05/A06 及照片资产、生产空身份和迁移等阻塞仍在。
2026-10-15 补充 BAS-003-A05：未知但格式合法的整数 snapshot version 现在走保留路径；当前客户端不恢复、清理或覆盖数据，并禁用本次运行的本地快照写入。版本 2 store 回归通过，确认后续创建草稿仍不覆写原快照。Jest 35/289、domain 95、typecheck 通过。此保护不等于 legacy snapshot 格式转换或正文回填；Prisma schema migration 验证另见后续记录，A05 未关闭。
2026-10-15 补充 BAS-003-A05 Prisma migration 验证：在独立 MySQL schema 以初始 schema 记录为基线升级，`Diary.contentSnapshot` 迁移后原 `id/title/summary` 保留且新字段为 `NULL`，Prisma datamodel diff 无 drift；另验证空数据库可应用全部两条 migration。`npm --prefix backend run test:migrations` 通过。当前 `ai_diary` dev DB 仍由 `db:push` 管理，未写入或改动；其 baseline adoption、legacy 日记正文回填与损坏记录恢复继续列为未完成。
2026-10-15 补充 BAS-003-A05 baseline tooling：已有 `migrate:baseline` 安全入口，带显式确认并在写 history 前验证 schema 无 drift；独立 MySQL 验证证明 drift 时拒绝，完全匹配时仅记录 migration、保留日记数据。该工具尚未在当前 `ai_diary` 上执行；正式切换前需先备份并确认目标库，legacy 正文回填和 DB 损坏恢复仍是未闭环项。
2026-10-15 最终复验：migration verifier 的 clean deploy、legacy upgrade、drift rejection 和 baseline adoption 均通过；CRE-002 14/14，backend e2e 39/39、unit 50/50、build 通过。已有工具不表示当前 `ai_diary` 已登记 migrations；正式库切换仍需备份、确认 schema 和明确执行窗口。legacy 正文回填、DB 损坏恢复及 BAS-003 其他 CASE 继续未完成。
2026-10-15 补充 baseline guard（本地库实际执行前记录）：无显式确认参数或 schema drift 时工具都拒绝；drift refusal 不创建 `_prisma_migrations`；当 history 是已知连续前缀时可续记剩余 migration，且独立 MySQL 验证确认数据不变。当时工具尚未应用于现有库，随后已在只读核验后完成本地 `ai_diary` baseline；生产/其他库未操作。legacy 内容回填与数据库损坏恢复仍未完成。
2026-10-15 本地开发库 baseline 已执行：只读 schema diff 无差异，确认无既有 migration history 后登记两条已知 migration；执行前后 Diary 行数均为 2，随后 `migrate status` up-to-date、schema diff 无差异。baseline adoption 不再是当前 dev DB blocker；legacy 正文回填、数据库损坏恢复、素材留存和 A03 隔离边界仍未完成。生产及其他 DB 未操作。

2026-10-15 BAS-004-A01 环境阻塞已解除：原 `test:e2e` 脚本硬编码开发库 `ai_diary`，而 e2e `beforeEach` 会清理业务表，因此未在该目标上运行。新入口要求显式本机 `E2E_DATABASE_URL` 且 schema 名为 `ai_diary_test_*` / `ai_diary_e2e_*`；临时 schema migrations 与 backend e2e 39/39 通过，故意失败断言返回退出码 1，缺少隔离 URL 返回退出码 2。临时 schema 已清理，开发库 Diary 仍为 2 条；此项不再是当前 blocker。

2026-10-15 BAS-002-A04 工程验收已收口：客户端所有 repository HTTP 调用均经共享 `ApiClient`，增加默认/可配置 15 秒请求超时与可选 `AbortSignal`，结果映射为契约 timeout/cancelled/network failure；保存和建单的未知响应结果均按原幂等键追认/重放。前端 37 suites / 298 项、typecheck、backend build、隔离 MySQL e2e 39/39 及定向 transport/domain 回归通过。A04 不再是 BAS-002 blocker；A02/A03/A05、真实 provider 凭据与 Q-007/Q-012 等边界继续未完成。

2026-10-15 DIA-005-A07 保存响应超时缺口已修复：repository 将 timeout 作为结构化 RemoteResult 返回时，store 现在与 thrown network error 同样按原保存键查询结果；已提交则追认，无法确认则保留草稿，绝不自动重发保存命令。该工程缺口已有领域回归；Q-001/Q-008 的 `CASE-DIA-005-010` 仍待决策。

2026-10-15 BAS-002-A02 客户端泄漏子项：`tools/verify-client-bundle-secrets.js` 已作为可复跑扫描器接入根级 test command，三条 Node 单测通过；一次性 canary 的 Expo iOS export 扫描器检查 102 个文件无匹配。`backend/.env` 缺席；真实 provider 凭据、实际调用及请求/响应/日志链路仍未验证，需操作方提供隔离测试凭据与 provider 环境，A02 继续 partial。

2026-10-15 DEV-3 / TEST-4 社区 API 复测更新：controller/service backend unit 最终为 8 suites / 77 tests 全通过，backend build 通过。初测 74/77 时出现的三条 category 用例失败促使 controller 加入显式 `category=latest` 校验；缺省、`recommended`、`local` 均 fail closed。表内 8 suites / 74 tests 是 TEST-3 中间结果，以本条最终复测为准；未应用 migration、未创建 published fixture、未运行 MySQL e2e，DSC CASE passed 数仍不变。

2026-10-16 DEV-3 BAS-002 身份边界：后端审计发现 `/photos/capabilities` 与 `/health` 未要求 `x-device-id`，现均已加 `resolveDeviceId(...)`；discovery/chat/anchor/sharing 的身份优先级修正也已纳入本轮。相关 controller 回归/e2e 尚未运行，列入集中 TEST 待测，不计验收证据。此项没有新增外部/环境 blocker；BAS-002 仍因真实 provider、公开投影/权限矩阵及 Q-012 等既有缺口保持进行中。

2026-10-16 DEV-3 PET-001：持久聊天响应 contract 已补强，拒绝孤立/错序消息、turn 状态不一致和错误来源关联；HTTP repository 也在发送前拒绝未知 failure code。新增 contract/repository Jest 未运行，列入集中 TEST。正式页面/store send-retry 接线仍受 Q-001 留存策略与 UI/UX 可观察失败/重试边界限制；本次没有改动 UI 或持久化数据，也未关闭 PET-001 blocker。

2026-10-16 DEV-3 GRW-003：修复同版本共享提取任务的 caller cancellation 串扰，并添加未运行的 waiter 隔离回归。此为可独立修复的工程并发缺口，不新增产品决策或环境 blocker；Q-016/Q-002/Q-003/Q-001 对触发/语义、质量/重试、摘录和留存的既有门控保持不变。

2026-10-16 DEV-3 GRW-004：纠正命令已推进后，重放旧幂等键原会返回当前新纠正内容。现改为 `version_conflict` 并补未运行 regression，不保存历史正文副本；typecheck、backend build、diff check 通过，Jest/DB/e2e 未运行。Q-001 留存策略与 Q-003/Q-016 既有门控不变，不新增环境 blocker。

2026-10-16 DEV-3 DSC-003：同故事点赞写入新增 parent-row lock，串行化服务端 target-state mutation 和计数读取；service regression 未运行，typecheck/backend build/diff check 通过。Q-007 仍决定点赞资格、撤回以及网络乱序的意图优先级，Q-001 仍决定留存；本次没有改变规则、页面或数据库状态。

2026-10-16 DEV-3 GRW-006：旧来源报告请求若在 sourceVersion 变更后返回 provider failure，Store 现归为 `stale`，不再污染当前报告失败状态；provider 忽略 AbortSignal 时本地 action 也会及时收口。新增 regression 未运行；typecheck/diff check 通过。没有接页面或改变 Q-001/Q-002/Q-005/Q-006/Q-016 决策，报告持久化/真实 provider 仍延期。

2026-10-16 DEV-3 BAS-003：localStorage/文件系统快照空内容、读取/JSON 解析异常曾被适配器吞成 `undefined`，可能使损坏快照被误判为空并在后续写入时覆盖。现将异常交给 Store 既有 fail-closed hydration 保护；新增 adapter regression 未运行。此为已修复的独立开发缺口，不新增环境/产品 blocker，BAS-003 CASE 与验收通过数不变。

2026-10-16 DEV-3 BAS-003 已保存正文快照：客户端读取校验曾允许空正文块、仅图片块及越界照片引用。现与后端写入约束对齐；详情拒绝畸形快照，回忆 Store 隔离损坏单篇并记录 issue，不影响同页有效记录。新增 contract/repository/Store regression 未运行；不涉及产品 Q、migration 或数据库操作，CASE-BAS-003-005 保持 partial，未新增 blocker。

2026-10-16 DEV-3 BAS-003 数据库 JSON 标量损坏：后端 mapper 曾将 scalar/array 正文快照折叠为 `undefined`，使客户端无法区分损坏数据与 legacy NULL。现下发 `contentSnapshotStatus: invalid`，客户端可以记录 issue 并保留元数据；隔离 e2e/Store 回归未运行，未操作数据库，CASE 与通过数不变。

2026-10-16 DEV-3 BAS-003-A06：回忆 hydration/search 曾忽略远端 `publicBlockIds`，用内存旧值代替持久范围。现恢复服务端字段，并在权威 private 响应时清除选段；新增 Store regression 未运行，不涉及数据库或产品决策，CASE-BAS-003-006 仍待验收。

2026-10-16 DEV-3 BAS-003-A03：release runtime 的 Store 默认样例日记/照片现限于开发/Jest，空目录不再沿用示例 `currentDiaryId`，新建操作有空白领域模板；新增 runtime regression 未运行。统计 baseline、锚点固定数和资料/VIP 展示仍受 Q-005/Q-016/Q-012，A03 整体保持 partial。

2026-10-16 DEV-3 BAS-001/CRE-005：generation create request 现在在客户端/后端都校验非空 draftId/idempotencyKey 和正安全整数 draftVersion；controller 先解析 x-device-id，身份缺失仍优先于 body 错误。新增 regression 未运行，不产生环境/产品 blocker，相关 CASE 和通过数不变。

2026-10-16 DEV-3 BAS-001/CRE-005 generation request：补齐客户端和后端 runtime `draftVersion` 正安全整数/必填字段校验；generation controller 先解析身份，缺身份仍优先于 body `invalid_input`。新增 contract/repository/controller regression 未运行，不新增环境或产品 blocker，CASE/通过数不变。

2026-10-16 DEV-3 BAS-001/CRE-005 幂等载荷边界：相同设备幂等键现只允许复用同一 `draftId + draftVersion` 任务；并发唯一键竞争后会重读赢家并校验，不匹配返回 `version_conflict`。代码和待测回归已补，无新增外部/产品 blocker；Jest/MySQL e2e 留待 TEST。MAT-002 跨栈 Store/HTTP/MySQL 测试受 backend 编译域隔离约束，既有开发台账已登记 TEST harness 待办，本轮未将其列为通过证据。

2026-10-16 DEV-3 DIA-005/BAS-002 保存幂等：保存命令现核对同设备 key 的 `draftId + sourceDiaryId + sourceDiaryVersion`，不匹配返回 `version_conflict`；同身份首次结果重放规则保持原样。新增 e2e 未运行，无新增环境/产品 blocker，相关 CASE 不扩张通过范围。

2026-10-16 DEV-3 CRE-003/BAS-002 草稿建单：服务层现于写入前校验基本 body 字段及隐私/版本枚举；新增 e2e 未运行。无新增产品或环境 blocker，不新增照片数量/去重或来源存在规则，不扩大 CASE 证据。

2026-10-16 DEV-3 SHR-001/BAS-002 分享 API：controller 与 Store 增加 body 结构/枚举防线，缺设备身份仍先返回身份错误。新增 controller regression 未运行；不涉及 UI/UX、DB migration 或新 blocker，CASE/通过数不变。

2026-10-16 DEV-3 DIA-002 rewrite：generation rewrite endpoint 现有 controller/Store 双层 runtime body guard，身份错误优先，malformed input 不触发 Store/provider。新增 controller tests 未运行；真实 rewrite quality 仍按 Q-002 延期，未新增产品/环境 blocker。

2026-10-16 DEV-3 DIA-006 query 编码：拒绝重复/非十进制分页 query 与非字符串关键词，并保留 identity precedence；更新了一个旧 e2e 日期 fixture 以符合 contract 格式，未放宽成功断言。新增 controller regression 未运行，无新增 blocker。

2026-10-16 DEV-3 BAS-004 direct Jest guard：`jest-e2e.json` 现在在 e2e 初始化前校验显式隔离 URL 和 `DATABASE_URL` 一致，关闭绕过 runner 的潜在危险入口。runner URL 一致性 helper 定向单测 4/4 通过；未启动 e2e 或连接/清理数据库，配置级早停效果仍待 TEST，无新增 blocker。

2026-10-16 DEV-3 DSC-001 query boundary：discovery controller/service 新增 decimal pagination 与 keyword runtime checks，重复参数 fail closed；新增 tests 未运行。Q-007 的类别/发布决策及页面接线仍是原有局部 blocker，无新 blocker。

2026-10-16 DEV-3 PET-001 pagination boundary：新增的严格分页校验没有引入新产品或环境 blocker；controller/service regression 留待集中 TEST。既有 Q-001/Q-002/Q-003 与正式页面接线约束保持不变。

2026-10-16 DEV-3 PET-002 范围复核：确认统计 aggregate 尚无 repository，锚点 read repository 需要显式 `tagId`；Q-005/Q-016 仍未确认。当前无可独立推进且不改变 UI/UX/业务语义的实现，已登记后跳过，不新增 blocker；Q-001 缓存边界继续待定。

2026-10-16 DEV-3 DSC-002 响应绑定：新增 ID 校验不引入新 blocker；详情页接线和 published fixture/e2e 仍待后续 UI/UX 与隔离数据库条件。Q-007/Q-013/Q-001 既有权限、投影和缓存边界不变。

2026-10-16 DEV-3 DSC-003 runtime binding：新增输入/响应关联 guard 未引入新 blocker；页面接线、Q-007 资格/并发语义、Q-001 留存仍是既有延期条件。

2026-10-16 DEV-3 GRW-001 复核：共享统计函数已存在但仍依赖原型 baseline；没有确认的 Q-005 算法或资料服务契约前，真实读模型无法安全接入。本轮登记延期，无新外部 blocker；Q-012/Q-001 仍限制资料和恢复范围。

2026-10-16 DEV-3 GRW-002 复核：稳定 ID 路由已实现，但真实标签/成长读模型仍受 Q-016/Q-006/Q-005；未知/缺省 tag 当前显示静态默认组，修改默认或失效态需要产品确认。本轮不改正式行为，无新增 blocker。

2026-10-16 DEV-3 GRW-003 query guard：列表读取输入/响应绑定已补，新增回归待 TEST；不新增环境或产品 blocker。真实提取、页面接线、migration 验证仍按 Q-016/Q-002/Q-001 和集中 TEST 延期。

2026-10-16 DEV-3 GRW-004 correction binding：来源 query/命令输入与 response target guard 已补，新增 regression 待 TEST；不新增 blocker，真实页面、迁移、留存和下游传播仍按既有 UI/Q-001/Q-016 条件延期。

2026-10-16 DEV-3 GRW-005/006 复核：成长资格/解锁与报告首次生成、AI 质量、来源统计及持久留存没有已确认规则或授权；现有 GRW-006 mock/provider 边界保持。无新增 blocker，task/CASE 已登记后继续其他模块。

2026-10-16 DEV-3 INT-001 复核：跨栈真实流程仍依赖全局前置和 TEST 隔离 harness；本轮记录全局后置，不新造集成成功证据、不重复创建污染 backend 类型域的实验 harness。

2026-10-16 DEV-3 BAS-002 route audit：当前 controller 路由未发现遗漏身份校验；没有新 blocker。未运行的优先级测试、公开投影/权限矩阵、真实 provider 与 Q-012 身份范围仍是既有待办。

2026-10-16 DEV-3 BAS-003/DIA-001：清理异常现可上报，不误报草稿快照已删除；详情读响应与目标 ID 绑定。新增 regression 待 TEST；不引入新 blocker，legacy 回填/损坏恢复和正文留存范围仍按既有 Q-001/Q-015 延期。

2026-10-16 DEV-3 CRE-005 response binding：生成 task create/poll/cancel 与 request identifiers 及 Store 活动轮次现做双层关联校验；新增回归待 TEST，不新增 blocker，真实 provider/Q-002 质量与策略保持延期。

2026-10-16 DEV-3 CRE-006 person ID uniqueness：重复人物关联 ID 的业务校验已补，新增 service/contract/e2e 回归待 TEST；没有新产品或环境 blocker。真实 AI 识别/质量仍需 provider 与 Q-002 条件，Q-003 输入边界和 Q-010 跨作品记忆维持原待定状态。

2026-10-16 DEV-3 DIA-001 route cache binding：详情结果按 diaryId 隔离并使旧路由读取失效；页面 regression 待 TEST。未新增产品/环境 blocker，Q-009 菜单决策与 Q-001 留存范围不变。

2026-10-16 DEV-3 执行规则更新：S/M/L 复杂度队列尚待下一次开发选择前按当前 task 依赖重新排定；这是待排工作，不是环境 blocker。每项初次开发后最多两轮缺陷修复，超限仍失败则登记暂跳；不改变 CASE 判定，不产生通过项。中断前 CRE-006/DIA-001/DIA-002 新增回归尚未运行，需在集中 TEST 轮验证。

## TEST-5 / TEST-6 回流：DEV-5 修复项

| 优先级 | 任务 / CASE | TEST-6 实际结果与影响 | DEV-5 恢复动作 |
| --- | --- | --- | --- |
| S | MAT-001 / 本地 Store 导入回归 | ID 冲突用例假设素材成员初始为空；当前注入照片目录默认成员包含冲突 ID，导致 `not.toContain` 失败。未证明导入覆盖目录；现有设备 CASE 不变 | 比较导入前后完整 `photos` 与 `materialPhotoIds`，验证失败调用不改变既有状态 |
| S | DIA-001 / 缓存读取回归 | 成功响应仍含摘要占位 block，详情页依法再次读取；一次性 mock 耗尽后返回 `undefined` 并抛 `.then` 异常 | mock 返回完整非占位 diary snapshot，保留路由切换、迟到响应和重读断言 |
| M | MAT-002 / CASE-MAT-002-001～005 本地子集 | 测试选择目标日记后未触发预期路由，P4 未进入目标草稿；现有输出不能区分点击事件 fixture 与 `applyPhoto(...)` 实现分支，尚不归因为单纯测试问题。摘要在正文编辑时会被领域逻辑同步更新，测试仍断言编辑前固定摘要 | 检查目标行事件、action 回调与应用时 Store 状态，确认根因后再选择最小修复；将摘要断言改为与应用前快照比较，不改 UI/UX 或放宽原路由/引用断言 |
| M | CRE-005 / generation 本地状态子集 | 7 条 Store 断言因响应的 `draftVersion/idempotencyKey` 与选图后实际 round 不符被正确拒绝；生成状态、失败文案与阶段断言均未得到有效运行证据 | 由实际 create request 构造轮询/取消响应，保留 strict request binding 及原断言，不放松 contract |
| M | GRW-003 / CASE-GRW-003-005 本地取消子集 | TEST-5 进程异常退出；TEST-6 用例未等待 provider 启动，signal 断言收到 `undefined`。不代表实际 API/数据库提取通过或失败 | 以 provider-started promise 同步 cancellation fixture；验证单 waiter 与共享 waiter 两个场景，复测修复轮计数 `1/2` |

TEST-6 backend unit 17 suites / 198 tests 全通过；前端 50/55 suites、429/443 tests 通过。`npm run typecheck`、backend build、`git diff --check` 通过。DEV-4 已关闭 DSC-002 空 story ID controller regression，复测通过。上述本地缺陷不需要产品决策；数据库 e2e 仍因缺少 `E2E_DATABASE_URL` 未执行，不在开发库运行。

## TEST-7 回流：DEV-6 最后修复轮

- MAT-002 `1/2`：已定位真实 Store 快照 bug。`applyPhoto(...)` 在 `beginEdit(...)` 更新 Zustand 后继续读取旧 `store.drafts`，导致没有 P4 写入或导航。恢复动作是在 action 后重新读取当前 store；不改正式 UI/UX。DEV-6 是第二轮修复与复测机会。
- GRW-003 `2/2`：provider-started 同步已补，但测试在 abort 同步返回后过早检查 provider signal。恢复动作是 await cancellation rejection 使 waiter release 收口，再核对 signal 和迟到结果。DEV-6 是最后修复与复测机会。
- DEV-5 子集复测通过：MAT-001 冲突基线、DIA-001 完整详情 mock、CRE-005 generation request-bound fixtures，分别计 `1/2`；前端 suite 53/55、439/443。TypeScript 有一条 Jest mock `ok` literal widening 错误，待 DEV-6 以契约返回类型修正。
- 若 MAT-002 或 GRW-003 在 DEV-6 集中复测仍失败，保留失败 CASE/缺陷并标记达到 `2/2` 返工上限暂跳；不更改断言或原始范围。TEST-7 无外部服务、设备或数据库证据，未新增环境阻塞。

## TEST-8 回流：DEV-7 BAS-004 runner

- `node tools/run-domain-tests.js` 与 `DIARY_DOMAIN_TEST_ORDER=reverse node tools/run-domain-tests.js` 当前均在案例启动前 `MODULE_NOT_FOUND: ../contracts/core-diary-contract`。失败源于临时目录文件清单漏掉 `src/contracts/core-diary-contract.ts`，其 `diary-capabilities` 依赖已在清单内；无领域 CASE 实际执行、无数据库访问。
- CASE-BAS-004-002 当前 worktree 标记未通过；此前 normal/reverse 各 15/15 保留为旧版历史证据。DEV-7 S 级恢复动作是在 runner transcompile list 加入 contract 并执行两种顺序各 15/15。该问题首次集中失败，计数 `0/2`。
- 当前验收重新按 coverage 225 与 matrix 明确 passed 重算：95/225（42.2%）。前端 Jest/typecheck 通过不替代 BAS-004-A02 runner；不运行 E2E 或其他数据库命令。

## TEST-9 回流：DEV-8 runtime import closure

- DEV-7 加入 core contract 后，正常/反向 runner 再次在任何领域场景前失败，当前未解析模块为 `../contracts/ai-image-generation-contract`。该失败属于同一个 BAS-004-A02 runner startup 缺陷线；修复轮计数 `1/2`。
- DEV-8 当前 S→M 处理方式：按 `create-app-store.ts` 的全部 runtime imports 同步临时编译依赖；纯 TypeScript contract/provider 留在隔离 temp tree；原生照片 importer 与 backend HTTP adapters 以不触网、不访问 DB 的 no-op stub 隔离。继续失败后可根据下一缺失依赖作同轮审计，不盲目反复执行；完成依赖闭包后再统一跑 normal/reverse。
- CASE-BAS-004-002 保持未通过，95/225（42.2%）；无需用户决策，未调用收费服务或真实系统能力。

## TEST-10 回流：runner 缺陷关闭、setup guard 仍待环境

- DEV-8 补齐本地 runtime dependencies/stubs 后，当前 worktree normal/reverse E01～E15 均 15/15；CASE-BAS-004-002 恢复通过，修复轮 `2/2` 已通过，不再是当前 blocker。TEST-8/9 的模块加载失败保留历史。
- CASE-BAS-004-001 仍 partial：新增 `backend/test/jest-e2e.json` 的 direct-invocation setup guard 尚未在有效隔离 MySQL URL 下正常启动完整 e2e。`E2E_DATABASE_URL` 当前未配置；必须准备本机 disposable `ai_diary_test_*` / `ai_diary_e2e_*` schema 后再验，禁止退回开发库。
- 当前矩阵明确 passed 为 95/225（42.2%）：A02 runner 复测恢复 1 项；A01 setup guard 当前不计通过。若隔离 DB 未准备，维持环境阻塞，不重跑缺配置命令。

## TEST-12 / DEV-11 / TEST-13 回流：migration 与取消生命周期

- 首个隔离 fresh-schema migration 部署发现 discovery 的五字段索引名超过 MySQL 64 字符；同轮扫描所有当前 migrations 后，又发现 anchor correction 四字段唯一索引名同样超长。DEV-11 在 Prisma schema 与两份 migration SQL 同步添加短 `map` 名，字段、约束和查询语义不变；TEST-13 6/6 migrations 成功、status up-to-date、schema diff 无 drift。
- direct Jest setup guard 在 TEST-13 专用 schema 中成功启动，完整 backend e2e 46/46；后端 unit 17/199、backend build、root typecheck、`git diff --check` 均通过。A01 从 partial 更新为 passed。
- TEST-12 首轮 e2e 还发现 JSON primitive `null` 被默认 parser 提前拒绝，以及 generation cancel 后后台 provider request 仍在运行并于 Prisma disconnect 后发起查询。DEV-11 将合法 primitive JSON 交给 controller runtime/identity-first guard，并将生成取消信号传递给 provider fetch、跟踪后台 promise，reset/shutdown 时 abort 并等待。TEST-13 新 e2e 等待本地 fetch stub 启动后取消，确认 AbortSignal 已传播；所有断言通过，Jest 正常退出。
- 四条缺陷线均为 TEST-12 首轮修复 `1/2`，TEST-13 通过：DSC-001 migration、GRW-004 migration、BAS-002/CRE-003 malformed body、CRE-005 provider cancellation lifecycle。未调用真实 provider；测试临时 schema 已删除。
- 当前矩阵按 coverage 225 重算为 96 passed（42.7%）。BAS-004 已完成；DSC-001/GRW-004 的 migration 通过不等于业务 CASE 完成，相关页面/Q/provider blocker 保留。

## DEV-12 / TEST-14 回流：anchor 查询实际 MySQL 结果

- 在隔离 e2e 新增 discovery/chat/anchor 三个服务集成流程，并将 `MemoryStoreService.reset()` 扩展为按依赖顺序清理新模块表，避免跨 CASE 数据泄漏。discovery 与 chat flow 先通过。
- anchor flow 的首次 MySQL 查询返回 0 条，但同事务前置已确认 extraction 与 anchor 写入成功。直接检查发现各 join/来源 predicate 单独匹配，问题在 MySQL 对 correlated `EXISTS(JSON_TABLE(...))` count 路径；数据没有丢失，且没有隐私越权。
- DEV-12 将 `JSON_TABLE` 改为来源验证 join，显式处理字符串 collation，以 `COUNT(DISTINCT anchor.id)` 和 `SELECT DISTINCT` 防止重复段落重复计数/分页；TEST-14 同一隔离 HTTP e2e 返回正确来源锚点并验证纠正写读、跨设备拒绝。
- 当前完整 e2e 49/49、backend unit 17/199、typecheck/build/migrate status/no-drift 通过；临时 schema 已清理。首轮空结果保留在 GRW-003 CASE/开发台账，CASE-GRW-003-005/006 与 GRW-004-003/007/009 仅部分执行，没有新增完整 CASE passed。

## 2026-10-20 DEV-13 PET-001 Ark provider

- 本节更正上方 TEST-14 以前的 PET-001 阻塞表：Store send/retry 与页面气泡反馈现已接线，服务端凭据已配置；另在 disposable schema 跑通一条真实 HTTP/provider/Prisma turn。完整 Expo App/设备流程及 Q-001/Q-002/Q-003 决策仍未闭环。
- 已新增隔离于 `AI_PROVIDER_*` 的 PET-001 Ark-compatible server provider、受信生成 endpoint 与 repository method；同进程相同 request/attempt 并发合并。自动化测试使用 fetch stub；另有真实 provider smoke 及一条合成消息的后端 HTTP/DB smoke。
- 旧 `wxcoco-api/.env` 的 Ark key/base/model 已白名单迁入本地 `backend/.env`，目标文件权限为 `0600` 且被 `.gitignore` 忽略；旧 cookie/session、数据库及其他设置未复制。新 backend provider 对 Doubao 模型完成一次无个人数据 smoke test，收到有效回复。
- `ai_diary` 6/6 migrations 已部署且 schema diff 无漂移；测试专用 schema 验证后已清理。后端 HTTP smoke 读回 1 conversation、1 turn、2 messages，但未执行 Expo 实机流程、多轮/真实重试或质量评测；上次会话恢复及 Q-001/Q-002/Q-003 的留存、质量/安全/超时重试、输入边界仍未确认。DEV-13 不改变 CASE 通过数或 96/225 验收统计。

## 2026-10-21 · DEV-21 · BAS-002 App Attest 身份升级

- 本地实现与定向检查已完成；Team ID `JWTMTK2F34` 和本地随机 `DEVICE_AUTH_JWT_SECRET` 已安全写入被忽略的 `backend/.env`，mode 保持 development legacy；还需在 Apple Developer 后台刷新 provisioning profile、将 migration 部署到隔离测试库，并用真实 iPhone 执行 sandbox/production 对应测试。
- 用户确认 Android 不需要支持，本认证范围仅限 iOS。旧匿名 ID 数据按已确认选择不迁移。
- 未将 Prisma migration 部署至开发库或生产库；Debug iOS simulator target 已编译成功但未签名/安装，EAS/实机签名构建未执行。后端 Prisma 当前 npm audit 另报告 3 条 `deepmerge-ts` 高危公告，属于 Prisma tooling 依赖链；不在本轮通过破坏性 major upgrade 处理。
