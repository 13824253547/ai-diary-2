# 生成任务真实里程碑与加载展示计划

## Summary

重整日记生成任务的后端阶段和百分比，使其对应真实、可验证的工作边界；将关键里程碑历史返回给客户端，避免 3 秒串行轮询漏掉短暂阶段。加载页对关键工作节点至少展示 3 秒，所有百分比均使用后端产生的里程碑值平滑过渡；模型等待期间没有真实子进度时停留在“请求已提交”百分比，不按时间估算。成功快照到达后，等已排队的关键节点满足最短展示时间再导航。

## Current State Analysis

- `backend/src/common/memory-store.service.ts` 的 `processGenerationJob` 当前按固定点写 `analyzing-photos / 18`、照片读取后 `drafting / 45`、生成服务返回后 `structuring / 82`，随后立即写 `completed / 100`。
- 当前 `analyzing-photos` 写入早于照片读取；`drafting` 实际覆盖模型请求提交及等待完整响应；`structuring` 在 `DiaryGenerationService.generate()` 已完成解析、归一化和结构校验之后才写入，阶段语义与工作顺序错位。
- `backend/src/common/diary-generation.service.ts` 的兼容 Provider 使用一次完整的 `fetch` + `response.json()`，不是流式输出。等待 Provider 响应期间没有可验证的 token/百分比进度。
- `app/create/generating.tsx` 每次串行轮询只拿当前快照，3 秒内完成的中间状态可能被后续快照覆盖；当前 Store 只接收当前阶段和百分比，不能恢复已错过的阶段。
- `GenerationJob.stage` 在 Prisma 中是 String；API 阶段白名单、状态阶段组合、前端 `GenerationStage`、Store 阶段排序/兜底及任务回归均需同步更新。
- 本轮涉及文件已有未提交修改，包括 `backend/prisma/schema.prisma`、生成服务、MemoryStore、contract、Store、生成页及 CRE-005 文档。实施必须在这些最新内容上做最小增量，保留既有修改。

## Proposed Changes

### 后端里程碑和持久化

- `backend/src/common/memory-store.service.ts`
  - 将任务流程分为真实节点：排队 `0%`；照片清单与临时文件读取/校验完成 `15%`；模型请求已提交 `25%`；完整 Provider 响应已收到 `80%`；响应已解析、归一化且结构校验通过 `95%`；结果事务/任务结果已持久化 `100%`。
  - 百分比是“已完成业务里程碑”的权重，不是耗时比例。Provider 请求提交至完整响应返回期间停留在 `25%`，不得以模型等待时长插值或模拟子进度。
  - 失败/取消保留该轮已达成的最高百分比且不得标为 100%；任务完成才可写 100%。同一任务 Provider 自动重试不倒退进度、不重放已展示里程碑；用户开启新 generation job/round 时从 0% 开始。
  - 将阶段名称与阶段百分比映射集中定义并复用，避免 `memory-store`、Store fallback 和 contract 各自维护不一致常量。
- `backend/src/common/diary-generation.service.ts`
  - 为全文生成增加可选、服务端内部的进度回调，在 Provider 请求真正发起后、完整响应体收到后、结果完成解析/校验后分别报告事件；deterministic 测试适配器按相同语义报告其实际完成边界。
  - 不改变请求模型、模型参数、Provider 超时口径或输出 schema；保持四分钟从模型请求提交后起算。
- `backend/prisma/schema.prisma` 与新增 `backend/prisma/migrations/<timestamp>_generation_progress_milestones/migration.sql`
  - 为 `GenerationJob` 增加可选 JSON 里程碑历史字段，记录有限数量的 `{ milestoneId, stage, progressPercent, reachedAt, attemptCount }` 事件；历史用于轮询补发及跨进程恢复。
  - 历史仅保存任务状态元数据，不写入照片内容、模型原始文本或凭据。旧任务无历史时保持兼容，读取端回退使用其当前 stage/progress 快照。
- `backend/src/modules/generation/generation.controller.ts`、`backend/src/common/memory-store.service.ts` 与后端 contract 相关类型
  - 任务创建、查询和取消响应暴露可选 `progressMilestones` 数组；限制最大条数、字段和值域，非法数据不得返回为可信快照。

### 前端消费与可见流程

- `src/contracts/core-diary-contract.ts`
  - 为 generation job contract 增加向后兼容的可选里程碑数组，校验唯一 milestone ID、合法阶段/百分比、非递减顺序及时间戳；缺字段的旧服务响应仍可接受。
