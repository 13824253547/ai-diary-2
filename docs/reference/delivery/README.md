# 真实业务实施任务与测试案例

版本：v0.2 · 2026-10-13（交付目录初始登记）。本段实施状态仅代表初始登记时的 `BAS-001` / `BAS-004` 进度，不代表当前 worktree；实时验收状态与执行证据以 [自动推进验收矩阵](reports/autonomous-acceptance-matrix.md) 和 [当前执行快照](reports/current-execution-snapshot.md) 为准。

现有 [FSD](../business-spec/README.md) 足够作为功能盘点和业务基线初稿；真实落地还需要逐项任务、可复现案例，以及尚未确定的业务决策和接口契约。本目录补齐任务与案例，不擅自关闭业务问题。

## 目录

```text
delivery/
├── README.md                # 索引和实施顺序
├── execution-context.md     # 共同背景、测试环境、夹具、完成标准
├── decision-register.md     # 影响实施的业务决策
├── coverage.md              # 原始 AC → 任务验收 → CASE
├── tasks/
│   ├── BAS-001.md           # 一项任务一份文件
│   ├── CRE-001.md
│   └── …
└── test-cases/
    ├── BAS-001.md           # 与任务同名、结构一致
    ├── CRE-001.md
    └── …
```

每份任务只包含任务内容、验收条件、依赖、相关待定规则和必要引用；案例文件包含输入、前置、操作、可判断预期及验收 ID。共享项目说明集中在 [execution-context](execution-context.md)。

## 使用方式

1. 选一份任务，读其引用的 FSD/BR/代码与同名案例；完整性核对见 [coverage](coverage.md)。
2. 先完成它依赖的能力及相关业务决策。未决项只阻塞指定部分；不能自行将演示数字、原型缺口或猜测写成最终规则。
3. 实现任务，按 CASE 生成测试代码；区分领域/组件、契约集成、真实设备/服务和人工评测。
4. 执行并记录结果/证据，失败修复后复测；同步任务状态。案例编写完成不等于测试执行通过。

可直接交给实现者的指令：

> 实现 `docs/reference/delivery/tasks/任务ID.md`。先读共同约定、同名案例及任务中列出的引用。逐条实现验收并按 CASE 生成、执行测试；遇到未决规则，仅报告并停留在受影响部分，继续其他明确工作。结果列出完成验收、测试证据、未完成/阻塞项，不以 mock 返回或提示成功代替真实交付。

## 建议实施顺序

| 阶段 | 工作 |
| --- | --- |
| 基础 | BAS-001 按即将实施的模块补决策/契约；BAS-004 建测试环境；BAS-002/003 建真实服务与留存能力 |
| 核心日记 | CRE、DIA-001～005、NAV-001，串通照片→生成→编辑→保存；再完成回忆检索与月度合集 |
| 隐私与衍生作品 | SHR、MAT、PCD；真实导出依赖内容投影和照片资产能力 |
| 陪伴与社区 | PET、DSC；数据身份、留存和发布规则应先明确 |
| 成长与洞察 | GRW；以保存日记/锚点为来源，按确认规则累计成长和生成报告 |
| 联调 | INT-001 按 J-01～J-06 收集真实端到端证据 |

这是依赖建议，不是排期或产品优先级；具体任务的依赖为准。Q-017 风险自动检测等未定范围列在 [决策登记](decision-register.md)，当前不伪造成已定义开发任务。

## 任务与案例索引

共 36 个业务功能任务和 6 个基础/导航/联调任务；任务和案例各 42 份文件，逐项同名。225 条任务验收对应 310 条 CASE；初始登记时 65 条明确待决策，其余 245 条未执行。该分布是 2026-10-13 的历史快照，不是当前执行统计；逐条映射见 [coverage](coverage.md)，当前状态见上方验收矩阵与快照。

