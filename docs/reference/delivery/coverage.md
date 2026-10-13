# 验收与测试覆盖矩阵

版本：v0.1 · 2026-10-13。本文记录文档追踪关系，不是测试通过报告。

共 36 个业务功能、140 条有效原始 AC、42 项任务、225 条任务验收与 310 条 CASE。任务与测试文件各 42 份，逐项同名。CASE 中 65 条明确待决策，其余 245 条未执行；有契约/真实环境前置的案例须满足前置后执行。

原始 AC 来自 [FSD](../business-spec/README.md)；工程补充验收由任务定义。`DIA-007-AC05` 已停用，不计入有效 AC。原型条件与正式实施语义的差异应按任务中的 Q 处理；这里的覆盖不代表规则已经确认。未决项见[决策登记](decision-register.md)，执行证据格式见[共同约定](execution-context.md)。

## 原始 AC → 任务验收 → CASE

每行列出明确的原始 AC 和对应任务验收；CASE 为这些验收的具体验证设计。案例正文给出数据、步骤、预期及待决策状态。

### CRE AI 日记创作

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [CRE-001-AC01](../business-spec/modules/diary-creation.md) | [T-CRE-001-A01](tasks/CRE-001.md) | [CASE-CRE-001-001](test-cases/CRE-001.md)；[CASE-CRE-001-006](test-cases/CRE-001.md) |
| [CRE-001-AC02](../business-spec/modules/diary-creation.md) | [T-CRE-001-A02](tasks/CRE-001.md) | [CASE-CRE-001-002](test-cases/CRE-001.md)；[CASE-CRE-001-006](test-cases/CRE-001.md) |
| [CRE-001-AC03](../business-spec/modules/diary-creation.md) | [T-CRE-001-A03](tasks/CRE-001.md) | [CASE-CRE-001-003](test-cases/CRE-001.md)；[CASE-CRE-001-007](test-cases/CRE-001.md) |
| [CRE-001-AC04](../business-spec/modules/diary-creation.md) | [T-CRE-001-A04](tasks/CRE-001.md) | [CASE-CRE-001-004](test-cases/CRE-001.md) |
| [CRE-002-AC01](../business-spec/modules/diary-creation.md) | [T-CRE-002-A01](tasks/CRE-002.md) | [CASE-CRE-002-001](test-cases/CRE-002.md)；[CASE-CRE-002-008](test-cases/CRE-002.md) |
| [CRE-002-AC02](../business-spec/modules/diary-creation.md) | [T-CRE-002-A02](tasks/CRE-002.md) | [CASE-CRE-002-002](test-cases/CRE-002.md)；[CASE-CRE-002-007](test-cases/CRE-002.md) |
| [CRE-002-AC03](../business-spec/modules/diary-creation.md) | [T-CRE-002-A03](tasks/CRE-002.md) | [CASE-CRE-002-003](test-cases/CRE-002.md)；[CASE-CRE-002-007](test-cases/CRE-002.md)；[CASE-CRE-002-008](test-cases/CRE-002.md) |
| [CRE-002-AC04](../business-spec/modules/diary-creation.md) | [T-CRE-002-A04](tasks/CRE-002.md) | [CASE-CRE-002-004](test-cases/CRE-002.md)；[CASE-CRE-002-005](test-cases/CRE-002.md) |
| [CRE-003-AC01](../business-spec/modules/diary-creation.md) | [T-CRE-003-A01](tasks/CRE-003.md) | [CASE-CRE-003-001](test-cases/CRE-003.md) |
| [CRE-003-AC02](../business-spec/modules/diary-creation.md) | [T-CRE-003-A02](tasks/CRE-003.md) | [CASE-CRE-003-002](test-cases/CRE-003.md)；[CASE-CRE-003-005](test-cases/CRE-003.md) |
| [CRE-003-AC03](../business-spec/modules/diary-creation.md) | [T-CRE-003-A03](tasks/CRE-003.md) | [CASE-CRE-003-003](test-cases/CRE-003.md) |
| [CRE-004-AC01](../business-spec/modules/diary-creation.md) | [T-CRE-004-A01](tasks/CRE-004.md) | [CASE-CRE-004-001](test-cases/CRE-004.md) |
| [CRE-004-AC02](../business-spec/modules/diary-creation.md) | [T-CRE-004-A02](tasks/CRE-004.md) | [CASE-CRE-004-002](test-cases/CRE-004.md) |
| [CRE-004-AC03](../business-spec/modules/diary-creation.md) | [T-CRE-004-A03](tasks/CRE-004.md) | [CASE-CRE-004-003](test-cases/CRE-004.md)；[CASE-CRE-004-006](test-cases/CRE-004.md) |
| [CRE-004-AC04](../business-spec/modules/diary-creation.md) | [T-CRE-004-A04](tasks/CRE-004.md) | [CASE-CRE-004-004](test-cases/CRE-004.md) |
| [CRE-005-AC01](../business-spec/modules/diary-creation.md) | [T-CRE-005-A01](tasks/CRE-005.md) | [CASE-CRE-005-001](test-cases/CRE-005.md)；[CASE-CRE-005-008](test-cases/CRE-005.md) |
| [CRE-005-AC02](../business-spec/modules/diary-creation.md) | [T-CRE-005-A02](tasks/CRE-005.md) | [CASE-CRE-005-002](test-cases/CRE-005.md)；[CASE-CRE-005-008](test-cases/CRE-005.md) |
| [CRE-005-AC03](../business-spec/modules/diary-creation.md) | [T-CRE-005-A03](tasks/CRE-005.md) | [CASE-CRE-005-003](test-cases/CRE-005.md) |
| [CRE-005-AC04](../business-spec/modules/diary-creation.md) | [T-CRE-005-A04](tasks/CRE-005.md) | [CASE-CRE-005-004](test-cases/CRE-005.md) |
| [CRE-005-AC05](../business-spec/modules/diary-creation.md) | [T-CRE-005-A05](tasks/CRE-005.md) | [CASE-CRE-005-005](test-cases/CRE-005.md)；[CASE-CRE-005-009](test-cases/CRE-005.md) |
| [CRE-006-AC01](../business-spec/modules/diary-creation.md) | [T-CRE-006-A01](tasks/CRE-006.md) | [CASE-CRE-006-001](test-cases/CRE-006.md)；[CASE-CRE-006-007](test-cases/CRE-006.md) |
| [CRE-006-AC02](../business-spec/modules/diary-creation.md) | [T-CRE-006-A02](tasks/CRE-006.md) | [CASE-CRE-006-002](test-cases/CRE-006.md)；[CASE-CRE-006-003](test-cases/CRE-006.md) |
| [CRE-006-AC03](../business-spec/modules/diary-creation.md) | [T-CRE-006-A03](tasks/CRE-006.md) | [CASE-CRE-006-002](test-cases/CRE-006.md)；[CASE-CRE-006-007](test-cases/CRE-006.md)；[CASE-CRE-006-008](test-cases/CRE-006.md) |
| [CRE-006-AC04](../business-spec/modules/diary-creation.md) | [T-CRE-006-A04](tasks/CRE-006.md) | [CASE-CRE-006-004](test-cases/CRE-006.md)；[CASE-CRE-006-008](test-cases/CRE-006.md) |
| [CRE-006-AC05](../business-spec/modules/diary-creation.md) | [T-CRE-006-A05](tasks/CRE-006.md) | [CASE-CRE-006-005](test-cases/CRE-006.md) |

