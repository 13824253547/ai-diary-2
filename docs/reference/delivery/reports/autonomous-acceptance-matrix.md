# 自动推进验收矩阵

## 最新统计（TEST-14）

coverage 有效验收总数为 225，当前明确 passed 为 96（42.7%）。TEST-14 后端 unit 17/17 suites、199/199 tests，隔离 MySQL e2e 49/49，root typecheck、backend build、Prisma migrate status 与 schema diff 检查均通过。CASE-BAS-004-001 当前 Jest setup guard 已在专用本机 schema 实际启动，BAS-004-A01～A05 均通过；BAS-004-A02 normal/reverse 15/15 证据仍有效。TEST-14 新增的 discovery/chat/anchor 数据库测试属于各 CASE 的部分证据，不增加 passed。以下日期记录为其时证据，历史 passed/failure 均保留。

本矩阵仅记录真实 CASE 验收证据，不代表开发工作量。当前 DEV/TEST 轮次、修复记录及验收通过总数以本页“最新统计”、同名任务/CASE 与 `development-progress.md` 为准；外部能力缺失时的 mock/unit 测试不替代真实 provider、设备、文件或渠道 CASE。

## 当前汇总

| 任务 | 当前状态 | 已通过 | 进行中 | 阻塞 / 未执行 |
| --- | --- | --- | --- | --- |
| BAS-001 | 进行中 | A01、A02、A03 | A04、A05 | DEV-3 新增 MAT-005 配图生成与 GRW-006 洞察报告 v1 契约/Store 校验，以及回忆查询有效年月/日期约束；相关新测试尚未运行，不据此新增通过项。真实 provider 与后续模块的正式质量评测仍待扩展 |
| BAS-004 | 已完成 | A01、A02、A03、A04、A05 | - | TEST-13/14 在专用本机 schema 上直接运行当前 Jest config，setup guard 成功；当前完整 backend e2e 49/49，TEST-10 当前 worktree normal/reverse runner 各 15/15。TEST-12 首轮真实 malformed-body 断言失败已修复复测，TEST-14 将该集扩展到 discovery/chat/anchor flows；所有测试临时 schema 已清理。此完成状态仅针对 BAS-004，不代表其他 task 的设备/文件/provider CASE 通过 |
| BAS-002 | 进行中 | A01、A04 | A03 | A04 已验证可配置传输超时、`AbortSignal` 取消映射、旧回包保护、重复提交幂等、来源版本冲突，以及建单/保存超时后的同键追认；A02、A05 仍待真实供应商与双环境证据；A03 的公开内容读取、完整对象权限矩阵与正式账号边界仍待补齐。后端拒绝缺失/空白 `x-device-id`、非法公开选段，正文快照随作品事务持久化 |
| BAS-003 | 进行中 | A04 | A01、A02、A03、A05 | A04 已通过真实 MySQL 事务内保存命令写入异常回滚及同幂等键重试验证；A05 现有初始 Prisma schema 和 `contentSnapshot` 演进迁移，并验证空库部署、旧 schema 元数据保留及 drift-guarded baseline 工具；本地未知快照版本也有防清除/覆盖保护。当前本地 `ai_diary` 已在只读 diff 无漂移后登记两条 migration，记录数保持 2 且状态 up-to-date；legacy 正文回填和数据库损坏恢复仍未完成。生成任务已迁入 Prisma 并补了跨应用实例恢复证据；未提交草稿已按第一阶段默认值实现同设备本地恢复/坏记录隔离，快照读取失败也不会中断后续回忆 hydration；DEV-3 新增快照并发、修订恢复、正文完整性、数据库损坏 marker、公开范围恢复及 release 默认空 diary/photo fixture 回归，均未运行、不构成 CASE 通过。A03 的 release diary/photo 默认样例隔离已开发待测；个人统计/锚点/资料原型仍受 Q-005/Q-016/Q-012 约束，故 A03 仍不通过。已保存作品/素材资产的完整重启恢复、legacy 回填与冲突处理仍待 Q-001/Q-015 收口 |
| CRE-001 | 进行中 | A02、A04、A05 | A01、A03 | 权限说明页、系统请求、草稿绑定、授权不改私密状态、关闭后迟到回调保护与启动同步均已落地；相册页进入前也会再次与原生权限状态同步，但未授权读取次数、有限访问/拒绝/撤回矩阵与实机证据仍待 Q-018 收口 |
| CRE-002 | 进行中 | A01、A02、A03、A04 | A05 | 真实相册目录读取、页面内暂存选择、新建/替换确认写回同草稿、新建取消继续/放弃、替换取消隔离、确认前可读性复核、进入读取前的原生权限重同步，以及旧请求不覆盖新相册结果和分页失败反馈均已落地；新建链路的整篇换图也已补上“replace 不再偷偷继承上一轮旧照片”的回归。真实 iOS 资源失效验证已定位到模拟器 `E_NO_PERMISSIONS` 原生异常，但 Q-003/Q-018/Q-008 对应规则与真实设备矩阵仍待补齐 |
| CRE-003 | 已完成 | A01、A02、A03、A04 | - | 模板页已改为显式写入草稿类型，`work / emotion` 在界面、领域层和真实服务上都不能作为新建类型；历史 `emotion` 作品仍可阅读，重复 `travel` 提交也只会复用同一草稿 |
| CRE-004 | 进行中 | A01、A02、A03、A04、A05 | - | 显式角色能力白名单、浏览链路角色保留、草稿持续远端同步、隐藏/未知角色阻断、目录失败后的可见重试恢复，以及重复点击幂等已落地；当前仅剩 Q-009 关联的浏览后是否重复确认角色规则待定 |
| CRE-005 | 进行中 | A02、A03、A04、A05 | A01、A06 | 已完成持久化任务/轮询、成功快照与照片归属校验、取消/迟到回调保护、失败重试和同 `jobId` 自动重试；页面分流、失败态与严格结构化结果均有回归。真实 provider 联调、Q-002 正式重试矩阵/质量阈值及 CASE-CRE-005-010 仍未完成 |
| CRE-006 | 进行中 | A01、A03、A04、A05、A06 | A02 | 已打通“有候选进入命名、无候选直进编辑”的分流，命名保存/跳过/失败保留/无效人物忽略与重复点击防重入也已有前后端证据；多同行者输入框也已收口为唯一可访问标签并验证互不串值。正式长度与字符计量仍受 Q-003 限制，跨作品人物记忆仍受 Q-010 限制 |
| DIA-001 | 进行中 | A01、A02、A03、A06 | A04、A05 | 详情页已补真实单篇读取、回忆摘要占位自动远端补全、读取失败重试和旧回包保护；`Photo` 组件在坏图时也会显示“图片暂时不可用”，正文和引用仍继续可读。`DiaryPaper` 也已补三种开放角色的布局分支证据，确认布局会随角色切换，但标题、正文、引用句与照片引用仍属于同一篇作品。公开设置往返和锚点联调仍待 `NAV-001 / Q-009`、`GRW-003/004` 及真实设备坏图注入补齐 |
| DIA-002 | 进行中 | A01、A02、A03、A04、A05、A06 | - | 局部重写已从前端固定文案切到真实 contract/repository/backend provider 边界，并补了作用域、失败保留原文、超时与畸形输出保留原文、重复触发去重与旧结果不覆盖新输入的证据；编辑页在“日记不存在”“没有正文/引用块”“选中块已失效”三类 A04 场景下已补齐禁用/空态页面证据，本轮又补齐了 A06 的页面级失败反馈矩阵：重写超时、provider 失败与畸形结果都会弹出精确中文提示；标题只改草稿、正文/引用块独立编辑，以及“第一次放弃恢复原快照、第二次保存仍沿用同一 diaryId 且列表数量不变”的 A05 闭环也已补成 DIA-002 自身的专属 domain CASE。当前剩余主要是 Q-002/Q-003/Q-008 关联的真实重写质量与文本边界 |
| DIA-003 | 进行中 | A01、A02、A03、A04、A05、A06 | - | 整篇换图后的集合/封面/海报/段落引用/人物规范化、段落引用换图时关联图片块跟随首图更新、清空引用移除关联块，以及保存后按同一 `diary-1` 落盘且不产生重复作品的领域证据都已补齐；整篇换图入口的旧请求不回写、确认写回同草稿、取消不提交和换图后旧生成失效已有页面级回归；本轮又补齐了段落引用面板的可读性校验与失败原子性页面证据：已有引用若在确认时被判定为不可读，或校验直接失败，编辑页都会阻断提交并显示中文提示，关闭面板也不会把暂存选择写回草稿。当前仅剩 `CASE-DIA-003-009` 受 Q-003 / Q-008 / Q-001 待决策约束 |
| DIA-004 | 进行中 | A01、A02、A03、A04 | - | 更换排版师入口已复用开放角色目录与 `preserveContent` 角色更新：开放角色目录、说明文案、目录失败恢复、无效角色阻断，以及保存后仍沿用原 `diary-1` 且布局随 `characterId` 切换的证据已经到位；本轮在 `app/__tests__/character-screen-replace.spec.tsx` 基础上，又补了 `app/__tests__/character-screen-replace-back.spec.tsx`，确认 replace 模式选择后会返回原编辑页且保留同一草稿内容，直接返回也不会误改原草稿。因此 A01~A04 均可按当前证据通过；当前仅剩 Q-008 关联的待决策 CASE-DIA-004-006 |
| DIA-005 | 进行中 | A01、A02、A03、A04、A05、A06、A07 | - | 新建保存进完成页、列表只新增一项、编辑保存回详情且列表数量不变、返回后选择继续编辑时不会导航离开也不会发起提交、真实后端回忆列表入口串联、放弃后延迟重写结果不复活草稿、提交成功后草稿禁改、三张图片保存门禁与来源缺失拦截，以及未提交草稿同设备本地恢复和坏快照隔离均已有既有证据；本轮又补齐了生成仍在进行中、已生成但照片不足三张、来源作品缺失三类前置失败下“拒绝保存、保留草稿、不改 D2、不残留保存中状态”的领域断言，并新增保存期间并发编辑时 rebase 保留新修订、修订级幂等键的代码与待测回归（未运行，不新增通过项）；剩余 Q-001 / Q-008 关联的 CASE-DIA-005-010 待决策 |
| DIA-006 | 进行中 | A01、A02、A03、A04、A06 | A05 | 周条/月历日期标记已补组件级一致性证据；结果卡片已按 diary ID 跳详情，且同标题不同 ID 的列表卡片现已通过“标题 + 日期”唯一标签收口到正确详情，“刚刚写下的回忆”分组也已通过“刚刚写下的回忆 + 标题 + 日期”唯一标签稳定打开被点击的同一篇日记；跨分组同标题场景下最近回忆入口与普通结果列表也会各自按自身 `diaryId` 跳详情，且详情返回后月份/日期/关键词筛选不丢失、无返回栈时会兜底回 `/(tabs)/memories`，因此 `CASE-DIA-006-005` 已可独立通过。DEV-3 新增严格年月/日历日期 contract、client fail-fast 与 controller `invalid_input` guard，相关 regression 未运行、不新增通过项；A05 的近期分组筛选规则仍受 Q-004 约束 |
| DIA-007 | 进行中 | A01、A02、A03、A05 | A04 | 个人页月度装订入口已从静态演示月份切到真实月份分组参数；月度装订页也已基于真实已保存日记渲染月份书册、成员列表和空态。指定月份参数只会打开对应合集，成员列表不会混入其他月份，同名日记入口会按正确 `diaryId` 打开详情；无已保存日记时不会伪造分册、成员或导出按钮。本轮又补齐了月度导出运行中/失败/取消状态、跨月份覆盖提示、取消后迟到结果忽略，以及月份与成员版本快照固定，因此 A05 已有真实代码和自动化证据。当前剩余仅 A04 的真实交付文件仍受 Q-011 / Q-004 / Q-001 待决策约束 |
| NAV-001 | 进行中 | A05 | A01、A02、A04、A06 | `more-actions`、`replace-photos`、`leaveDraft` 与底部导航离开确认已形成真实代码与回归证据：继续编辑/换图会复用同一草稿，取消/放弃不产生未确认写入，保存成功也会按既有链路回到正确详情；当前只把 `A05` 记为通过。完整入口矩阵、冷启动/深链与 37 页面核验仍待补齐，详情正式菜单路径继续受 Q-009 约束 |
| SHR-001 | 进行中 | A01、A02、A03、A04、A05 | - | 公开范围页现已接到真实仓库异步保存：`publicBlockIds` 已入库，`/api/sharing/project`、`updateDiaryVisibility(...)` 与 `setDiaryVisibility(...)` 已打通；`privacy` 页已验证首次打开默认选中私密且不自动提交、四种范围重开时都会读回当前已保存的范围与选段，改动后直接返回不会提交、无效目标会落空态且不影响 D1/D2，保存失败或目标在提交时失效也不会误返回成功；当 D1 保存中切到 D2 时，D1 的迟到成功/失败不会再把导航或提示误作用到 D2，且 D2 当前页在 `returnTo=detail` / 默认成功路径下都只会按当前规则导航一次。本轮 `app/__tests__/share-privacy-screen-regression.spec.tsx` 又补齐了“保存失败后重开仍回最后一次成功保存范围与选段”的页面回归，因此 A04/A05 也已可按当前证据通过。Q-007 / Q-009 / Q-013 仍影响社区权限、返回路径与撤回语义，但不影响当前验收项通过 |
| SHR-002 | 进行中 | A01、A02、A03、A04、A05 | - | `projectDiaryForSharing(...)` 已在领域层真实生成选段投影，`app/share/result.tsx` 也已把同一个 `projected` 对象同时供海报与全文预览消费；`app/__tests__/share-result-screen.spec.tsx` 已验证“只选 B1 时海报与全文共用同一版选段投影”“只选无图引用句时不回退原图”“私密预览仍读整篇”，以及“公开选段从 V1 切到 V2 后分享结果页会刷新到最新投影版本”；`src/store/__tests__/diary-domain.spec.ts` 已补上重复/未知/图片块 ID 不扩展内容的专属断言；本轮 `app/__tests__/share-privacy-screen-regression.spec.tsx` 又补齐了 A01 的页面级“保存失败后重开仍回最后一次成功保存的范围与选段”回归，因此 A01~A05 已可按当前证据通过。共享图片归属边界与真实导出格式语义仍待 Q-013 / Q-014 收口，但不影响当前验收项通过 |
| SHR-003 | 进行中 | A01、A03、A04 | A02、A05 | `projectDiaryForSharing(...)` 已真实完成匿名文本投影：标题、副标题、摘要、地点、正文、小标题和图片说明中的姓名/别名都会替换为“同行人”，对外 `people` 列表也会清空；`app/__tests__/share-result-screen.spec.tsx` 已验证匿名公开与只选 B1 同时生效时，海报与全文预览都会读取匿名后的选段投影，不会回退被排除的 `B2/P2`。`src/components/diary/photo.tsx` 也已基于 `faceRects` 渲染展示层遮挡，`src/components/diary/__tests__/photo.spec.tsx` 已补宽裁切/高裁切两种坐标回归；`src/services/__tests__/share-asset-preparation.spec.ts` 本轮又补了真实 PNG 匿名文件像素回归、作品/目标/版本缓存隔离和不可读匿名文件拦截。当前剩余仍是 A02 的完整真实视觉验收，以及真实导出链路上的失败闭环与最终交付证据 |
| SHR-004 | 进行中 | A01、A02、A03 | A04 | `app/share/result.tsx` 当前已真实消费 `projectDiaryForSharing(...)` 的统一投影：海报与全文预览共用同一份内容，私密场景保留整篇，选段/匿名场景沿用 `SHR-002 / SHR-003` 的当前投影结果。`app/__tests__/share-result-screen.spec.tsx` 本轮又补齐了无效 `diaryId` 空态、预览关闭回原分享页且不改分享记录、切换到另一篇日记时旧内容不残留等页面回归，因此 A01~A03 已可按当前证据推进；A04 仍缺真实异步读取/渲染失败的可见反馈证据，先按 partial 记录 |
| SHR-005 | 进行中 | - | A01、A02、A04、A05、A06 | `src/services/share-delivery-orchestrator.ts` 已先补不依赖正式前端改动的真实交付编排：私密作品会在外部渠道调用前被拦截；所有分享/导出动作都会先走 `prepareShareAssetsForDiary(...)`；只有导出文件或外部渠道返回已确认完成后，才通过 `onConfirmed(...)` 回写平台/导出记录；取消、失败、环境不支持都不会被误记成功；同一 `diaryId + version + mode` 的重复提交会复用在途操作，不同版本或不同出口则彼此隔离。`src/services/share-export-file-service.ts` 本轮又补上了真实本地文件导出：`save` 会生成 PNG 文件、`pdf` 会生成可读取 PDF 文件，且文件路径按作品、版本、操作 ID 与导出模式隔离；`src/store/create-app-store.ts` 也已新增 `confirmShareDelivery(...)`，把“确认后才记记录”的规则落到领域层：相同 `operationId` 只会记一次，旧版本或错目标的晚到回调不会写回当前作品。`src/services/__tests__/share-export-file-service.spec.ts`、`src/services/__tests__/share-delivery-orchestrator.spec.ts` 与 `src/store/__tests__/diary-domain.spec.ts` 已共同覆盖真实文件生成、私密拦截、取消不误记成功、确认事件去重，以及按目标/版本隔离的写回保护。当前仍缺 Q-014 最终文件规格、iOS 系统保存/打开矩阵、正式渠道适配器和页面接线，因此 A02 先按 partial，A03 仍未开始 |
| MAT-001 | 进行中 | A02 | A03、A05（部分消费接线） | `app/library/index.tsx` 现从 store 注册照片目录解析素材成员并支持本地 URI；A02 搜索页面回归验证非 mock 设备照片的标题/地点筛选、空态及清除恢复。A03 页面回归部分验证非 mock URI 预览、关闭返回、引用状态初始正确，并在 store 已保存引用更新后刷新标记。DEV-3 新增 `expo-media-library` 选中资产读取服务与 `importDevicePhotosToMaterials(...)` Store action：权限拒绝、顺序 Image.getSize 解码失败/仅云端资源均不写入，设备 ID 去重、同 ID URI 刷新且 mock ID 冲突拒绝；本轮 typecheck/diff check 通过，新 Jest 未运行，正式上传 sheet 未接 action。素材缩略图、日记 `Photo` 组件和明信片页现都能从同一 store 目录解析同一已注册 ID/URI；CASE-MAT-001-006 仍部分执行，fixture 不证明真实设备导入或文件可读。A01/A03/A04 与 URI 留存仍受 Q-001/Q-003/Q-015/Q-018 和正式 UI/UX 边界约束；未增加 CASE passed。 |
| MAT-002 | 进行中 | A01、A03 | A02、A05 | A04；`app/__tests__/library-screen-material-apply.spec.tsx` 验证注册 P4 进入 D1 草稿、引用追加、重复不重复、应用后放弃不改 D1/D2，以及 A05 无正文/目录失效时不留草稿；store repository 请求回归验证 P4、正文引用、整篇照片、原 D1 ID 和来源版本一起提交。isolated MySQL e2e 验证保存追加照片 ID 后沿用原 D1、版本递增、D2 不变且回忆列表无重复；历史完整 backend e2e 40/40 通过。DEV-3 修复 `applyPhoto(...)` 读取 saved diary 首段导致覆盖现有编辑草稿引用的问题，改为读取当前草稿后追加；新增页面回归已写未运行，CASE-MAT-002-004 仍受 Q-015 待决策。分层 fixture 不证明真实 P4 文件可读，也不是素材页到 MySQL 的单次端到端链路，完整媒体验收仍依赖 MAT-001/CRE-002；不新增 CASE passed。A05 其余文件失效反馈/返回受 Q-009/Q-015 约束。 |
| MAT-003 | 进行中 | A01、A03 | A02、A04 | `app/__tests__/library-screen-decorations.spec.tsx` 已逐项验证全部 5 种贴纸和 3 种印章预览的名称/资源映射；关闭任一预览都会回素材页且不改日记、草稿、素材成员或照片选择，A01/A03 通过。A02 已验证 `stampKyoto` 稳定 ID 从素材预览传到 `/postcard` 并显示在卡片预览，PCD-001 仍没有真实生成图片资产；A04 未知装饰回退/错误语义仍受 Q-015/Q-009 约束。 |
| MAT-004 | 进行中 | A01、A04 | - | `app/__tests__/library-screen-inspiration.spec.tsx` 已验证三张灵感卡的问题对应、空/纯空白答案禁止提交，尝试提交不改会话/作品；未提交回答关闭面板也不会发送消息、改作品或导航，A01/A04 通过。当前有效提交已把所选问题和回答合并为一条带本地 request ID 的 user message，但仍走本地 `sendChat(...)` mock；PET-001 持久 session API/repository 未接入此入口，失败/等待恢复没有已授权的可见反馈。A02/A03 仍受 Q-001/Q-002/Q-003 及 UI/UX 边界限制，不新增 CASE passed。 |
| MAT-005 | 进行中 | - | A01/A04/A05（仅本地 Store 子集复测） | TEST-1 暴露的两项 Store 缺陷已由 DEV-2 修复；`src/store/__tests__/material-image-generation.spec.ts` 定向 7/7、TEST-2 前端全量 45 suites / 340 tests 通过。测试只证明 mock adapter、来源校验、在途防重、取消与失败拒绝；CASE-MAT-005-002/003/007/008 真实 provider/文件/跨模块/留存未执行，页面仍未接线；不计 CASE passed。 |
| DSC-001 | 进行中 | - | A01～A07 | DEV-2/3 新增显式 published snapshot 列表 API、字段检索、latest 稳定顺序和分页；必须显式传 `category=latest`，缺 category/推荐/同城 fail closed。controller/service unit 在当前 backend 17 suites / 199 tests 中通过。TEST-13 已在 disposable schema 部署 discovery migration 且无 drift，但未 seed published story 或执行 DSC API e2e；前端未接线，Q-007 发布来源/推荐/同城/撤回未定；无 CASE passed。 |
| DSC-002 | 进行中 | - | A01、A04 | DEV-2/3 新增按 ID 读取 published snapshot 的详情 API；未发布/撤回统一 not_found；controller/service unit 在当前 backend 17 suites / 199 tests 中通过。TEST-13 migration 已在 disposable schema 部署，但无公开 fixture、页面未接线，Q-007/Q-013/Q-001 权限与缓存矩阵未验证；无 CASE passed。 |
| DSC-003 | 进行中 | - | A01～A05 | DEV-2/3 新增基于设备身份的 target-state 幂等点赞 API与唯一关系；只有 `likesEnabled=true` 的显式 published snapshot 可写，默认关闭。disabled-like `interaction_not_available` 的 HTTP 409/controller 与 client repository 映射、discovery 身份优先已开发。TEST-13 migration 已在 disposable schema 部署；当前 unit tests 通过，但未执行 DB 并发/页面同步 CASE；Q-007/Q-001 互动资格/留存未定，无 CASE passed。 |
| PET-001 | 进行中 | - | A01、A02、A03、A05（开发中，未测） | DEV-1 已建 `ChatReplyProvider`/显式 mock 和 request/attempt 状态；DEV-3 新增设备隔离 conversation/turn/message Prisma/API、幂等用户 turn、固定失败码、显式 retry attempt、稳定历史顺序及 client repository。chat/image/report mock 仅在 `hybrid-dev` 开发运行时启用；production 在创建/重试/回复写入前 fail closed，非测试运行环境拒绝客户端自报 `source: provider`。TEST-13 migration 在 disposable schema 部署成功；当前 unit tests 通过，但会话/身份/重开 API e2e 未执行，页面/Store send-retry 未接 repository。本任务无 CASE 新增 passed；Q-001/Q-002/Q-003 仍待决策。 |
| GRW-003 | 进行中 | - | A01/A04/A05/A06/A07（provider 与 read model 边界，未验收） | DEV-3 新增 anchor provider/service 与 `DiaryAnchorExtraction/DiaryAnchor` versioned read model/API/client repository，覆盖 owner/version/source-block、request/attempt 幂等和显式 tagId 查询；MySQL 查询使用 JSON_TABLE 校验来源块并执行 count/page。Mock 不写持久表；无可信 server provider 时所有非测试运行环境写入 fail closed。TEST-13 migration 在 disposable schema 部署成功且无 drift；尚未运行 anchor read/write MySQL CASE 或页面/save-event 接线，Q-016/Q-002/Q-003/Q-001 未关闭；无 CASE passed。 |
| PCD-001 | 进行中 | - | A02（部分输入/卡片预览） | A02 已有页面证据证明非 mock photo URI/地点日期和 `stampKyoto` 装饰进入卡片预览；A01 的“切换后旧生成结果失效”、A03 的可读取生成图片、A04/A05 的并发/失败保护均未有真实输出证据。当前 `make()` 仅将 `generated` 设为 true，不产生图片资产。A03/A04/A05 需要真实 renderer，并需授权调整现有成功反馈时序/失败反馈；Q-001/Q-015 影响资产留存/错误语义，Q-003 影响缺元数据处理，Q-009 影响素材往返，Q-014 只约束正式输出规格。 |
| INT-001（除上表） | 未开始 | - | - | 依赖基础层能力 |

