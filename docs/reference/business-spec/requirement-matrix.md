# 需求追踪矩阵与开发、测试使用方式

本页提供 RTM 初稿。所有功能仍为待业务确认的规格；逐项实施任务和详细案例已写入 [delivery](../delivery/README.md)。任务尚未开始，案例尚未执行；旧 TC 编号保留为种子，不代表已生成测试代码或已经通过。`功能ID-AC*` 表示该功能章节中全部已定义 AC；用例种子应填写具体 AC ID，避免追踪关系含糊。

追踪链：**功能 ID → 验收 AC → 开发任务 / 测试用例 TC → 执行结果 → 缺陷与复测**。需求、验收和用例为多对多关系，一条通过的领域测试不能替代整个功能验收。

## 功能覆盖索引

| 功能 ID | 功能 | 规格与验收集 | 现有领域证据（部分覆盖） | 早期用例种子 | 实施任务 | 详细测试案例 |
| --- | --- | --- | --- | --- | --- | --- |
| CRE-001 | 相册授权 | [创作](modules/diary-creation.md)，CRE-001-AC* | E02：会话授权状态 | TC-CRE-001-001 | [T-CRE-001](../delivery/tasks/CRE-001.md) | [CRE-001](../delivery/test-cases/CRE-001.md) |
| CRE-002 | 照片选择 | [创作](modules/diary-creation.md)，CRE-002-AC* | E01：数量与去重 | TC-CRE-002-001 | [T-CRE-002](../delivery/tasks/CRE-002.md) | [CRE-002](../delivery/test-cases/CRE-002.md) |
| CRE-003 | 日记类型 | [创作](modules/diary-creation.md)，CRE-003-AC* | 待补 | TC-CRE-003-001 | [T-CRE-003](../delivery/tasks/CRE-003.md) | [CRE-003](../delivery/test-cases/CRE-003.md) |
| CRE-004 | 排版师 | [创作](modules/diary-creation.md)，CRE-004-AC* | E09/10：风格与失效规则 | TC-CRE-004-001 | [T-CRE-004](../delivery/tasks/CRE-004.md) | [CRE-004](../delivery/test-cases/CRE-004.md) |
| CRE-005 | 生成生命周期 | [创作](modules/diary-creation.md)，CRE-005-AC* | E03/04/10 | TC-CRE-005-001 | [T-CRE-005](../delivery/tasks/CRE-005.md) | [CRE-005](../delivery/test-cases/CRE-005.md) |
| CRE-006 | 人物命名 | [创作](modules/diary-creation.md)，CRE-006-AC* | E07：分组与空名；E13：姓名匿名 | TC-CRE-006-001 | [T-CRE-006](../delivery/tasks/CRE-006.md) | [CRE-006](../delivery/test-cases/CRE-006.md) |
| DIA-001 | 日记阅读 | [日记管理](modules/diary-management.md)，DIA-001-AC* | 待补界面 | TC-DIA-001-001 | [T-DIA-001](../delivery/tasks/DIA-001.md) | [DIA-001](../delivery/test-cases/DIA-001.md) |
| DIA-002 | 内容编辑与局部重写 | [日记管理](modules/diary-management.md)，DIA-002-AC* | E05/06：隔离/可编辑；重写待补 | TC-DIA-002-001 | [T-DIA-002](../delivery/tasks/DIA-002.md) | [DIA-002](../delivery/test-cases/DIA-002.md) |
| DIA-003 | 照片引用与更换 | [日记管理](modules/diary-management.md)，DIA-003-AC* | E01/07/08/12 | TC-DIA-003-001 | [T-DIA-003](../delivery/tasks/DIA-003.md) | [DIA-003](../delivery/test-cases/DIA-003.md) |
| DIA-004 | 更换排版师 | [日记管理](modules/diary-management.md)，DIA-004-AC* | E06/10：保留正文 | TC-DIA-004-001 | [T-DIA-004](../delivery/tasks/DIA-004.md) | [DIA-004](../delivery/test-cases/DIA-004.md) |
| DIA-005 | 草稿保存与放弃 | [日记管理](modules/diary-management.md)，DIA-005-AC* | E02/04/05/06 | TC-DIA-005-001 | [T-DIA-005](../delivery/tasks/DIA-005.md) | [DIA-005](../delivery/test-cases/DIA-005.md) |
| DIA-006 | 回忆检索 | [日记管理](modules/diary-management.md)，DIA-006-AC* | 日期/界面筛选待补 | TC-DIA-006-001 | [T-DIA-006](../delivery/tasks/DIA-006.md) | [DIA-006](../delivery/test-cases/DIA-006.md) |
| DIA-007 | 月度装订 | [日记管理](modules/diary-management.md)，DIA-007-AC* | E15：动态分组；文件待Q-011 | TC-DIA-007-001 | [T-DIA-007](../delivery/tasks/DIA-007.md) | [DIA-007](../delivery/test-cases/DIA-007.md) |
| SHR-001 | 公开范围 | [分享](modules/sharing-and-privacy.md)，SHR-001-AC* | E11：保存与空选段拦截 | TC-SHR-001-001 | [T-SHR-001](../delivery/tasks/SHR-001.md) | [SHR-001](../delivery/test-cases/SHR-001.md) |
| SHR-002 | 选段公开 | [分享](modules/sharing-and-privacy.md)，SHR-002-AC* | E11/12/14 | TC-SHR-002-001 | [T-SHR-002](../delivery/tasks/SHR-002.md) | [SHR-002](../delivery/test-cases/SHR-002.md) |
| SHR-003 | 匿名公开 | [分享](modules/sharing-and-privacy.md)，SHR-003-AC* | E13：文本和元数据；遮挡界面待补 | TC-SHR-003-001 | [T-SHR-003](../delivery/tasks/SHR-003.md) | [SHR-003](../delivery/test-cases/SHR-003.md) |
| SHR-004 | 海报与预览 | [分享](modules/sharing-and-privacy.md)，SHR-004-AC* | E12/13：内容投影；界面待补 | TC-SHR-004-001 | [T-SHR-004](../delivery/tasks/SHR-004.md) | [SHR-004](../delivery/test-cases/SHR-004.md) |
| SHR-005 | 分享、长图、PDF | [分享](modules/sharing-and-privacy.md)，SHR-005-AC* | E14：出口记录与权限；真实交付待Q-014 | TC-SHR-005-001 | [T-SHR-005](../delivery/tasks/SHR-005.md) | [SHR-005](../delivery/test-cases/SHR-005.md) |
| MAT-001 | 添加/搜索/预览照片 | [素材](modules/material-library.md)，MAT-001-AC* | 待补 | TC-MAT-001-001 | [T-MAT-001](../delivery/tasks/MAT-001.md) | [MAT-001](../delivery/test-cases/MAT-001.md) |
| MAT-002 | 照片用于日记 | [素材](modules/material-library.md)，MAT-002-AC* | E05/08：草稿及引用规则，联动待补 | TC-MAT-002-001 | [T-MAT-002](../delivery/tasks/MAT-002.md) | [MAT-002](../delivery/test-cases/MAT-002.md) |
| MAT-003 | 贴纸与印章 | [素材](modules/material-library.md)，MAT-003-AC* | 待补 | TC-MAT-003-001 | [T-MAT-003](../delivery/tasks/MAT-003.md) | [MAT-003](../delivery/test-cases/MAT-003.md) |
| MAT-004 | 灵感转入陪伴 | [素材](modules/material-library.md)，MAT-004-AC* | E15：聊天状态，联动待补 | TC-MAT-004-001 | [T-MAT-004](../delivery/tasks/MAT-004.md) | [MAT-004](../delivery/test-cases/MAT-004.md) |
| MAT-005 | AI 补图 | [素材](modules/material-library.md)，MAT-005-AC* | 待补；真实生成待Q-002 | TC-MAT-005-001 | [T-MAT-005](../delivery/tasks/MAT-005.md) | [MAT-005](../delivery/test-cases/MAT-005.md) |
| PCD-001 | 生成明信片 | [明信片](modules/postcards.md)，PCD-001-AC* | 待补 | TC-PCD-001-001 | [T-PCD-001](../delivery/tasks/PCD-001.md) | [PCD-001](../delivery/test-cases/PCD-001.md) |
| PCD-002 | 分享与保存明信片 | [明信片](modules/postcards.md)，PCD-002-AC* | 待补；真实交付待Q-014 | TC-PCD-002-001 | [T-PCD-002](../delivery/tasks/PCD-002.md) | [PCD-002](../delivery/test-cases/PCD-002.md) |
| PET-001 | 小橘聊天 | [陪伴](modules/companion.md)，PET-001-AC* | E15：非空提交；界面/AI待补 | TC-PET-001-001 | [T-PET-001](../delivery/tasks/PET-001.md) | [PET-001](../delivery/test-cases/PET-001.md) |
| PET-002 | 记忆概览与入口 | [陪伴](modules/companion.md)，PET-002-AC* | E15：统计来源；界面待补 | TC-PET-002-001 | [T-PET-002](../delivery/tasks/PET-002.md) | [PET-002](../delivery/test-cases/PET-002.md) |
| DSC-001 | 分类与搜索 | [发现](modules/discovery.md)，DSC-001-AC* | 待补 | TC-DSC-001-001 | [T-DSC-001](../delivery/tasks/DSC-001.md) | [DSC-001](../delivery/test-cases/DSC-001.md) |
| DSC-002 | 故事阅读 | [发现](modules/discovery.md)，DSC-002-AC* | 待补 | TC-DSC-002-001 | [T-DSC-002](../delivery/tasks/DSC-002.md) | [DSC-002](../delivery/test-cases/DSC-002.md) |
| DSC-003 | 点赞与取消 | [发现](modules/discovery.md)，DSC-003-AC* | E15：状态开关；跨页待补 | TC-DSC-003-001 | [T-DSC-003](../delivery/tasks/DSC-003.md) | [DSC-003](../delivery/test-cases/DSC-003.md) |
| GRW-001 | 个人空间与统计 | [成长](modules/growth-and-insights.md)，GRW-001-AC* | E15：示例统计函数；正式口径待Q-005 | TC-GRW-001-001 | [T-GRW-001](../delivery/tasks/GRW-001.md) | [GRW-001](../delivery/test-cases/GRW-001.md) |
| GRW-002 | 成长树与标签 | [成长](modules/growth-and-insights.md)，GRW-002-AC* | 待补；成长算法待Q-006 | TC-GRW-002-001 | [T-GRW-002](../delivery/tasks/GRW-002.md) | [GRW-002](../delivery/test-cases/GRW-002.md) |
| GRW-003 | 锚点阅读与关联 | [成长](modules/growth-and-insights.md)，GRW-003-AC* | 待补；提取规则待Q-016 | TC-GRW-003-001 | [T-GRW-003](../delivery/tasks/GRW-003.md) | [GRW-003](../delivery/test-cases/GRW-003.md) |
| GRW-004 | 锚点纠正 | [成长](modules/growth-and-insights.md)，GRW-004-AC* | E15：非空纠正；界面待补 | TC-GRW-004-001 | [T-GRW-004](../delivery/tasks/GRW-004.md) | [GRW-004](../delivery/test-cases/GRW-004.md) |
| GRW-005 | 花朵与里程碑 | [成长](modules/growth-and-insights.md)，GRW-005-AC* | E15：状态设置；获取算法待Q-006 | TC-GRW-005-001 | [T-GRW-005](../delivery/tasks/GRW-005.md) | [GRW-005](../delivery/test-cases/GRW-005.md) |
| GRW-006 | 洞察报告 | [成长](modules/growth-and-insights.md)，GRW-006-AC* | 待补；解锁/内容生成待确认 | TC-GRW-006-001 | [T-GRW-006](../delivery/tasks/GRW-006.md) | [GRW-006](../delivery/test-cases/GRW-006.md) |