### DIA 日记管理与回忆

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [DIA-001-AC01](../business-spec/modules/diary-management.md) | [T-DIA-001-A01](tasks/DIA-001.md) | [CASE-DIA-001-001](test-cases/DIA-001.md)；[CASE-DIA-001-007](test-cases/DIA-001.md) |
| [DIA-001-AC02](../business-spec/modules/diary-management.md) | [T-DIA-001-A02](tasks/DIA-001.md) | [CASE-DIA-001-002](test-cases/DIA-001.md) |
| [DIA-001-AC03](../business-spec/modules/diary-management.md) | [T-DIA-001-A03](tasks/DIA-001.md)；[T-NAV-001-A04](tasks/NAV-001.md) | [CASE-DIA-001-003](test-cases/DIA-001.md)；[CASE-NAV-001-004](test-cases/NAV-001.md) |
| [DIA-001-AC04](../business-spec/modules/diary-management.md) | [T-DIA-001-A04](tasks/DIA-001.md)；[T-NAV-001-A03](tasks/NAV-001.md) | [CASE-DIA-001-004](test-cases/DIA-001.md)；[CASE-DIA-001-008](test-cases/DIA-001.md)；[CASE-NAV-001-003](test-cases/NAV-001.md) |
| [DIA-001-AC05](../business-spec/modules/diary-management.md) | [T-DIA-001-A05](tasks/DIA-001.md) | [CASE-DIA-001-005](test-cases/DIA-001.md) |
| [DIA-002-AC01](../business-spec/modules/diary-management.md) | [T-DIA-002-A01](tasks/DIA-002.md) | [CASE-DIA-002-001](test-cases/DIA-002.md)；[CASE-DIA-002-005](test-cases/DIA-002.md)；[CASE-DIA-002-009](test-cases/DIA-002.md) |
| [DIA-002-AC02](../business-spec/modules/diary-management.md) | [T-DIA-002-A02](tasks/DIA-002.md) | [CASE-DIA-002-002](test-cases/DIA-002.md)；[CASE-DIA-002-005](test-cases/DIA-002.md)；[CASE-DIA-002-009](test-cases/DIA-002.md) |
| [DIA-002-AC03](../business-spec/modules/diary-management.md) | [T-DIA-002-A03](tasks/DIA-002.md) | [CASE-DIA-002-003](test-cases/DIA-002.md)；[CASE-DIA-002-007](test-cases/DIA-002.md)；[CASE-DIA-002-008](test-cases/DIA-002.md)；[CASE-DIA-002-009](test-cases/DIA-002.md) |
| [DIA-002-AC04](../business-spec/modules/diary-management.md) | [T-DIA-002-A04](tasks/DIA-002.md) | [CASE-DIA-002-004](test-cases/DIA-002.md) |
| [DIA-002-AC05](../business-spec/modules/diary-management.md) | [T-DIA-002-A05](tasks/DIA-002.md) | [CASE-DIA-002-005](test-cases/DIA-002.md)；[CASE-DIA-002-008](test-cases/DIA-002.md) |
| [DIA-003-AC01](../business-spec/modules/diary-management.md) | [T-DIA-003-A01](tasks/DIA-003.md) | [CASE-DIA-003-001](test-cases/DIA-003.md)；[CASE-DIA-003-008](test-cases/DIA-003.md)；[CASE-DIA-003-009](test-cases/DIA-003.md) |
| [DIA-003-AC02](../business-spec/modules/diary-management.md) | [T-DIA-003-A02](tasks/DIA-003.md) | [CASE-DIA-003-002](test-cases/DIA-003.md)；[CASE-DIA-003-009](test-cases/DIA-003.md) |
| [DIA-003-AC03](../business-spec/modules/diary-management.md) | [T-DIA-003-A03](tasks/DIA-003.md) | [CASE-DIA-003-003](test-cases/DIA-003.md)；[CASE-DIA-003-004](test-cases/DIA-003.md)；[CASE-DIA-003-009](test-cases/DIA-003.md) |
| [DIA-003-AC04](../business-spec/modules/diary-management.md) | [T-DIA-003-A04](tasks/DIA-003.md) | [CASE-DIA-003-005](test-cases/DIA-003.md) |
| [DIA-003-AC05](../business-spec/modules/diary-management.md) | [T-DIA-003-A05](tasks/DIA-003.md) | [CASE-DIA-003-006](test-cases/DIA-003.md) |
| [DIA-004-AC01](../business-spec/modules/diary-management.md) | [T-DIA-004-A01](tasks/DIA-004.md) | [CASE-DIA-004-001](test-cases/DIA-004.md) |
| [DIA-004-AC02](../business-spec/modules/diary-management.md) | [T-DIA-004-A02](tasks/DIA-004.md) | [CASE-DIA-004-002](test-cases/DIA-004.md)；[CASE-DIA-004-006](test-cases/DIA-004.md) |
| [DIA-004-AC03](../business-spec/modules/diary-management.md) | [T-DIA-004-A03](tasks/DIA-004.md) | [CASE-DIA-004-003](test-cases/DIA-004.md)；[CASE-DIA-004-005](test-cases/DIA-004.md) |
| [DIA-005-AC01](../business-spec/modules/diary-management.md) | [T-DIA-005-A01](tasks/DIA-005.md) | [CASE-DIA-005-001](test-cases/DIA-005.md) |
| [DIA-005-AC02](../business-spec/modules/diary-management.md) | [T-DIA-005-A02](tasks/DIA-005.md) | [CASE-DIA-005-002](test-cases/DIA-005.md) |
| [DIA-005-AC03](../business-spec/modules/diary-management.md) | [T-DIA-005-A03](tasks/DIA-005.md) | [CASE-DIA-005-003](test-cases/DIA-005.md)；[CASE-DIA-005-004](test-cases/DIA-005.md)；[CASE-DIA-005-010](test-cases/DIA-005.md) |
| [DIA-005-AC04](../business-spec/modules/diary-management.md) | [T-DIA-005-A04](tasks/DIA-005.md) | [CASE-DIA-005-005](test-cases/DIA-005.md) |
| [DIA-005-AC05](../business-spec/modules/diary-management.md) | [T-DIA-005-A05](tasks/DIA-005.md) | [CASE-DIA-005-006](test-cases/DIA-005.md)；[CASE-DIA-005-008](test-cases/DIA-005.md) |
| [DIA-005-AC06](../business-spec/modules/diary-management.md) | [T-DIA-005-A06](tasks/DIA-005.md) | [CASE-DIA-005-007](test-cases/DIA-005.md)；[CASE-DIA-005-010](test-cases/DIA-005.md) |
| [DIA-006-AC01](../business-spec/modules/diary-management.md) | [T-DIA-006-A01](tasks/DIA-006.md) | [CASE-DIA-006-001](test-cases/DIA-006.md)；[CASE-DIA-006-008](test-cases/DIA-006.md)；[CASE-DIA-006-009](test-cases/DIA-006.md) |
| [DIA-006-AC02](../business-spec/modules/diary-management.md) | [T-DIA-006-A02](tasks/DIA-006.md) | [CASE-DIA-006-002](test-cases/DIA-006.md)；[CASE-DIA-006-007](test-cases/DIA-006.md)；[CASE-DIA-006-008](test-cases/DIA-006.md) |
| [DIA-006-AC03](../business-spec/modules/diary-management.md) | [T-DIA-006-A03](tasks/DIA-006.md) | [CASE-DIA-006-003](test-cases/DIA-006.md)；[CASE-DIA-006-007](test-cases/DIA-006.md) |
| [DIA-006-AC04](../business-spec/modules/diary-management.md) | [T-DIA-006-A04](tasks/DIA-006.md) | [CASE-DIA-006-004](test-cases/DIA-006.md)；[CASE-DIA-006-008](test-cases/DIA-006.md) |
| [DIA-006-AC05](../business-spec/modules/diary-management.md) | [T-DIA-006-A05](tasks/DIA-006.md) | [CASE-DIA-006-005](test-cases/DIA-006.md)；[CASE-DIA-006-008](test-cases/DIA-006.md) |
| [DIA-007-AC01](../business-spec/modules/diary-management.md) | [T-DIA-007-A01](tasks/DIA-007.md) | [CASE-DIA-007-001](test-cases/DIA-007.md)；[CASE-DIA-007-007](test-cases/DIA-007.md) |
| [DIA-007-AC02](../business-spec/modules/diary-management.md) | [T-DIA-007-A02](tasks/DIA-007.md) | [CASE-DIA-007-002](test-cases/DIA-007.md)；[CASE-DIA-007-005](test-cases/DIA-007.md)；[CASE-DIA-007-007](test-cases/DIA-007.md) |
| [DIA-007-AC03](../business-spec/modules/diary-management.md) | [T-DIA-007-A03](tasks/DIA-007.md) | [CASE-DIA-007-003](test-cases/DIA-007.md) |
| [DIA-007-AC04](../business-spec/modules/diary-management.md) | [T-DIA-007-A04](tasks/DIA-007.md) | [CASE-DIA-007-006](test-cases/DIA-007.md)；[CASE-DIA-007-008](test-cases/DIA-007.md) |