CRE-005 provider 单测本轮还补齐了请求配置契约：默认 JSON 格式、关闭兼容服务不支持的 `response_format`、生成与 rewrite 温度分别透传、无效温度回退，以及未知格式在网络调用前拒绝。该工程配置证据不改变 A01/A06 状态，也不替代真实 provider 联调或 Q-002 质量与重试规则。

CRE-005 的照片归属回归现覆盖普通文本/引言块、封面、海报、人物照片/头像及 rewrite 引用：显式引用本轮 `selectedPhotoIds` 之外的照片会被 provider 单测拒绝为不可重试 `provider_failed`；人物候选即使因缺少合法 `id` / `name` 被忽略，其越界照片引用也会在过滤前被拒绝。`blocks` 中的非对象元素、空正文/图片说明、空照片引用或空人物标识不会进入不符合契约的成功快照；provider 结果缺失标题、摘要、地点、日期、同行者、封面或海报照片等必需字段也不再靠 mock/default 值补成成功。上述结构失败场景均有生成任务 e2e 失败快照证据。provider 单测 43 项、backend build 和六条定向 e2e 均通过；这些确定性边界证据不改变 A01/A06 的进行中状态，也不代表真实 provider 质量验收完成。

SHR-003 本轮为匿名 PNG 增加无效 `faceRects` 阻断和图像边缘裁切像素测试；SHR-005 已将 PDF 改为 CJK Type0 字体映射并通过 macOS Quick Look 确认中文可读，A02 仍因 iOS/跨阅读器、系统导出和 Q-014 最终规格未验证而保持 partial。