| ID | 任务 | 对应案例 |
| --- | --- | --- |
| T-BAS-001 | [实施范围、业务决策与接口契约](tasks/BAS-001.md) | [BAS-001](test-cases/BAS-001.md) |
| T-BAS-002 | [真实服务接入与数据访问边界](tasks/BAS-002.md) | [BAS-002](test-cases/BAS-002.md) |
| T-BAS-003 | [业务数据与照片资产持久化](tasks/BAS-003.md) | [BAS-003](test-cases/BAS-003.md) |
| T-BAS-004 | [测试运行环境与回归资产](tasks/BAS-004.md) | [BAS-004](test-cases/BAS-004.md) |
| T-NAV-001 | [业务入口、路由参数与退出一致性](tasks/NAV-001.md) | [NAV-001](test-cases/NAV-001.md) |
| T-CRE-001 | [真实相册权限](tasks/CRE-001.md) | [CRE-001](test-cases/CRE-001.md) |
| T-CRE-002 | [照片选择](tasks/CRE-002.md) | [CRE-002](test-cases/CRE-002.md) |
| T-CRE-003 | [日记类型](tasks/CRE-003.md) | [CRE-003](test-cases/CRE-003.md) |
| T-CRE-004 | [排版师选择](tasks/CRE-004.md) | [CRE-004](test-cases/CRE-004.md) |
| T-CRE-005 | [真实日记生成](tasks/CRE-005.md) | [CRE-005](test-cases/CRE-005.md) |
| T-CRE-006 | [人物命名](tasks/CRE-006.md) | [CRE-006](test-cases/CRE-006.md) |
| T-DIA-001 | [日记阅读](tasks/DIA-001.md) | [DIA-001](test-cases/DIA-001.md) |
| T-DIA-002 | [文字编辑与局部重写](tasks/DIA-002.md) | [DIA-002](test-cases/DIA-002.md) |
| T-DIA-003 | [照片引用与更换](tasks/DIA-003.md) | [DIA-003](test-cases/DIA-003.md) |
| T-DIA-004 | [更换排版师](tasks/DIA-004.md) | [DIA-004](test-cases/DIA-004.md) |
| T-DIA-005 | [草稿保存与放弃](tasks/DIA-005.md) | [DIA-005](test-cases/DIA-005.md) |
| T-DIA-006 | [回忆检索](tasks/DIA-006.md) | [DIA-006](test-cases/DIA-006.md) |
| T-DIA-007 | [月度装订](tasks/DIA-007.md) | [DIA-007](test-cases/DIA-007.md) |
| T-SHR-001 | [公开范围](tasks/SHR-001.md) | [SHR-001](test-cases/SHR-001.md) |
| T-SHR-002 | [选段公开](tasks/SHR-002.md) | [SHR-002](test-cases/SHR-002.md) |
| T-SHR-003 | [匿名公开](tasks/SHR-003.md) | [SHR-003](test-cases/SHR-003.md) |
| T-SHR-004 | [分享海报与预览](tasks/SHR-004.md) | [SHR-004](test-cases/SHR-004.md) |
| T-SHR-005 | [平台分享、长图与PDF](tasks/SHR-005.md) | [SHR-005](test-cases/SHR-005.md) |
| T-MAT-001 | [照片素材导入、搜索与预览](tasks/MAT-001.md) | [MAT-001](test-cases/MAT-001.md) |
| T-MAT-002 | [素材照片用于日记](tasks/MAT-002.md) | [MAT-002](test-cases/MAT-002.md) |
| T-MAT-003 | [贴纸与印章](tasks/MAT-003.md) | [MAT-003](test-cases/MAT-003.md) |
| T-MAT-004 | [灵感与陪伴联动](tasks/MAT-004.md) | [MAT-004](test-cases/MAT-004.md) |
| T-MAT-005 | [真实AI配图](tasks/MAT-005.md) | [MAT-005](test-cases/MAT-005.md) |
| T-PCD-001 | [生成明信片](tasks/PCD-001.md) | [PCD-001](test-cases/PCD-001.md) |
| T-PCD-002 | [分享与保存明信片](tasks/PCD-002.md) | [PCD-002](test-cases/PCD-002.md) |
| T-PET-001 | [真实陪伴聊天](tasks/PET-001.md) | [PET-001](test-cases/PET-001.md) |
| T-PET-002 | [记忆概览与入口](tasks/PET-002.md) | [PET-002](test-cases/PET-002.md) |
| T-DSC-001 | [社区分类与搜索](tasks/DSC-001.md) | [DSC-001](test-cases/DSC-001.md) |
| T-DSC-002 | [故事阅读](tasks/DSC-002.md) | [DSC-002](test-cases/DSC-002.md) |
| T-DSC-003 | [点赞与取消](tasks/DSC-003.md) | [DSC-003](test-cases/DSC-003.md) |
| T-GRW-001 | [个人空间与统计](tasks/GRW-001.md) | [GRW-001](test-cases/GRW-001.md) |
| T-GRW-002 | [成长树与标签](tasks/GRW-002.md) | [GRW-002](test-cases/GRW-002.md) |
| T-GRW-003 | [锚点提取与阅读](tasks/GRW-003.md) | [GRW-003](test-cases/GRW-003.md) |
| T-GRW-004 | [锚点纠正](tasks/GRW-004.md) | [GRW-004](test-cases/GRW-004.md) |
| T-GRW-005 | [花朵与里程碑](tasks/GRW-005.md) | [GRW-005](test-cases/GRW-005.md) |
| T-GRW-006 | [真实洞察报告](tasks/GRW-006.md) | [GRW-006](test-cases/GRW-006.md) |
| T-INT-001 | [真实业务端到端交付](tasks/INT-001.md) | [INT-001](test-cases/INT-001.md) |

## 与业务规格的关系

[业务总览](../business-spec/README.md) → [模块规格](../business-spec/README.md#业务总览) → 本目录任务 → 同名案例 → 测试代码/执行证据。原 [需求追踪矩阵](../business-spec/requirement-matrix.md) 也已链接到任务与案例；其中 `TC-*` 是早期用例种子，当前详细用例使用 `CASE-*`，避免重用原编号表达不同场景。

本目录增加的持久化、服务边界、异步失败等工程验收属于真实实施补充要求；未确认的业务语义仍以 Q 标识，不能宣称已获产品确认。