### SHR 公开范围与分享

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [SHR-001-AC01](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-001-A01](tasks/SHR-001.md) | [CASE-SHR-001-001](test-cases/SHR-001.md) |
| [SHR-001-AC02](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-001-A02](tasks/SHR-001.md)；[T-SHR-001-A03](tasks/SHR-001.md)；[T-SHR-001-A05](tasks/SHR-001.md) | [CASE-SHR-001-002](test-cases/SHR-001.md)；[CASE-SHR-001-003](test-cases/SHR-001.md)；[CASE-SHR-001-005](test-cases/SHR-001.md)；[CASE-SHR-001-006](test-cases/SHR-001.md)；[CASE-SHR-001-007](test-cases/SHR-001.md)；[CASE-SHR-001-008](test-cases/SHR-001.md) |
| [SHR-001-AC03](../business-spec/modules/sharing-and-privacy.md) | [T-NAV-001-A04](tasks/NAV-001.md)；[T-SHR-001-A04](tasks/SHR-001.md) | [CASE-NAV-001-004](test-cases/NAV-001.md)；[CASE-SHR-001-004](test-cases/SHR-001.md)；[CASE-SHR-001-005](test-cases/SHR-001.md) |
| [SHR-002-AC01](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-002-A01](tasks/SHR-002.md)；[T-SHR-002-A05](tasks/SHR-002.md) | [CASE-SHR-002-001](test-cases/SHR-002.md)；[CASE-SHR-002-005](test-cases/SHR-002.md)；[CASE-SHR-002-006](test-cases/SHR-002.md)；[CASE-SHR-002-007](test-cases/SHR-002.md) |
| [SHR-002-AC02](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-002-A02](tasks/SHR-002.md)；[T-SHR-002-A05](tasks/SHR-002.md) | [CASE-SHR-002-002](test-cases/SHR-002.md)；[CASE-SHR-002-005](test-cases/SHR-002.md)；[CASE-SHR-002-006](test-cases/SHR-002.md)；[CASE-SHR-002-007](test-cases/SHR-002.md) |
| [SHR-002-AC03](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-002-A03](tasks/SHR-002.md) | [CASE-SHR-002-003](test-cases/SHR-002.md) |
| [SHR-002-AC04](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-002-A04](tasks/SHR-002.md) | [CASE-SHR-002-004](test-cases/SHR-002.md) |
| [SHR-003-AC01](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-003-A01](tasks/SHR-003.md)；[T-SHR-003-A05](tasks/SHR-003.md) | [CASE-SHR-003-001](test-cases/SHR-003.md)；[CASE-SHR-003-005](test-cases/SHR-003.md)；[CASE-SHR-003-006](test-cases/SHR-003.md)；[CASE-SHR-003-007](test-cases/SHR-003.md) |
| [SHR-003-AC02](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-003-A02](tasks/SHR-003.md)；[T-SHR-003-A03](tasks/SHR-003.md)；[T-SHR-003-A05](tasks/SHR-003.md) | [CASE-SHR-003-002](test-cases/SHR-003.md)；[CASE-SHR-003-003](test-cases/SHR-003.md)；[CASE-SHR-003-005](test-cases/SHR-003.md)；[CASE-SHR-003-006](test-cases/SHR-003.md)；[CASE-SHR-003-007](test-cases/SHR-003.md) |
| [SHR-003-AC03](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-003-A04](tasks/SHR-003.md)；[T-SHR-003-A05](tasks/SHR-003.md) | [CASE-SHR-003-004](test-cases/SHR-003.md)；[CASE-SHR-003-005](test-cases/SHR-003.md)；[CASE-SHR-003-006](test-cases/SHR-003.md)；[CASE-SHR-003-007](test-cases/SHR-003.md) |
| [SHR-004-AC01](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-004-A01](tasks/SHR-004.md)；[T-SHR-004-A02](tasks/SHR-004.md)；[T-SHR-004-A04](tasks/SHR-004.md) | [CASE-SHR-004-001](test-cases/SHR-004.md)；[CASE-SHR-004-002](test-cases/SHR-004.md)；[CASE-SHR-004-003](test-cases/SHR-004.md)；[CASE-SHR-004-005](test-cases/SHR-004.md)；[CASE-SHR-004-006](test-cases/SHR-004.md)；[CASE-SHR-004-007](test-cases/SHR-004.md)；[CASE-SHR-004-008](test-cases/SHR-004.md) |
| [SHR-004-AC02](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-004-A03](tasks/SHR-004.md)；[T-SHR-004-A04](tasks/SHR-004.md) | [CASE-SHR-004-004](test-cases/SHR-004.md)；[CASE-SHR-004-005](test-cases/SHR-004.md)；[CASE-SHR-004-006](test-cases/SHR-004.md) |
| [SHR-005-AC01](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-005-A01](tasks/SHR-005.md) | [CASE-SHR-005-001](test-cases/SHR-005.md)；[CASE-SHR-005-009](test-cases/SHR-005.md) |
| [SHR-005-AC02](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-005-A02](tasks/SHR-005.md)；[T-SHR-005-A05](tasks/SHR-005.md)；[T-SHR-005-A06](tasks/SHR-005.md) | [CASE-SHR-005-002](test-cases/SHR-005.md)；[CASE-SHR-005-003](test-cases/SHR-005.md)；[CASE-SHR-005-005](test-cases/SHR-005.md)；[CASE-SHR-005-006](test-cases/SHR-005.md)；[CASE-SHR-005-007](test-cases/SHR-005.md)；[CASE-SHR-005-008](test-cases/SHR-005.md)；[CASE-SHR-005-009](test-cases/SHR-005.md) |
| [SHR-005-AC03](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-005-A03](tasks/SHR-005.md)；[T-SHR-005-A05](tasks/SHR-005.md)；[T-SHR-005-A06](tasks/SHR-005.md) | [CASE-SHR-005-002](test-cases/SHR-005.md)；[CASE-SHR-005-004](test-cases/SHR-005.md)；[CASE-SHR-005-005](test-cases/SHR-005.md)；[CASE-SHR-005-006](test-cases/SHR-005.md)；[CASE-SHR-005-007](test-cases/SHR-005.md)；[CASE-SHR-005-008](test-cases/SHR-005.md)；[CASE-SHR-005-009](test-cases/SHR-005.md) |
| [SHR-005-AC04](../business-spec/modules/sharing-and-privacy.md) | [T-SHR-005-A04](tasks/SHR-005.md)；[T-SHR-005-A05](tasks/SHR-005.md)；[T-SHR-005-A06](tasks/SHR-005.md) | [CASE-SHR-005-002](test-cases/SHR-005.md)；[CASE-SHR-005-005](test-cases/SHR-005.md)；[CASE-SHR-005-006](test-cases/SHR-005.md)；[CASE-SHR-005-007](test-cases/SHR-005.md)；[CASE-SHR-005-008](test-cases/SHR-005.md)；[CASE-SHR-005-009](test-cases/SHR-005.md) |