## 说明

- `已通过` 表示当前已有代码与可执行证据。
- `进行中` 表示已开始推进，但尚未形成完整闭环。
- 进入真实服务、真实设备、真实文件与真实平台交付后，矩阵需继续按 `通过 / 失败 / 阻塞 / 待决策` 细化到 CASE。

2026-10-15 补充：`BAS-004-A03` / `CRE-002-A05` 已增加确定性撤权错误映射证据：照片逐张 `getAssetInfoAsync` 期间抛出 `E_NO_PERMISSIONS` 会被照片服务归入 `invalidIds`，现有页面用例证明失效照片不足三张时不确认、不导航。该证据只覆盖服务错误映射与页面门禁，不改变 BAS-004-A03、CRE-002-A05 的 partial 状态，也不替代 iOS 实机撤权/资源删除验证。

2026-10-15 补充：`BAS-004-A03` / `SHR-005-A05` 已增加导出文件 writer 拒绝证据：文件服务返回 `delivery_failed`，编排器不触发确认回调且不写导出历史。该证据只覆盖确定性文件写异常，真实 iOS 文件权限、系统保存/打开与正式渠道矩阵仍未完成，相关验收保持 partial。

2026-10-15 补充：`DIA-005-A07` 的来源版本校验已改为数据库事务内的原子条件更新；同一旧版本的不同并发编辑仅一个能成功，同一幂等命令并发重试返回相同结果，编辑作品版本按来源版本递增。真实数据库 e2e 已通过并发冲突、幂等重试和版本递增断言。DIA-005 剩余未闭环仍仅为 Q-001/Q-008 关联的 `CASE-DIA-005-010`。