## 现有测试证据

资产：[领域/状态测试](../../../tools/diary-domain.test.ts)，执行：[运行脚本](../../../tools/run-domain-tests.js)。E01～E15 是本次文档赋予现有场景的索引，代码中尚未使用这些 ID。

2026-10-12 执行 `node tools/run-domain-tests.js`：15/15 通过。脚本将图片作为数字样例并直接验证领域/状态逻辑，因此不能证明图像遮挡位置、导航连通性、系统权限、真实 AI、文件生成或第三方分享。

| 证据 ID | 现有场景主题 |
| --- | --- |
| E01 | 0/2/3/12 张照片、照片 ID 去重与无效过滤 |
| E02 | 授权状态在同一会话新建时保留，草稿 ID 独立 |
| E03 | 暂停与旧轮次回调失效，生成完成只生效一次 |
| E04 | 多次新建 ID 唯一，同一草稿保存幂等，不改样例记录 |
| E05 | 编辑后放弃不污染已保存作品 |
| E06 | 编辑保持日记 ID，内容可改，更换角色不覆盖正文 |
| E07 | 人物随照片分组，空名称保存时规范化 |
| E08 | 更换/清空段落引用同步关联图片块 |
| E09 | 不同排版师的生成样例文字有差异 |
| E10 | 编辑换角色保留内容，向导换角色可使生成失效 |
| E11 | 四种公开范围保存，空选段原子拒绝 |
| E12 | 公开投影过滤段落、图片、封面、摘要；无图引用不回退 |
| E13 | 已知姓名（含自身及特殊字符）替换、人物名单清空、公开照片ID正确；断言示例素材含人脸区域标记。别名、含姓名的图片说明及遮挡渲染待补覆盖 |
| E14 | 私密预览完整，平台分享与本地导出分别管理 |
| E15 | 动态历史分组、示例统计、聊天空值、点赞开关、锚点纠正和解锁状态 |