### MAT 素材与灵感

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [MAT-001-AC01](../business-spec/modules/material-library.md) | [T-MAT-001-A01](tasks/MAT-001.md)；[T-MAT-001-A04](tasks/MAT-001.md)；[T-MAT-001-A05](tasks/MAT-001.md) | [CASE-MAT-001-001](test-cases/MAT-001.md)；[CASE-MAT-001-004](test-cases/MAT-001.md)；[CASE-MAT-001-005](test-cases/MAT-001.md)；[CASE-MAT-001-006](test-cases/MAT-001.md)；[CASE-MAT-001-007](test-cases/MAT-001.md)；[CASE-MAT-001-008](test-cases/MAT-001.md) |
| [MAT-001-AC02](../business-spec/modules/material-library.md) | [T-MAT-001-A02](tasks/MAT-001.md) | [CASE-MAT-001-002](test-cases/MAT-001.md) |
| [MAT-001-AC03](../business-spec/modules/material-library.md) | [T-MAT-001-A03](tasks/MAT-001.md)；[T-MAT-001-A04](tasks/MAT-001.md)；[T-MAT-001-A05](tasks/MAT-001.md) | [CASE-MAT-001-001](test-cases/MAT-001.md)；[CASE-MAT-001-003](test-cases/MAT-001.md)；[CASE-MAT-001-004](test-cases/MAT-001.md)；[CASE-MAT-001-005](test-cases/MAT-001.md)；[CASE-MAT-001-006](test-cases/MAT-001.md)；[CASE-MAT-001-007](test-cases/MAT-001.md)；[CASE-MAT-001-008](test-cases/MAT-001.md) |
| [MAT-002-AC01](../business-spec/modules/material-library.md) | [T-MAT-002-A01](tasks/MAT-002.md)；[T-MAT-002-A05](tasks/MAT-002.md) | [CASE-MAT-002-001](test-cases/MAT-002.md)；[CASE-MAT-002-002](test-cases/MAT-002.md)；[CASE-MAT-002-005](test-cases/MAT-002.md)；[CASE-MAT-002-006](test-cases/MAT-002.md)；[CASE-MAT-002-007](test-cases/MAT-002.md) |
| [MAT-002-AC02](../business-spec/modules/material-library.md) | [T-MAT-002-A02](tasks/MAT-002.md)；[T-MAT-002-A05](tasks/MAT-002.md) | [CASE-MAT-002-002](test-cases/MAT-002.md)；[CASE-MAT-002-005](test-cases/MAT-002.md)；[CASE-MAT-002-006](test-cases/MAT-002.md)；[CASE-MAT-002-007](test-cases/MAT-002.md) |
| [MAT-002-AC03](../business-spec/modules/material-library.md) | [T-MAT-002-A03](tasks/MAT-002.md) | [CASE-MAT-002-003](test-cases/MAT-002.md)；[CASE-MAT-002-006](test-cases/MAT-002.md) |
| [MAT-002-AC04](../business-spec/modules/material-library.md) | [T-MAT-002-A04](tasks/MAT-002.md) | [CASE-MAT-002-004](test-cases/MAT-002.md)；[CASE-MAT-002-007](test-cases/MAT-002.md) |
| [MAT-003-AC01](../business-spec/modules/material-library.md) | [T-MAT-003-A01](tasks/MAT-003.md)；[T-MAT-003-A02](tasks/MAT-003.md)；[T-MAT-003-A04](tasks/MAT-003.md) | [CASE-MAT-003-001](test-cases/MAT-003.md)；[CASE-MAT-003-002](test-cases/MAT-003.md)；[CASE-MAT-003-004](test-cases/MAT-003.md)；[CASE-MAT-003-005](test-cases/MAT-003.md) |
| [MAT-003-AC02](../business-spec/modules/material-library.md) | [T-MAT-003-A03](tasks/MAT-003.md) | [CASE-MAT-003-003](test-cases/MAT-003.md) |
| [MAT-004-AC01](../business-spec/modules/material-library.md) | [T-MAT-004-A01](tasks/MAT-004.md)；[T-MAT-004-A04](tasks/MAT-004.md) | [CASE-MAT-004-001](test-cases/MAT-004.md)；[CASE-MAT-004-006](test-cases/MAT-004.md) |
| [MAT-004-AC02](../business-spec/modules/material-library.md) | [T-MAT-004-A02](tasks/MAT-004.md)；[T-MAT-004-A03](tasks/MAT-004.md)；[T-MAT-004-A04](tasks/MAT-004.md) | [CASE-MAT-004-002](test-cases/MAT-004.md)；[CASE-MAT-004-003](test-cases/MAT-004.md)；[CASE-MAT-004-004](test-cases/MAT-004.md)；[CASE-MAT-004-005](test-cases/MAT-004.md)；[CASE-MAT-004-006](test-cases/MAT-004.md)；[CASE-MAT-004-007](test-cases/MAT-004.md) |
| [MAT-005-AC01](../business-spec/modules/material-library.md) | [T-MAT-005-A01](tasks/MAT-005.md) | [CASE-MAT-005-001](test-cases/MAT-005.md)；[CASE-MAT-005-007](test-cases/MAT-005.md) |
| [MAT-005-AC02](../business-spec/modules/material-library.md) | [T-MAT-005-A02](tasks/MAT-005.md)；[T-MAT-005-A03](tasks/MAT-005.md)；[T-MAT-005-A05](tasks/MAT-005.md) | [CASE-MAT-005-002](test-cases/MAT-005.md)；[CASE-MAT-005-003](test-cases/MAT-005.md)；[CASE-MAT-005-005](test-cases/MAT-005.md)；[CASE-MAT-005-006](test-cases/MAT-005.md)；[CASE-MAT-005-007](test-cases/MAT-005.md)；[CASE-MAT-005-008](test-cases/MAT-005.md) |
| [MAT-005-AC03](../business-spec/modules/material-library.md) | [T-MAT-005-A04](tasks/MAT-005.md)；[T-MAT-005-A05](tasks/MAT-005.md) | [CASE-MAT-005-004](test-cases/MAT-005.md)；[CASE-MAT-005-005](test-cases/MAT-005.md)；[CASE-MAT-005-006](test-cases/MAT-005.md)；[CASE-MAT-005-007](test-cases/MAT-005.md) |

