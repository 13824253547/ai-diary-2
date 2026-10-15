# AI Diary 持续实施启动提示词

本提示词适用于当前可用的 AI 编码助手或模型，不假设特定模型、计划模式、插件、权限或工具一定可用。先确认当前实际能力；不可用时说明限制并给出可由用户完成的具体步骤，不得声称已执行。

## 当前进度快照

以下数据仅是 **2026-10-15 的起始参考**，不是当前事实或完成承诺；每次启动都必须按最新 worktree 和交付台账重新核算：

- 覆盖文档记录 42 项任务、225 条任务验收项、310 条 CASE。
- 当时验收矩阵明确标记通过 88/225 项，约 **39.1%**。仅“已通过”计入分子；partial、阻塞、待决策和未执行不计入。
- 本地开发库 `ai_diary` 当时已通过 schema diff 后登记两条 Prisma migration，状态 up-to-date，日记行数前后均为 2。执行前先复核数据库状态；不要重复 baseline。
- 重要未闭环项曾包括 CRE-002 的 iOS `E_NO_PERMISSIONS`、CRE-005 的真实 provider/Q-002、DIA-005 的 Q-001/Q-008、DIA-006 的 Q-004，以及 BAS-003 的 legacy 正文回填、损坏数据恢复和资产留存。这些仅供定位，每次都要根据当前代码和记录重新确认。

## 可直接使用的主提示词

```text
请继续基于当前 worktree 和当前 docs/reference/delivery/ 状态，增量完成
/Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary
下 delivery 定义的真实业务实现、测试与验收。

一、事实来源与现状核实

严格只以当前仓库为准。每轮开始时阅读并核对：
- AGENTS.md
- docs/reference/delivery/README.md
- docs/reference/delivery/execution-context.md
- docs/reference/delivery/decision-register.md
- docs/reference/delivery/coverage.md
- docs/reference/delivery/reports/autonomous-progress.md
- docs/reference/delivery/reports/autonomous-acceptance-matrix.md
- docs/reference/delivery/reports/autonomous-blockers.md
- docs/reference/delivery/reports/current-execution-snapshot.md

按当前任务继续阅读对应 task、同名 CASE、契约、源码、配置和测试。先检查 git status，保留所有既有未提交修改和删除，不覆盖、不回滚或清理无关工作。

不同资料可能过时、描述的是设计而非现状，或与当前项目不匹配：
- 先确认路径、符号、配置、测试和运行环境实际存在，再依赖其内容。
- 区分“需求/规则”“实现现状”“验证证据”；文档中的预期、测试文件存在或历史报告都不等于功能已实现/通过。
- 用户最新指令优先；项目规则和已确认业务决策用于判定预期；当前源码、配置、实际测试与运行结果用于判定实现证据。
- 旧 handoff、对话摘要、历史进度、外部记忆和模型推断只能辅助定位，不得覆盖当前仓库事实。
- 发现差异时记录差异及影响；不得擅自改验收标准、放宽断言，或把推测写成已确认规则。

每轮先核对 CRE-002：确认当前代码、实际测试、iOS 阻塞结论、任务文档、CASE 和四份台账一致；若不一致先更正，再继续。

二、阻塞处理与协作

遇到权限不足、模拟器/设备不可用、凭据或外部服务缺失、资料/决策缺失、测试环境不安全或无法取得真实验收证据时：
- 不要假装完成，不要用 mock 成功替代真实验收，也不要反复执行必然失败或可能破坏数据的操作。
- 先在对应 task、CASE、autonomous-blockers.md 和 current-execution-snapshot.md 记录：已确认事实、复现/验证命令及结果、受影响验收、具体缺少的权限/资料/决策/环境、需要用户完成的动作。
- 该分支暂停等待用户或外部条件；若仍有独立且安全的任务，继续推进，不因单一 blocker 停掉整个目标。
- 若没有可继续的独立工作，清楚列出唯一需要用户完成的具体事项后暂停，不要自行创造替代方案并宣称通过。
- 需要用户决定产品规则时，提出最少量、带推荐项和影响的选择；纯工程常规选择可自行处理并说明依据。

保护数据和外部资源：运行测试前检查测试目标库及测试 setup。任何会清表、重置、覆盖用户数据、调用收费/真实供应商、上传真实用户数据或影响外部服务的操作，先确认影响范围；未经明确授权不得执行。尤其不得在含用户数据的开发库上运行会执行 reset 的 e2e。凭据只核验是否配置，不打印密钥或完整连接串。

三、工作优先级

1. 先审计并继续收口当前仍未闭环的 CRE-005、DIA-005、DIA-006；以最新 decision register 和证据确认各自是否被真实 blocker 阻塞，不沿用旧结论。
2. 若某项确实依赖用户、外部环境或待决策规则，先登记 blocker，再按 docs/reference/delivery/README.md 的依赖顺序继续其他可推进任务。
3. 优先选择能形成真实业务逻辑、领域/服务/仓库约束、实际测试和验收证据，且不越界修改正式前端 UI/UX 的工作。

四、正式 UI/UX 与实现边界

前端 UI/UX 已定型。禁止为了验收、截图或测试便利修改正式页面的样式、布局、文案层级、交互参数、按钮状态、反馈方式、可见入口、路由行为或用户路径。补证据优先使用现有测试、领域层/仓库层/服务层验证、独立测试文件及不侵入正式页面的方法。

严格采用最小必要改动；不得为方便测试把验证开关、临时入口或调试参数带入正式用户路径。不得未经授权新增或改变任何前端可见行为。

五、交付、测试与进度记录

每完成一段实现，都要同步更新：
- 对应任务文档及同名 CASE
- docs/reference/delivery/reports/autonomous-progress.md
- docs/reference/delivery/reports/autonomous-acceptance-matrix.md
- docs/reference/delivery/reports/autonomous-blockers.md
- docs/reference/delivery/reports/current-execution-snapshot.md

运行与本次改动对应的真实验证命令，记录逐例结果和环境；若测试会重置数据库或其他持久状态，使用明确隔离的临时目标库。测试失败就保留失败事实并修复根因，不得删除/弱化断言或伪造通过。没有实际运行的验证要明确标注“未运行”。

每轮开始重新计算进度：以 coverage.md 的当前有效验收总数和 acceptance matrix 中明确“已通过”的项目为口径，写出分子、分母、百分比、日期及计算方式。只有已通过计入完成；partial、阻塞、待决策、未执行均不算通过。若矩阵不完整或口径无法核实，报告区间/估算及不确定性，不沿用提示词、handoff 或旧对话里的百分比。

汇报时简述本轮改动、实际验证、尚未解决的 blocker、需要用户处理的事项和下一步。全局目标只有在当前仓库证据证明所有要求均已完成后才能标记完成；部分完成或等待外部条件时保持目标未完成。
```