- `src/types/diary.ts`、`src/store/create-app-store.ts`
  - 更新 `GenerationStage`、fallback 百分比和阶段排序；Store 接收并合并服务端里程碑，不接受跨 job/round 的事件、重复事件或进度倒退。
  - 对没有里程碑历史的旧服务、夹具或 deterministic 结果，最多使用当前快照做兼容展示，不伪造历史步骤。
- `app/create/generating.tsx`
  - 将页面工作步骤改为真实关键环节：检查所选照片素材（15%）、模型创作中（请求提交后从 25% 等待，Provider 返回后进到 80%）、整理并校验结果（80%→95%）；任务持久化成功后到 100%。
  - 只对约定的关键工作环节应用每项至少 3 秒可见时间，不给每个中间数字或百分比逐项排队。百分比填充与数字仍平滑过渡到服务端里程碑值；无新里程碑时停止在已达值。
  - 若成功响应已到但关键节点仍在最短展示时间内，保留成功结果与导航意图，等待已排队节点展示完再导航；失败/取消不误等作成功，也不标 100%。离开页面或进入新轮次时取消旧计时与队列，沿用现有旧轮次隔离逻辑。

### 测试与项目记录

- `backend/src/common/memory-store.generation-task-lock.spec.ts`、`backend/src/common/diary-generation.service.spec.ts`、`backend/test/app.e2e-spec.ts`
  - 覆盖事件顺序、真实 Provider 回调边界、重试进度不倒退、持久化/读取历史、失败/取消不达 100%、旧任务兼容与同任务幂等。
- `src/contracts/__tests__/core-diary-contract.spec.ts`、`src/store/__tests__/diary-domain.spec.ts`、`app/__tests__/generating-screen.spec.tsx`
  - 覆盖轮询跨过多个状态时仍按关键节点展示、每节点不少于 3 秒、百分比只使用后端里程碑、完成后延迟导航、失败/取消、重试、新轮次重置、离页取消、没有 history 的旧快照回退及轮询仍严格串行。
- `docs/reference/delivery/contracts/core-diary-v1.md`、`docs/reference/delivery/tasks/CRE-005.md`、`docs/reference/delivery/test-cases/CRE-005.md`、`docs/reference/delivery/reports/development-progress.md`、`docs/reference/delivery/reports/current-execution-snapshot.md`
  - 记录新的里程碑字段、百分比语义、最短展示规则及本轮证据；不因定向测试通过而提升真实 Provider/设备 CASE 状态或验收通过数。

## Assumptions & Decisions

- 用户确认只保留少数关键真实节点各停留至少 3 秒；中间细粒度百分比不逐条排队。
- 用户确认模型调用无流式进度时按已完成里程碑更新百分比，不估算 Provider 等待阶段。
- 用户确认如果后端任务已完成但关键节点尚未展示满 3 秒，可延迟离开加载页，待展示完再导航。
- 计划建议的里程碑百分比为 `0 / 15 / 25 / 80 / 95 / 100`：分别代表排队、照片资产已读取校验、模型请求已提交、完整响应已收到、生成结构通过校验、结果已持久化。该百分比是完成节点的权重，不声称等于真实耗时占比。
- 真实 Provider 当前不支持本链路的流式输出；本轮不改为 SSE/streaming，不添加本地定时假进度。
- 现有模型时限 240 秒、串行 3 秒轮询、任务身份/幂等/取消/设备锁及既有 UI 版式保持不变。
- 不在规划阶段运行生成任务、触发付费 Provider、操作数据库或启动/停止用户服务。

## Verification

- 定向前端：core diary contract、diary domain、generating screen suites；使用可控时钟验证每个关键节点的 3 秒下限与成功延迟导航。
- 定向后端：diary generation service 与 generation task lock suites；验证回调只落在真实处理边界。
- 隔离数据库 e2e：在 `backend/test/e2e-database-safety.ts` 保护及明确注入 `E2E_DATABASE_URL` 后，验证 migration、生成任务里程碑历史持久化、轮询响应和旧任务兼容；不接触开发库。
- `npm run typecheck`、`npm --prefix backend run build`、Prisma migration/schema drift 检查及 `git diff --check`。
- 真实 Provider 与模拟器验收分别记录；未实际执行的证据不标通过。真实 Provider 无细粒度流式事件时，等待阶段百分比应稳定在模型请求提交节点。