2026-10-15 补充：`DIA-005-A05` 现验证旧保存命令在日记后续编辑后重放仍返回命令记录中的原始 `draftId/savedVersion`，与保存结果查询一致；作品当前版本不回退。该修复补强幂等证据，不改变 Q-001/Q-008 的待决策范围。

2026-10-15 补充：DIA-005 store 兼容 action `saveDraft` 已统一委托异步 `submitDraft`，服务端确认前不提交本地作品；BAS-004 旧 Node runner 已适配异步 CASE、逐例重置并支持反向顺序。相关 domain、正常顺序与反向 runner 回归已通过，DIA-005 的待决策 CASE 状态不变。

2026-10-15 补充复验：`npm run test:domain` 当前 92 项通过；legacy domain runner 正常与反向顺序各 15/15 通过。BAS-004-A02 的原始选择夹具已对齐当前规则：草稿初始空选，测试显式添加照片。

2026-10-15 补充复验：`npm run typecheck` 与完整 `npm test`（35 suites / 283 项）通过；DIA-005 兼容 `saveDraft` 已等待统一提交边界的仓库确认，未改变任何正式页面交互。

2026-10-15 补充：BAS-003-A03 快照恢复失败不短路后续回忆同步，恢复前的新草稿不会覆盖旧快照；真实生产身份/样例数据隔离仍未具备可验证模式，因此 A03 保持 in progress。