### PCD 明信片

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [PCD-001-AC01](../business-spec/modules/postcards.md) | [T-PCD-001-A01](tasks/PCD-001.md)；[T-PCD-001-A04](tasks/PCD-001.md) | [CASE-PCD-001-001](test-cases/PCD-001.md)；[CASE-PCD-001-004](test-cases/PCD-001.md)；[CASE-PCD-001-005](test-cases/PCD-001.md) |
| [PCD-001-AC02](../business-spec/modules/postcards.md) | [T-PCD-001-A02](tasks/PCD-001.md)；[T-PCD-001-A05](tasks/PCD-001.md) | [CASE-PCD-001-002](test-cases/PCD-001.md)；[CASE-PCD-001-005](test-cases/PCD-001.md)；[CASE-PCD-001-006](test-cases/PCD-001.md) |
| [PCD-001-AC03](../business-spec/modules/postcards.md) | [T-PCD-001-A03](tasks/PCD-001.md)；[T-PCD-001-A04](tasks/PCD-001.md)；[T-PCD-001-A05](tasks/PCD-001.md) | [CASE-PCD-001-003](test-cases/PCD-001.md)；[CASE-PCD-001-004](test-cases/PCD-001.md)；[CASE-PCD-001-005](test-cases/PCD-001.md)；[CASE-PCD-001-006](test-cases/PCD-001.md)；[CASE-PCD-001-007](test-cases/PCD-001.md) |
| [PCD-002-AC01](../business-spec/modules/postcards.md) | [T-PCD-002-A01](tasks/PCD-002.md)；[T-PCD-002-A05](tasks/PCD-002.md) | [CASE-PCD-002-001](test-cases/PCD-002.md)；[CASE-PCD-002-003](test-cases/PCD-002.md)；[CASE-PCD-002-004](test-cases/PCD-002.md)；[CASE-PCD-002-007](test-cases/PCD-002.md)；[CASE-PCD-002-008](test-cases/PCD-002.md) |
| [PCD-002-AC02](../business-spec/modules/postcards.md) | [T-PCD-002-A02](tasks/PCD-002.md)；[T-PCD-002-A03](tasks/PCD-002.md)；[T-PCD-002-A05](tasks/PCD-002.md) | [CASE-PCD-002-003](test-cases/PCD-002.md)；[CASE-PCD-002-004](test-cases/PCD-002.md)；[CASE-PCD-002-005](test-cases/PCD-002.md)；[CASE-PCD-002-006](test-cases/PCD-002.md)；[CASE-PCD-002-007](test-cases/PCD-002.md)；[CASE-PCD-002-008](test-cases/PCD-002.md) |
| [PCD-002-AC03](../business-spec/modules/postcards.md) | [T-PCD-002-A04](tasks/PCD-002.md)；[T-PCD-002-A05](tasks/PCD-002.md) | [CASE-PCD-002-002](test-cases/PCD-002.md)；[CASE-PCD-002-003](test-cases/PCD-002.md)；[CASE-PCD-002-004](test-cases/PCD-002.md)；[CASE-PCD-002-007](test-cases/PCD-002.md)；[CASE-PCD-002-008](test-cases/PCD-002.md) |

### PET AI 陪伴

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [PET-001-AC01](../business-spec/modules/companion.md) | [T-PET-001-A01](tasks/PET-001.md) | [CASE-PET-001-001](test-cases/PET-001.md)；[CASE-PET-001-004](test-cases/PET-001.md) |
| [PET-001-AC02](../business-spec/modules/companion.md) | [T-PET-001-A02](tasks/PET-001.md) | [CASE-PET-001-002](test-cases/PET-001.md)；[CASE-PET-001-006](test-cases/PET-001.md)；[CASE-PET-001-008](test-cases/PET-001.md) |
| [PET-001-AC03](../business-spec/modules/companion.md) | [T-PET-001-A03](tasks/PET-001.md) | [CASE-PET-001-002](test-cases/PET-001.md)；[CASE-PET-001-003](test-cases/PET-001.md)；[CASE-PET-001-007](test-cases/PET-001.md) |
| [PET-001-AC04](../business-spec/modules/companion.md) | [T-PET-001-A04](tasks/PET-001.md) | [CASE-PET-001-004](test-cases/PET-001.md)；[CASE-PET-001-009](test-cases/PET-001.md) |
| [PET-002-AC01](../business-spec/modules/companion.md) | [T-PET-002-A01](tasks/PET-002.md) | [CASE-PET-002-001](test-cases/PET-002.md)；[CASE-PET-002-005](test-cases/PET-002.md)；[CASE-PET-002-006](test-cases/PET-002.md) |
| [PET-002-AC02](../business-spec/modules/companion.md) | [T-PET-002-A02](tasks/PET-002.md) | [CASE-PET-002-002](test-cases/PET-002.md)；[CASE-PET-002-006](test-cases/PET-002.md) |
| [PET-002-AC03](../business-spec/modules/companion.md) | [T-PET-002-A03](tasks/PET-002.md) | [CASE-PET-002-003](test-cases/PET-002.md)；[CASE-PET-002-004](test-cases/PET-002.md)；[CASE-PET-002-006](test-cases/PET-002.md) |