## 可扩展的用例种子

以下是待生成用例的具体起点，**未执行**；完整步骤、环境和证据应按 [模板](feature-template.md)补充。其他矩阵行也要扩展正常、边界和异常用例，一行一个 TC 入口不表示只需要一个用例。

| TC ID | 关联需求/验收 | 前置与测试数据 | 操作与预期 | 层级 |
| --- | --- | --- | --- | --- |
| TC-CRE-002-001 | CRE-002-AC01/02；BR-04 | 有效创作草稿，分别选择0/2/3张不同有效照片 | 观察生成按钮；0/2张不可用、3张可继续，生成入口同时拒绝不足下限 | 界面 + 领域 |
| TC-CRE-005-001 | CRE-005-AC04；BR-03 | 生成任务A运行；退出后开始B | 注入A的进度/完成回调；B与草稿内容不被A覆盖 | 领域 |
| TC-DIA-005-001 | DIA-005-AC02/03/05；BR-01/02 | 已保存日记，记录原正文与ID | 编辑并放弃；原文/ID/数量不变。另一轮保存沿用ID；重复保存不新增作品 | 领域 + 界面 |
| TC-SHR-001-001 | SHR-001-AC02、SHR-002-AC01；BR-07 | 已有公开设置，取消所有选段 | 完成时提示至少一段，原设置没有部分写入；选四种范围的有效设置后能重进读取 | 界面 + 领域 |
| TC-SHR-002-001 | SHR-002-AC02/03；BR-07 | 正文A含图A、正文B含图B、无图引用C | 仅公开B时海报/全文/摘要不出现A；仅公开C时不回退使用原图 | 领域 + 界面 |
| TC-SHR-003-001 | SHR-003-AC01～03；BR-08 | 姓名、曾用名、图片说明、人脸区域，多尺寸预览 | 匿名且选段后查看海报/全文；文字身份不暴露、已标记面容遮挡对齐、原作品不改 | 领域 + 视觉 |
| TC-SHR-005-001 | SHR-005-AC01；BR-09；AC02～04另待Q-014 | 私密与非私密两篇作品 | 原型核验私密平台拦截及预览/记录分离；Q-014确认后另扩展真实文件可打开、内容一致与渠道交付用例 | 领域 + 界面；真实集成待补 |
| TC-MAT-002-001 | MAT-002-AC01～03；BR-05 | 有首段正文的日记及素材照片 | 用于日记后编辑草稿有对应引用；放弃不改原文；保存后生效；再次应用不重复 | 界面流程 |
| TC-DSC-003-001 | DSC-003-AC01～04；BR-11 | 一个未点赞故事 | 列表点赞→详情核对→取消→返回，状态与数量同步；其他故事不变 | 界面流程 |
| TC-GRW-004-001 | GRW-004-AC02～04；BR-10/11 | 有锚点与原日记，记录原文 | 空白不能保存；保存纠正只改目标理解；取消不改；原日记保持 | 界面 + 领域 |
| TC-GRW-006-001 | GRW-006-AC01～03；BR-12 | 锁定和显式解锁两个测试状态 | 锁定直接打开报告不见正文；显式解锁才展示三个洞察维度。自动获取花朵不是本用例前置 | 界面 |