2026-10-15 补充：BAS-002-A03 后端不再把缺失或空白 `x-device-id` 归并到共享 `device-anonymous`；身份单测 4/4、完整 backend e2e 37/37 验证省略或发送空白身份头时均拒绝读取旧共享 ID 草稿，backend build 与 typecheck 通过。此项补强设备归属入口，不改变 A03 的 partial 状态；公开投影与正式身份边界仍待补齐。

2026-10-15 补充：`SHR-001/SHR-002` 的 `/api/sharing/project` 现从后端拒绝缺少、空或仅空白的非私密选段及非法隐私值；正文快照持久化后，e2e 也验证 `publicBlockIds` 必须指向该作品已保存的文本/引用块，未知 ID 与图片块 ID 被拒绝。跨设备改范围仍返回 `permission_denied`，e2e 验证拒绝不覆盖已保存范围。实际公开内容读取仍未接入后端。

2026-10-15 补充 DIA-005/BAS-003：Save API 与 Prisma 已持久化 `contentSnapshot`，保存后单篇详情与回忆列表均返回真实正文/引用/图片块；编辑事务更新同一 `diaryId` 的快照。缺失快照、重复 block ID、越界照片引用等会以 `invalid_input` 拒绝；metadata-only 历史回忆不再由 store 合成摘要正文块，详情仓库拒绝缺失/畸形快照。全量 Jest 35/288、domain 94、backend unit 4 suites / 50、backend e2e 38、CRE-002 定向 14、typecheck/build 通过。DIA-005 的 Q-001/Q-008 与 BAS-003 资产/迁移边界仍按原状态保留。
2026-10-15 补充 BAS-003-A04：`CASE-BAS-003-004` 已由真实 Prisma/MySQL 事务故障注入验证失败回滚与可重试性：`Diary.create` 后在同一事务回调中使 `SaveCommand.create` 抛错，回忆列表无半篇作品、幂等结果不存在且草稿保留；移除测试代理后相同键重试只生成一篇完整作品。完整 backend e2e 39/39、backend build 通过，CASE 标记 passed；BAS-003 整体仍进行中。
2026-10-15 补充 BAS-003-A05：本地草稿快照遇到尚不支持的整数版本时，不尝试按当前格式解析、不删除快照，并禁用本次运行的本地 snapshot 写入；版本 2 CASE 验证原始未知字段在后续草稿创建期间保持不变。完整 Jest 35/289、domain 95、typecheck 通过。legacy 正文回填、现有数据库 baseline adoption 与已保存对象的数据迁移仍未完成，A05 保持进行中。
2026-10-15 补充 BAS-003-A05 Prisma schema migration：新增四表基线和单独的 `Diary.contentSnapshot` 可空列迁移；`npm --prefix backend run test:migrations` 在隔离 MySQL schema 分别验证空库完整部署、旧 schema 预置日记后升级时元数据保留，并用 Prisma schema diff 检查无 drift。legacy 正文内容不可由摘要伪造，回填策略、现有 `db:push` 数据库 baseline adoption 和 DB 损坏恢复仍未闭环，A05 继续进行中。
2026-10-15 补充 BAS-003-A05 baseline tooling：`migrate:baseline` 要求显式确认，并先做 datamodel drift 检查；migration history 不存在或是已知连续前缀才会补记，未知/失败记录会拒绝。临时库验证 drift 拒绝不创建 history，schema 匹配时 baseline 后状态 up-to-date 且数据不变。该工具未应用到当前 `ai_diary`；legacy 正文回填与数据库损坏恢复仍未完成，A05 保持进行中。
2026-10-15 补充 BAS-003-A05 baseline adoption：新增 `migrate:baseline`，必须显式传入 `--confirm-current-schema-is-final`；工具先校验 schema diff 无漂移，再仅补记已知连续 migration history。验证器确认旧 schema 存在 drift 时拒绝且不创建 `_prisma_migrations`；current schema baseline 后 `migrate status` 为 up-to-date 且既有日记不变。该路径只在临时 MySQL schema 测试，未应用到现有 `ai_diary`；legacy 正文回填、数据库损坏恢复未完成，A05 仍为进行中。
2026-10-15 复验（本地库 baseline 执行前）：`npm --prefix backend run test:migrations` 三路径均通过；CRE-002 相册/照片服务 14 项、backend e2e 39 项、backend unit 50 项、backend build 通过。当次复验尚未对开发库执行 baseline，随后已完成本地 `ai_diary` baseline；A05 仍因 legacy 内容回填及损坏数据恢复保持进行中。
2026-10-15 补充 baseline guard：临时 schema 回归覆盖无确认参数拒绝、drift schema 拒绝且不创建 `_prisma_migrations`、已知连续前缀续记和现有记录不变；baseline 执行仅登记 migration metadata。工具没有对当前 `ai_diary` 生效，需经备份/核对后显式调用。
2026-10-15 当前开发库 baseline 完成：`ai_diary` 经只读 schema diff 确认为无 drift、migration history 不存在后，以显式确认登记两条 migration。执行前后 Diary 行数均为 2，复查状态为 up-to-date 且 schema 无 drift；其他数据库未操作。legacy 正文回填与损坏记录恢复仍是 BAS-003 未完成项。