### DSC 发现社区

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [DSC-001-AC01](../business-spec/modules/discovery.md) | [T-DSC-001-A01](tasks/DSC-001.md) | [CASE-DSC-001-001](test-cases/DSC-001.md)；[CASE-DSC-001-009](test-cases/DSC-001.md) |
| [DSC-001-AC02](../business-spec/modules/discovery.md) | [T-DSC-001-A02](tasks/DSC-001.md) | [CASE-DSC-001-001](test-cases/DSC-001.md) |
| [DSC-001-AC03](../business-spec/modules/discovery.md) | [T-DSC-001-A03](tasks/DSC-001.md) | [CASE-DSC-001-002](test-cases/DSC-001.md)；[CASE-DSC-001-004](test-cases/DSC-001.md)；[CASE-DSC-001-009](test-cases/DSC-001.md)；[CASE-DSC-001-010](test-cases/DSC-001.md) |
| [DSC-001-AC04](../business-spec/modules/discovery.md) | [T-DSC-001-A04](tasks/DSC-001.md) | [CASE-DSC-001-003](test-cases/DSC-001.md)；[CASE-DSC-001-007](test-cases/DSC-001.md) |
| [DSC-001-AC05](../business-spec/modules/discovery.md) | [T-DSC-001-A05](tasks/DSC-001.md) | [CASE-DSC-001-004](test-cases/DSC-001.md)；[CASE-DSC-001-010](test-cases/DSC-001.md) |
| [DSC-001-AC06](../business-spec/modules/discovery.md) | [T-DSC-001-A06](tasks/DSC-001.md) | [CASE-DSC-001-005](test-cases/DSC-001.md)；[CASE-DSC-001-008](test-cases/DSC-001.md) |
| [DSC-002-AC01](../business-spec/modules/discovery.md) | [T-DSC-002-A01](tasks/DSC-002.md) | [CASE-DSC-002-001](test-cases/DSC-002.md)；[CASE-DSC-002-006](test-cases/DSC-002.md) |
| [DSC-002-AC02](../business-spec/modules/discovery.md) | [T-DSC-002-A02](tasks/DSC-002.md) | [CASE-DSC-002-002](test-cases/DSC-002.md) |
| [DSC-002-AC03](../business-spec/modules/discovery.md) | [T-DSC-002-A03](tasks/DSC-002.md)；[T-NAV-001-A04](tasks/NAV-001.md) | [CASE-DSC-002-003](test-cases/DSC-002.md)；[CASE-NAV-001-004](test-cases/NAV-001.md) |
| [DSC-003-AC01](../business-spec/modules/discovery.md) | [T-DSC-003-A01](tasks/DSC-003.md) | [CASE-DSC-003-001](test-cases/DSC-003.md)；[CASE-DSC-003-007](test-cases/DSC-003.md) |
| [DSC-003-AC02](../business-spec/modules/discovery.md) | [T-DSC-003-A02](tasks/DSC-003.md) | [CASE-DSC-003-001](test-cases/DSC-003.md)；[CASE-DSC-003-007](test-cases/DSC-003.md) |
| [DSC-003-AC03](../business-spec/modules/discovery.md) | [T-DSC-003-A03](tasks/DSC-003.md) | [CASE-DSC-003-002](test-cases/DSC-003.md)；[CASE-DSC-003-006](test-cases/DSC-003.md) |
| [DSC-003-AC04](../business-spec/modules/discovery.md) | [T-DSC-003-A04](tasks/DSC-003.md) | [CASE-DSC-003-003](test-cases/DSC-003.md)；[CASE-DSC-003-004](test-cases/DSC-003.md)；[CASE-DSC-003-005](test-cases/DSC-003.md) |

### GRW 成长与洞察

| 原始 AC | 任务验收 | 对应 CASE |
| --- | --- | --- |
| [GRW-001-AC01](../business-spec/modules/growth-and-insights.md) | [T-GRW-001-A01](tasks/GRW-001.md) | [CASE-GRW-001-001](test-cases/GRW-001.md)；[CASE-GRW-001-007](test-cases/GRW-001.md) |
| [GRW-001-AC02](../business-spec/modules/growth-and-insights.md) | [T-GRW-001-A02](tasks/GRW-001.md) | [CASE-GRW-001-002](test-cases/GRW-001.md) |
| [GRW-001-AC03](../business-spec/modules/growth-and-insights.md) | [T-GRW-001-A03](tasks/GRW-001.md) | [CASE-GRW-001-003](test-cases/GRW-001.md) |
| [GRW-001-AC04](../business-spec/modules/growth-and-insights.md) | [T-GRW-001-A04](tasks/GRW-001.md) | [CASE-GRW-001-004](test-cases/GRW-001.md)；[CASE-GRW-001-005](test-cases/GRW-001.md)；[CASE-GRW-001-006](test-cases/GRW-001.md) |
| [GRW-002-AC01](../business-spec/modules/growth-and-insights.md) | [T-GRW-002-A01](tasks/GRW-002.md) | [CASE-GRW-002-001](test-cases/GRW-002.md)；[CASE-GRW-002-005](test-cases/GRW-002.md)；[CASE-GRW-002-007](test-cases/GRW-002.md) |
| [GRW-002-AC02](../business-spec/modules/growth-and-insights.md) | [T-GRW-002-A02](tasks/GRW-002.md) | [CASE-GRW-002-002](test-cases/GRW-002.md) |
| [GRW-002-AC03](../business-spec/modules/growth-and-insights.md) | [T-GRW-002-A03](tasks/GRW-002.md) | [CASE-GRW-002-003](test-cases/GRW-002.md)；[CASE-GRW-002-006](test-cases/GRW-002.md)；[CASE-GRW-002-007](test-cases/GRW-002.md) |
| [GRW-002-AC04](../business-spec/modules/growth-and-insights.md) | [T-GRW-002-A04](tasks/GRW-002.md) | [CASE-GRW-002-004](test-cases/GRW-002.md) |
| [GRW-003-AC01](../business-spec/modules/growth-and-insights.md) | [T-GRW-003-A01](tasks/GRW-003.md) | [CASE-GRW-003-001](test-cases/GRW-003.md)；[CASE-GRW-003-005](test-cases/GRW-003.md)；[CASE-GRW-003-008](test-cases/GRW-003.md) |
| [GRW-003-AC02](../business-spec/modules/growth-and-insights.md) | [T-GRW-003-A02](tasks/GRW-003.md) | [CASE-GRW-003-002](test-cases/GRW-003.md)；[CASE-GRW-003-006](test-cases/GRW-003.md) |
| [GRW-003-AC03](../business-spec/modules/growth-and-insights.md) | [T-GRW-003-A03](tasks/GRW-003.md) | [CASE-GRW-003-003](test-cases/GRW-003.md) |
| [GRW-003-AC04](../business-spec/modules/growth-and-insights.md) | [T-GRW-003-A04](tasks/GRW-003.md) | [CASE-GRW-003-004](test-cases/GRW-003.md)；[CASE-GRW-003-008](test-cases/GRW-003.md) |
| [GRW-003-AC05](../business-spec/modules/growth-and-insights.md) | [T-GRW-003-A05](tasks/GRW-003.md) | [CASE-GRW-003-007](test-cases/GRW-003.md) |
| [GRW-004-AC01](../business-spec/modules/growth-and-insights.md) | [T-GRW-004-A01](tasks/GRW-004.md) | [CASE-GRW-004-001](test-cases/GRW-004.md) |
| [GRW-004-AC02](../business-spec/modules/growth-and-insights.md) | [T-GRW-004-A02](tasks/GRW-004.md) | [CASE-GRW-004-002](test-cases/GRW-004.md)；[CASE-GRW-004-008](test-cases/GRW-004.md) |
| [GRW-004-AC03](../business-spec/modules/growth-and-insights.md) | [T-GRW-004-A03](tasks/GRW-004.md) | [CASE-GRW-004-003](test-cases/GRW-004.md)；[CASE-GRW-004-006](test-cases/GRW-004.md) |
| [GRW-004-AC04](../business-spec/modules/growth-and-insights.md) | [T-GRW-004-A04](tasks/GRW-004.md) | [CASE-GRW-004-004](test-cases/GRW-004.md) |
| [GRW-004-AC05](../business-spec/modules/growth-and-insights.md) | [T-GRW-004-A05](tasks/GRW-004.md) | [CASE-GRW-004-005](test-cases/GRW-004.md) |
| [GRW-005-AC01](../business-spec/modules/growth-and-insights.md) | [T-GRW-005-A01](tasks/GRW-005.md) | [CASE-GRW-005-001](test-cases/GRW-005.md)；[CASE-GRW-005-005](test-cases/GRW-005.md) |
| [GRW-005-AC02](../business-spec/modules/growth-and-insights.md) | [T-GRW-005-A02](tasks/GRW-005.md) | [CASE-GRW-005-002](test-cases/GRW-005.md) |
| [GRW-005-AC03](../business-spec/modules/growth-and-insights.md) | [T-GRW-005-A03](tasks/GRW-005.md) | [CASE-GRW-005-003](test-cases/GRW-005.md)；[CASE-GRW-005-005](test-cases/GRW-005.md) |
| [GRW-005-AC04](../business-spec/modules/growth-and-insights.md) | [T-GRW-005-A04](tasks/GRW-005.md) | [CASE-GRW-005-002](test-cases/GRW-005.md)；[CASE-GRW-005-003](test-cases/GRW-005.md)；[CASE-GRW-005-004](test-cases/GRW-005.md) |
| [GRW-006-AC01](../business-spec/modules/growth-and-insights.md) | [T-GRW-006-A01](tasks/GRW-006.md) | [CASE-GRW-006-001](test-cases/GRW-006.md)；[CASE-GRW-006-005](test-cases/GRW-006.md) |
| [GRW-006-AC02](../business-spec/modules/growth-and-insights.md) | [T-GRW-006-A02](tasks/GRW-006.md) | [CASE-GRW-006-001](test-cases/GRW-006.md) |
| [GRW-006-AC03](../business-spec/modules/growth-and-insights.md) | [T-GRW-006-A03](tasks/GRW-006.md) | [CASE-GRW-006-002](test-cases/GRW-006.md)；[CASE-GRW-006-003](test-cases/GRW-006.md)；[CASE-GRW-006-007](test-cases/GRW-006.md)；[CASE-GRW-006-008](test-cases/GRW-006.md) |
| [GRW-006-AC04](../business-spec/modules/growth-and-insights.md) | [T-GRW-006-A04](tasks/GRW-006.md) | [CASE-GRW-006-006](test-cases/GRW-006.md) |