日期区间检索、相册有限授权、AI超时/重试、成长自动解锁、真实导出等用例先关联对应 Q。问题关闭后提供确定预期，再纳入正式用例；不要预期系统必须保留目前的矛盾行为。

## 推进开发与测试

1. **确认版本范围**：在模块中确认需要保留的能力及关联 Q，补正式优先级。展示意图转为可开发功能时补齐规则和 AC。
2. **拆开发任务**：按功能 ID 和共同依赖拆分；草稿/生成状态、照片引用、公开内容范围是跨模块依赖。任务应包含需要的数据/API契约、异常与验收 ID，而不仅是页面名称。
3. **生成并评审用例**：针对已确认 AC 生成正常、边界、取消、重复、状态一致性与隐私用例。真实AI按质量标准评测，固定样例模式按已知数据验收。
4. **执行并追踪**：记录版本、环境、用例结果、缺陷和证据。缺陷关联需求/AC；修复后复测受影响规则和用户流程。
5. **维护变更影响**：业务规则变化后，同步规格、任务、用例和历史执行状态，不能沿用旧版本的“通过”结论。

后续每条 TC 的执行台账使用：`TC ID | AC ID | 开发任务 | 版本/环境 | 结果 | 缺陷ID | 证据 | 复测`。逐项任务、案例和 AC 覆盖见 [实施索引](../delivery/README.md) 与 [覆盖矩阵](../delivery/coverage.md)。后端方案、正式服务指标与尚未关闭的业务规则在 BAS-001 按相关范围确定；本索引不代表它们已确认。