2026-10-15 补充：`CASE-DIA-005-008` 现在也覆盖 HTTP repository 将保存 timeout 返回为 retryable `RemoteResult` 的路径：store 会查询原 `idempotencyKey` 并在已提交时追认结果。该补强不改变 DIA-005 的通过项数量或 Q-001/Q-008 待决策 CASE。

2026-10-15 补充 BAS-002-A02：`tools/verify-client-bundle-secrets.js` 及 3 项 Node 单测可复跑客户端静态包泄漏检查；一次性 server-key canary 的 iOS export 扫描 102 个文件无匹配，`backend/.env` 当前缺席。此证据不构成真实 provider 调用、请求/响应/日志全链路验收，A02 仍不计为 passed。

2026-10-16 DEV-3 BAS-002 身份优先级增量：`/photos/capabilities` 与 `/health` 已要求有效 `x-device-id`，chat/anchor/sharing/discovery controller 的缺身份与畸形输入回归，以及 health e2e 已编写、尚未运行。该增量不构成通过证据，BAS-002 与 CASE-BAS-002-003 状态不变；矩阵 passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 PET-001 response contract：新增消息/turn 关联、顺序与终态来源一致性校验，并在 repository 发送前拒绝未知 failure code；相关 regression 未运行，不能作为 CASE 通过证据。PET-001 CASE 结论不变，矩阵 passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 GRW-003 并发取消边界：共享提取 operation 改为按 waiter 独立取消，新增 regression 尚未运行。此为开发增量，不计 CASE 通过；CASE-GRW-003 状态不变，矩阵 passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 GRW-004 幂等重放保护：新增旧 command 被后续 correction version supersede 时返回 `version_conflict` 的服务逻辑与 regression；typecheck/backend build/diff check 通过，Jest 未运行，不构成 CASE 通过。GRW-004 CASE 状态不变，矩阵 passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 DSC-003 target-state 并发边界：服务新增每故事行锁和锁顺序/不可见目标 regression；typecheck/backend build/diff check 通过，测试未运行、未接页面，不作为 CASE 通过证据。Q-007/Q-001 未变，DSC-003 CASE 状态与矩阵 passed 96/225（42.7%）不变。

2026-10-16 DEV-3 GRW-006 stale/cancellation boundary：旧来源 provider failure 归为 `stale`；provider 忽略 AbortSignal 时本地取消仍可结束 action。typecheck/diff check 通过，新增 Store regression 未运行，不构成 CASE 通过。GRW-006 CASE 状态不变，矩阵 passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 SHR-003 anonymous asset boundary：默认可读性校验现只接受可实际读取的本地文件，并校验 PNG signature/IHDR/尺寸；网络、`data:`、媒体库和损坏文件 fail closed。新增 regression 未运行；SHR-003 A02/A05 仍 partial，矩阵通过数保持 96/225（42.7%）。