## 无独立原始 AC 的补充验收

这里列出服务、持久化、测试基础、联调及各功能新增验收。其余补充验收已在上表随支持的原始 AC 列出；两部分合计覆盖全部任务验收。

| 任务验收 | 对应 CASE |
| --- | --- |
| [T-BAS-001-A01](tasks/BAS-001.md) | [CASE-BAS-001-001](test-cases/BAS-001.md) |
| [T-BAS-001-A02](tasks/BAS-001.md) | [CASE-BAS-001-002](test-cases/BAS-001.md) |
| [T-BAS-001-A03](tasks/BAS-001.md) | [CASE-BAS-001-003](test-cases/BAS-001.md) |
| [T-BAS-001-A04](tasks/BAS-001.md) | [CASE-BAS-001-004](test-cases/BAS-001.md) |
| [T-BAS-001-A05](tasks/BAS-001.md) | [CASE-BAS-001-005](test-cases/BAS-001.md) |
| [T-BAS-002-A01](tasks/BAS-002.md) | [CASE-BAS-002-001](test-cases/BAS-002.md) |
| [T-BAS-002-A02](tasks/BAS-002.md) | [CASE-BAS-002-002](test-cases/BAS-002.md) |
| [T-BAS-002-A03](tasks/BAS-002.md) | [CASE-BAS-002-003](test-cases/BAS-002.md) |
| [T-BAS-002-A04](tasks/BAS-002.md) | [CASE-BAS-002-004](test-cases/BAS-002.md) |
| [T-BAS-002-A05](tasks/BAS-002.md) | [CASE-BAS-002-005](test-cases/BAS-002.md) |
| [T-BAS-003-A01](tasks/BAS-003.md) | [CASE-BAS-003-001](test-cases/BAS-003.md) |
| [T-BAS-003-A02](tasks/BAS-003.md) | [CASE-BAS-003-002](test-cases/BAS-003.md) |
| [T-BAS-003-A03](tasks/BAS-003.md) | [CASE-BAS-003-003](test-cases/BAS-003.md) |
| [T-BAS-003-A04](tasks/BAS-003.md) | [CASE-BAS-003-004](test-cases/BAS-003.md) |
| [T-BAS-003-A05](tasks/BAS-003.md) | [CASE-BAS-003-005](test-cases/BAS-003.md) |
| [T-BAS-003-A06](tasks/BAS-003.md) | [CASE-BAS-003-006](test-cases/BAS-003.md)；[CASE-BAS-003-007](test-cases/BAS-003.md) |
| [T-BAS-004-A01](tasks/BAS-004.md) | [CASE-BAS-004-001](test-cases/BAS-004.md) |
| [T-BAS-004-A02](tasks/BAS-004.md) | [CASE-BAS-004-002](test-cases/BAS-004.md) |
| [T-BAS-004-A03](tasks/BAS-004.md) | [CASE-BAS-004-003](test-cases/BAS-004.md) |
| [T-BAS-004-A04](tasks/BAS-004.md) | [CASE-BAS-004-004](test-cases/BAS-004.md) |
| [T-BAS-004-A05](tasks/BAS-004.md) | [CASE-BAS-004-005](test-cases/BAS-004.md) |
| [T-CRE-001-A05](tasks/CRE-001.md) | [CASE-CRE-001-005](test-cases/CRE-001.md)；[CASE-CRE-001-006](test-cases/CRE-001.md)；[CASE-CRE-001-007](test-cases/CRE-001.md) |
| [T-CRE-002-A05](tasks/CRE-002.md) | [CASE-CRE-002-006](test-cases/CRE-002.md)；[CASE-CRE-002-007](test-cases/CRE-002.md)；[CASE-CRE-002-008](test-cases/CRE-002.md) |
| [T-CRE-003-A04](tasks/CRE-003.md) | [CASE-CRE-003-004](test-cases/CRE-003.md)；[CASE-CRE-003-005](test-cases/CRE-003.md) |
| [T-CRE-004-A05](tasks/CRE-004.md) | [CASE-CRE-004-005](test-cases/CRE-004.md) |
| [T-CRE-005-A06](tasks/CRE-005.md) | [CASE-CRE-005-001](test-cases/CRE-005.md)；[CASE-CRE-005-006](test-cases/CRE-005.md)；[CASE-CRE-005-007](test-cases/CRE-005.md)；[CASE-CRE-005-008](test-cases/CRE-005.md)；[CASE-CRE-005-009](test-cases/CRE-005.md) |
| [T-CRE-006-A06](tasks/CRE-006.md) | [CASE-CRE-006-006](test-cases/CRE-006.md)；[CASE-CRE-006-007](test-cases/CRE-006.md) |
| [T-DIA-001-A06](tasks/DIA-001.md) | [CASE-DIA-001-006](test-cases/DIA-001.md)；[CASE-DIA-001-007](test-cases/DIA-001.md) |
| [T-DIA-002-A06](tasks/DIA-002.md) | [CASE-DIA-002-006](test-cases/DIA-002.md)；[CASE-DIA-002-007](test-cases/DIA-002.md)；[CASE-DIA-002-009](test-cases/DIA-002.md) |
| [T-DIA-003-A06](tasks/DIA-003.md) | [CASE-DIA-003-007](test-cases/DIA-003.md)；[CASE-DIA-003-008](test-cases/DIA-003.md)；[CASE-DIA-003-009](test-cases/DIA-003.md) |
| [T-DIA-004-A04](tasks/DIA-004.md) | [CASE-DIA-004-004](test-cases/DIA-004.md)；[CASE-DIA-004-005](test-cases/DIA-004.md) |
| [T-DIA-005-A07](tasks/DIA-005.md) | [CASE-DIA-005-008](test-cases/DIA-005.md)；[CASE-DIA-005-009](test-cases/DIA-005.md)；[CASE-DIA-005-010](test-cases/DIA-005.md) |
| [T-DIA-006-A06](tasks/DIA-006.md) | [CASE-DIA-006-006](test-cases/DIA-006.md)；[CASE-DIA-006-007](test-cases/DIA-006.md)；[CASE-DIA-006-009](test-cases/DIA-006.md) |
| [T-DIA-007-A05](tasks/DIA-007.md) | [CASE-DIA-007-004](test-cases/DIA-007.md)；[CASE-DIA-007-005](test-cases/DIA-007.md)；[CASE-DIA-007-006](test-cases/DIA-007.md)；[CASE-DIA-007-008](test-cases/DIA-007.md) |
| [T-DSC-001-A07](tasks/DSC-001.md) | [CASE-DSC-001-006](test-cases/DSC-001.md)；[CASE-DSC-001-007](test-cases/DSC-001.md)；[CASE-DSC-001-008](test-cases/DSC-001.md)；[CASE-DSC-001-009](test-cases/DSC-001.md)；[CASE-DSC-001-010](test-cases/DSC-001.md) |
| [T-DSC-002-A04](tasks/DSC-002.md) | [CASE-DSC-002-004](test-cases/DSC-002.md)；[CASE-DSC-002-005](test-cases/DSC-002.md)；[CASE-DSC-002-006](test-cases/DSC-002.md)；[CASE-DSC-002-007](test-cases/DSC-002.md) |
| [T-DSC-003-A05](tasks/DSC-003.md) | [CASE-DSC-003-004](test-cases/DSC-003.md)；[CASE-DSC-003-005](test-cases/DSC-003.md)；[CASE-DSC-003-006](test-cases/DSC-003.md)；[CASE-DSC-003-007](test-cases/DSC-003.md) |
| [T-GRW-001-A05](tasks/GRW-001.md) | [CASE-GRW-001-006](test-cases/GRW-001.md) |
| [T-GRW-001-A06](tasks/GRW-001.md) | [CASE-GRW-001-005](test-cases/GRW-001.md) |
| [T-GRW-002-A05](tasks/GRW-002.md) | [CASE-GRW-002-005](test-cases/GRW-002.md)；[CASE-GRW-002-006](test-cases/GRW-002.md)；[CASE-GRW-002-007](test-cases/GRW-002.md) |
| [T-GRW-003-A06](tasks/GRW-003.md) | [CASE-GRW-003-005](test-cases/GRW-003.md)；[CASE-GRW-003-008](test-cases/GRW-003.md) |
| [T-GRW-003-A07](tasks/GRW-003.md) | [CASE-GRW-003-006](test-cases/GRW-003.md)；[CASE-GRW-003-008](test-cases/GRW-003.md) |
| [T-GRW-004-A06](tasks/GRW-004.md) | [CASE-GRW-004-006](test-cases/GRW-004.md)；[CASE-GRW-004-007](test-cases/GRW-004.md)；[CASE-GRW-004-008](test-cases/GRW-004.md) |
| [T-GRW-004-A07](tasks/GRW-004.md) | [CASE-GRW-004-003](test-cases/GRW-004.md)；[CASE-GRW-004-007](test-cases/GRW-004.md)；[CASE-GRW-004-008](test-cases/GRW-004.md) |
| [T-GRW-005-A05](tasks/GRW-005.md) | [CASE-GRW-005-005](test-cases/GRW-005.md)；[CASE-GRW-005-006](test-cases/GRW-005.md) |
| [T-GRW-005-A06](tasks/GRW-005.md) | [CASE-GRW-005-004](test-cases/GRW-005.md)；[CASE-GRW-005-006](test-cases/GRW-005.md) |
| [T-GRW-006-A05](tasks/GRW-006.md) | [CASE-GRW-006-003](test-cases/GRW-006.md)；[CASE-GRW-006-004](test-cases/GRW-006.md)；[CASE-GRW-006-005](test-cases/GRW-006.md)；[CASE-GRW-006-007](test-cases/GRW-006.md)；[CASE-GRW-006-008](test-cases/GRW-006.md) |
| [T-GRW-006-A06](tasks/GRW-006.md) | [CASE-GRW-006-005](test-cases/GRW-006.md)；[CASE-GRW-006-007](test-cases/GRW-006.md)；[CASE-GRW-006-008](test-cases/GRW-006.md) |
| [T-INT-001-A01](tasks/INT-001.md) | [CASE-INT-001-001](test-cases/INT-001.md)；[CASE-INT-001-002](test-cases/INT-001.md) |
| [T-INT-001-A02](tasks/INT-001.md) | [CASE-INT-001-003](test-cases/INT-001.md) |
| [T-INT-001-A03](tasks/INT-001.md) | [CASE-INT-001-004](test-cases/INT-001.md)；[CASE-INT-001-008](test-cases/INT-001.md) |
| [T-INT-001-A04](tasks/INT-001.md) | [CASE-INT-001-005](test-cases/INT-001.md) |
| [T-INT-001-A05](tasks/INT-001.md) | [CASE-INT-001-006](test-cases/INT-001.md) |
| [T-INT-001-A06](tasks/INT-001.md) | [CASE-INT-001-007](test-cases/INT-001.md) |
| [T-NAV-001-A01](tasks/NAV-001.md) | [CASE-NAV-001-001](test-cases/NAV-001.md) |
| [T-NAV-001-A02](tasks/NAV-001.md) | [CASE-NAV-001-002](test-cases/NAV-001.md) |
| [T-NAV-001-A05](tasks/NAV-001.md) | [CASE-NAV-001-005](test-cases/NAV-001.md) |
| [T-NAV-001-A06](tasks/NAV-001.md) | [CASE-NAV-001-006](test-cases/NAV-001.md) |
| [T-PET-001-A05](tasks/PET-001.md) | [CASE-PET-001-005](test-cases/PET-001.md)；[CASE-PET-001-006](test-cases/PET-001.md)；[CASE-PET-001-008](test-cases/PET-001.md) |
| [T-PET-001-A06](tasks/PET-001.md) | [CASE-PET-001-007](test-cases/PET-001.md)；[CASE-PET-001-009](test-cases/PET-001.md) |
| [T-PET-002-A04](tasks/PET-002.md) | [CASE-PET-002-004](test-cases/PET-002.md)；[CASE-PET-002-005](test-cases/PET-002.md)；[CASE-PET-002-006](test-cases/PET-002.md) |

## 核验结果

2026-10-13 文档核验：42 个任务与 42 个同名案例文件匹配；140 条有效原始 AC 均有任务与案例映射；225 条任务验收均有具体 CASE；定义编号唯一、引用目标有效、Markdown 表格结构有效，显式完成依赖无循环。业务测试尚未执行。

维护时新增或更改 AC、任务验收、CASE 后同步本表与 [RTM](../business-spec/requirement-matrix.md)；旧执行证据只适用于原版本，不随文本变更自动保持通过。