2026-10-16 DEV-3 DIA-006 date query boundary：页面内部的 `YYYY.MM` 与日号现序列化为契约格式 `YYYY-MM` / `YYYY-MM-DD`；日期校验及 UI wire-format regression 尚未运行，不增加 DIA-006 或总体通过项，Q-004 规则不变。

2026-10-16 DEV-3 GRW-006 report contract：新增 `insight-report-v1` 请求/结果版本、三维 ID/来源校验和 Store 接入；typecheck/diff check 通过，新增 contract/Store regression 未运行。正式页面、真实 provider、质量与留存仍延期，不增加 GRW-006 或总体 passed。

2026-10-16 DEV-3 BAS-003：草稿快照 localStorage/文件系统适配器现将空/坏 JSON 和读取异常交给 Store 的 fail-closed hydration，新增 adapter regression 尚未运行；不改变 CASE-BAS-003-005 的 partial 状态，矩阵通过数仍为 96/225（42.7%）。

2026-10-16 DEV-3 BAS-003 正文快照读取边界：contract/repository/Store 现拒绝空/仅图片正文与不属于日记照片集合的引用，并隔离单篇损坏回忆；新增 regression 未运行，不改变 CASE-BAS-003-005 partial 或总 passed 数（96/225，42.7%）。

2026-10-16 DEV-3 BAS-003 数据库 scalar/array 正文快照现由后端标为 `contentSnapshotStatus: invalid`，区分损坏值与 legacy NULL；隔离 e2e 与 Store regression 未运行，不改变 CASE-BAS-003-005 partial 或通过数（96/225，42.7%）。

2026-10-16 DEV-3 BAS-003-A06：Store 回忆 hydration/search 现恢复后端 `publicBlockIds`，并遵循 private 状态清除旧选段；新投影回归未运行，不更新 CASE-BAS-003-006 或 SHR passed 项，总 passed 仍 96/225（42.7%）。

2026-10-16 DEV-3 BAS-003-A03：release 默认不再注入 mock diaries/photos，空目录 currentDiaryId 为空且可新建空白草稿；runtime regression 未运行。统计基线、锚点数和资料/VIP 原型仍受 Q 决策限制，A03 保持 partial，总 passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 BAS-001 generation request：客户端和后端新增 `draftVersion` 正安全整数/非空 ID 校验，后端确保设备身份错误优先；新增 contract/repository/controller regression 未运行，不新增 CASE passed，总通过仍 96/225（42.7%）。

2026-10-16 DEV-3 BAS-001 generation request validator：正安全整数版本校验、客户端发包前拒绝和后端身份优先 body 校验已补，contract/repository/controller regression 未运行；不新增 CASE passed，矩阵仍为 96/225（42.7%）。

2026-10-16 DEV-3 BAS-001/CRE-005 generation 幂等载荷保护：同设备幂等键绑定 `draftId + draftVersion`，并发 `P2002` 后重读并校验赢家任务；不匹配返回 `version_conflict`。新增回归未运行，本条不改变任何 CASE 结果或通过数，当前 passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 DIA-005/BAS-002 保存命令身份边界：幂等查询前增加保存请求 runtime 校验；同设备 key 绑定 `draftId + sourceDiaryId + sourceDiaryVersion`，跨草稿/来源版本重用返回 `version_conflict`。新增 MySQL e2e 未运行，不改变既有 CASE 状态或通过数，passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 CRE-003/BAS-002 草稿请求边界：服务层新增 body shape/privacy/version 校验及无身份优先 e2e。新增测试未运行，不改变 CASE 结果或通过数，passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 SHR-001/BAS-002 sharing body guard：新增身份优先后再做 controller/Store runtime 校验；畸形请求回归尚未运行，不改变 CASE 结果或通过数，passed 仍为 96/225（42.7%）。

2026-10-16 DEV-3 DIA-002 rewrite body guard：controller/Store 增加未知 body runtime 校验及身份优先；新增 controller regression 未运行，不改变既有 CASE 结果或 passed 数，仍为 96/225（42.7%）。

2026-10-16 DEV-3 DIA-006 query encoding guard：分页参数限十进制数字文本，重复参数与非字符串关键词 fail closed；既有 e2e 日期 fixture 改为 contract wire format，原断言保留。新增 regression 未运行，CASE/passed 不变，仍为 96/225（42.7%）。

2026-10-16 DEV-3 BAS-004 e2e setup guard：Jest e2e config 现在要求 `E2E_DATABASE_URL` 与实际 `DATABASE_URL` 为同一验证过的本机专用 schema。URL helper 定向单测 4/4 通过，但未启动 e2e 验证 setup guard 本身；不增加 CASE passed，矩阵仍为 96/225（42.7%）。

2026-10-16 DEV-3 DSC-001 query guard：controller/service 新增十进制分页与 keyword 类型校验及重复参数回归，尚未运行；Q-007 与现有 CASE 状态不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 PET-001 pagination guard：会话列表 controller/service 新增严格分页 wire/runtime 校验及待测回归；相关 CASE 尚未执行，既有 CASE 结论不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 PET-002 范围复核：Q-005/Q-016 仍阻塞统计口径/默认锚点集合，CASE-PET-002-001～006 未执行；本轮仅登记并跳过无独立可开发项，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 DSC-002 response ID binding：新增详情响应与请求 story ID 一致性校验及待测回归；CASE-DSC-002-001～007 未执行，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 DSC-003 like binding：新增点赞 request/response ID 绑定与 runtime guard 回归，尚未运行；CASE-DSC-003-001～007 状态不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 GRW-001 复核：真实统计 CASE 因 Q-005/Q-012/Q-001 与统计/资料读模型缺口保持未执行；无新代码验收证据，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 GRW-002 复核：stable tagId routing 已有源码但新增组件测试未运行；动态主题/成长提示及未知默认组仍待 Q-016/Q-006。CASE 状态不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 GRW-003 anchor query guard：新增分页 wire/runtime 及响应绑定回归尚未执行，CASE-GRW-003-001～008 不变；没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 GRW-004 correction binding：新增严格版本 query 和读写响应目标校验，相关 regression 未运行；CASE-GRW-004-001～009 不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 GRW-005/006 复核：成长与报告的核心业务规则/质量/留存门控仍开放；mock contract 与状态机不构成真实通过证据，CASE 均未执行，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 INT-001 复核：跨栈真实交付仍有设备/provider/文件/migration/Q 前置，CASE-INT-001-001～008 未执行，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 BAS-002 route audit：身份路由静态枚举未发现新缺口，不构成运行验收证据；CASE/已通过项不变，仍为 96/225（42.7%）。

2026-10-16 DEV-3 BAS-003/DIA-001：快照清理失败传播与详情请求 ID 绑定已开发，新增 adapter/repository regression 未运行；相关 CASE 状态不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 CRE-005 response binding：创建/轮询/取消响应与请求键及活动轮次校验已开发，新增 repository/Store regression 未运行；CASE-005 状态不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 CRE-006 person ID uniqueness：provider 与保存快照边界拒绝同一结果/作品中的重复 `person.id`；新增 service/contract/隔离 e2e regression 未运行，CASE-CRE-006 与 CASE-BAS-003 状态不变，无新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 DIA-001 route cache binding：详情缓存按请求 `diaryId` 隔离，目标切换使旧读取失效；新增页面回归未运行，CASE-DIA-001-001/006/007 状态不变，没有新增 passed，仍为 96/225（42.7%）。

2026-10-16 DEV-3 DIA-002 rewrite context/response binding：新增 Store 输入上下文指纹、request response 目标关联与正安全整数版本校验回归尚未运行；CASE-DIA-002-001～009 状态不变，没有新增 passed，验收仍为 96/225（42.7%）。返工次数上限与复杂度排序是执行策略，不改变矩阵状态或 CASE 标准。

2026-10-16 TEST-5 / TEST-6：本地集中测试结果已记录到同名 task/CASE 与 `development-progress.md`。TEST-5 中 DSC-002 空 story ID controller regression 失败，DEV-4 修复后 TEST-6 backend unit 17 suites / 198 tests 全通过；前端全量 55 suites / 443 tests 中 5 suites / 14 tests 失败，归属 GRW-003、MAT-001、DIA-001、CRE-005、MAT-002。失败是本轮本地自动化证据，不将任何任务 CASE 标记 passed；CASE 原状态与有效分母 225 保持，passed 仍为 96（42.7%）。e2e、真实设备、文件出口及 AI/provider CASE 未执行。

2026-10-16 TEST-7：前端集中复测 53/55 suites、439/443 tests 通过；两处未通过为 MAT-002 目标日记应用素材时未更新 draft/路由，以及 GRW-003 provider cancellation signal 断言时序。此前 DEV-5 修复的 MAT-001、DIA-001、CRE-005 本地子集通过，但均不扩大业务 CASE 通过范围。`npm run typecheck` 有一条 retry test mock TS2322，`git diff --check` 通过；DEV-6 修复和复测待执行。未新增 CASE passed，矩阵仍 96/225（42.7%）；backend TEST-7 未重复运行，TEST-6 通过证据未受后续 backend 代码修改影响。

2026-10-16 TEST-8：前端 55 suites / 443 tests 与 typecheck 通过；正常及反向 legacy runner 均因临时转译目录漏含 `core-diary-contract` 而在场景开始前失败。该次未执行领域场景，不新增 passed。

2026-10-16 TEST-9：DEV-7 加入 core contract 后正常/反向 runner 继续暴露 `ai-image-generation-contract` 缺失，仍未执行任何领域场景；CASE-BAS-004-002 保持未通过，修复计数进入 `1/2`。

2026-10-16 TEST-10：DEV-8 补入 core/AI image/insight contracts 与相关本地 provider，并将 MediaLibrary/backend HTTP adapters 置于隔离 no-op stub。当前 worktree normal/reverse E01～E15 均 15/15 通过，CASE-BAS-004-002 恢复通过（修复轮 `2/2` 已闭环）；TEST-8/9 runner 缺依赖历史已闭环。CASE-BAS-004-001 的 direct Jest setup guard 仍因缺少 `E2E_DATABASE_URL` 无当前隔离 DB 成功启动证据，继续为 partial；passed 为 95/225（42.2%）。未操作数据库或真实设备/provider。

2026-10-16 TEST-11：前端全量 55/55 suites、443/443 tests，后端 unit 17/17 suites、198/198 tests；typecheck、backend build、diff check 通过。未执行 e2e/migration，CASE-BAS-004-001 继续 partial；当时 passed 为 95/225（42.2%）。

2026-10-16 TEST-12 / DEV-11 / TEST-13：首个全新隔离 schema migration 暴露 discovery 与 anchor correction 索引名超长；后续 direct Jest e2e 初测又发现合法 JSON `null` 在 parser 层绕过 controller 身份优先校验，以及取消任务后 generation provider 仍在后台运行。DEV-11 同批缩短两个 MySQL index map、启用 primitive JSON runtime validation，并将 AbortSignal 传至生成 provider、等待后台任务收口。新隔离 schema 上 6/6 migration 成功、migrate status up-to-date、schema diff 无漂移；direct Jest setup guard 成功启动，e2e 46/46；backend unit 17/17 suites、199/199 tests；typecheck/build/diff check 通过。BAS-004-A01 从 partial 改为 passed，passed 重算为 96/225（42.7%）。首次失败与修复前结果保留；测试临时 schema 已删除。

2026-10-16 DEV-12 / TEST-14：为数据库已就绪但缺少 HTTP+MySQL 集成证据的自有模块，扩展 e2e reset 清理顺序并加入 discovery 查询/详情/点赞、chat turn 幂等失败重试/身份隔离、anchor extraction fixture/read-model/correction 读写/身份隔离三个集成 flow。首轮 anchor 读取出现 Prisma 参数化查询计数为 0 的缺陷，确认 correlated `EXISTS(JSON_TABLE)` 路径误过滤；改为 JSON_TABLE join、显式 collate 与 distinct anchor count/page 后复测通过。TEST-14 完整 e2e 49/49、backend unit 17 suites / 199 tests、typecheck/build/migrate status/schema diff/diff check 通过。相关 CASE 仅将对应后端集成子项记为 partial，页面/真实 provider/Q 场景仍未通过；全矩阵 passed 维持 96/225（42.7%）。临时 schema `ai_diary_test_dev12` 已删除，未操作开发库。
