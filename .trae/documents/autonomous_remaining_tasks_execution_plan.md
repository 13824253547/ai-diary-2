# 剩余任务自动推进计划

## Summary

- 目标：在**不改现有 UI/UX** 的前提下，继续推进仓库中剩余的真实业务实现、测试和验收；遇到未决规则、外部环境或凭据问题时**不停止**，而是记录阻塞并继续推进其他明确任务。
- 执行方式：按依赖顺序分批推进，每一批都走“实现 -> 替身测试 -> 集成测试 -> 验收记录 -> 修复回归 -> 下一批”闭环，直到：
  - 所有任务都已有验收结果，或
  - 所有未能继续推进的问题都已被结构化收录。
- 当前起点：第一阶段仅完成了 `BAS-001` / `BAS-004` 的部分代码与文档基础；任务文档状态尚未同步，后端、真实持久化、真实相册、真实 AI、真实文件交付和真实端到端联调仍未开始。

## Current State Analysis

### 已有进展

- 测试基础已补了一部分：
  - [`jest.config.js`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/jest.config.js)
  - [`jest.setup.js`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/jest.setup.js)
  - [`src/store/__tests__/diary-domain.spec.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/store/__tests__/diary-domain.spec.ts)
  - [`src/contracts/__tests__/core-diary-contract.spec.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/contracts/__tests__/core-diary-contract.spec.ts)
  - [`src/components/navigation/__tests__/bottom-tabs.spec.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/components/navigation/__tests__/bottom-tabs.spec.ts)
- store 已具备工厂化雏形：
  - [`src/store/create-app-store.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/store/create-app-store.ts)
  - [`src/store/use-app-store.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/store/use-app-store.ts)
- 契约与执行基线已建立：
  - [`docs/reference/delivery/contracts/core-diary-v1.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/contracts/core-diary-v1.md)
  - [`docs/reference/delivery/reports/phase-1-baseline.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/reports/phase-1-baseline.md)

### 当前事实

- [`src/config/app-config.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/config/app-config.ts) 仍是 `mode: 'mock-only'`。
- 仓库根目录**没有 `backend/`**，也没有后端 `docker compose`、数据库 schema、Redis 队列、服务适配层。
- [`docs/reference/delivery/README.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/README.md) 仍写着“任务未开始，测试案例未执行”，和当前真实状态不一致。
- 42 份任务文件里，绝大多数状态仍是“未开始”；也就是说，**代码基础有了，但任务状态、执行证据和验收闭环远未同步**。
- 当前工作区有未提交修改，执行时必须保留，不得回滚或清理无关改动。

### 剩余任务概览

按实施索引与任务总表，剩余工作实质上覆盖全部 42 个任务，只是优先级不同：

1. 基础层：
   - `BAS-001`、`BAS-002`、`BAS-003`、`BAS-004`、`NAV-001`
2. 核心日记链路：
   - `CRE-001`~`CRE-006`
   - `DIA-001`~`DIA-006`
3. 隐私/分享/素材/明信片：
   - `SHR-001`~`SHR-005`
   - `MAT-001`~`MAT-005`
   - `PCD-001`~`PCD-002`
4. 陪伴/发现/成长：
   - `PET-001`~`PET-002`
   - `DSC-001`~`DSC-003`
   - `GRW-001`~`GRW-006`
5. 端到端交付：
   - `INT-001`

### 已知阻塞类型

- 业务待决策：
  - `Q-001`、`Q-002`、`Q-003`、`Q-004`、`Q-005`、`Q-006`、`Q-007`
  - `Q-008`、`Q-009`、`Q-010`、`Q-011`、`Q-012`、`Q-013`、`Q-014`
  - `Q-015`、`Q-016`、`Q-018`
- 环境/外部条件：
  - 本地尚无 `backend/`
  - 无 MySQL / Redis / Docker Compose
  - 无真实 AI 服务凭据
  - 无真实 iOS 权限和相册证据
  - 无真实平台分享/导出交付环境

这些阻塞**不构成停止条件**；执行时应先完成不依赖这些条件的明确验收，再把剩余项写入阻塞台账。

## Assumptions & Decisions

### 固定执行约束

- 不修改既有 UI/UX 设计、尺寸、样式、定型交互和用户可见结构。
- 保留现有未提交改动，不能因推进任务而清理工作区。
- 不以 mock 成功、删断言、弱化验收、跳过失败用例来制造“通过”。
- 任何真实服务、持久化、文件导出、平台交付都必须有实际证据；没有环境时明确记为阻塞。

### 自动推进总原则

1. **先依赖，后功能。**
2. **先核心链路，后衍生能力。**
3. **先能明确验收的部分，遇到待决策只阻塞对应 AC/CASE。**
4. **每轮都输出结果：通过、失败、阻塞、待决策，不留“处理中但无记录”的状态。**

### 默认技术路线

- 后端：`NestJS + Prisma + MySQL + Redis + BullMQ`
- 本地环境：`backend/docker-compose.local.yml`
- 前端接入：以 `src/contracts/core-diary-contract.ts` 为前后端共享边界，新增客户端 repository / service 适配层，不继续直接把 mock store 当真实实现。
- 测试分层：
  - 替身测试：Jest + 领域/组件/契约
  - 真实集成：本地 Docker + 后端 e2e + 真文件
  - 人工评测：只保留必须人工判断的视觉/内容质量项

## Proposed Changes

### A. 先把“执行控制面”补齐

#### 1. 同步任务状态、执行报告和阻塞台账

- 处理文件：
  - `docs/reference/delivery/tasks/*.md`
  - `docs/reference/delivery/test-cases/*.md`
  - `docs/reference/delivery/README.md`
  - `docs/reference/delivery/reports/phase-1-baseline.md`
  - 新增 `docs/reference/delivery/reports/autonomous-progress.md`
  - 新增 `docs/reference/delivery/reports/autonomous-blockers.md`
  - 新增 `docs/reference/delivery/reports/autonomous-acceptance-matrix.md`
- 做法：
  - 把已完成的 `BAS-001 / BAS-004` 基础进展回填到任务状态和执行报告；
  - 建立统一的“通过 / 失败 / 阻塞 / 待决策 / 未执行”记录格式；
  - 后续每完成一批任务就增量更新这些报告。
- 目的：
  - 让长时间无人值守推进可审计；
  - 防止后续实现很多但没有验收闭环。

#### 2. 补全 BAS-004 的剩余要求

- 处理文件：
  - `src/test-utils/fakes/*`
  - `src/test-utils/reporting/*`
  - `src/store/__tests__/*`
  - `src/contracts/__tests__/*`
  - `package.json`
  - `tools/run-domain-tests.js`
- 做法：
  - 完成故障注入、测试有效性证明、CASE 报告输出；
  - 补齐真实/替身/人工三类执行报告结构；
  - 增加“故意引入错误会失败”的验证用例与记录。
- 依赖：
  - 无外部阻塞，可优先完成。

### B. 建真实基础设施，再推进核心链路

#### 3. 创建后端工程与本地环境

- 计划新增：
  - `backend/package.json`
  - `backend/src/main.ts`
  - `backend/src/app.module.ts`
  - `backend/src/modules/*`
  - `backend/prisma/schema.prisma`
  - `backend/docker-compose.local.yml`
  - `backend/test/*`
- 首批模块：
  - `identity`
  - `photos`
  - `drafts`
  - `generation`
  - `diaries`
  - `memories`
  - `sharing`
- 做法：
  - 先把 `BAS-002` 所需访问身份、隔离、API 基座和 `BAS-003` 所需持久化骨架落地；
  - 使用设备安装级匿名身份作为 V1 默认方案；
  - MySQL 管结构化数据，Redis 管任务与幂等。
- 目的：
  - 给 `CRE/DIA/SHR/MAT/PET/DSC/GRW` 提供真实服务基础。

#### 4. 前端接入真实 repository / service 边界

- 计划新增/调整：
  - `src/services/*`
  - `src/repositories/*`
  - `src/store/adapters/*`
  - `src/contracts/*`
  - `src/config/app-config.ts`
- 做法：
  - 保留当前 UI 和 store 壳层；
  - 把照片读取、生成、保存、检索、分享投影、聊天、发现、成长数据读写都迁到可切换适配器；
  - mock 只保留为替身测试或降级环境，不再是主业务通路。

### C. 按依赖顺序批量推进任务

#### 批次 1：基础闭环

- 任务：
  - `BAS-001`
  - `BAS-004`
  - `BAS-002`
  - `BAS-003`
- 目标：
  - 契约、测试、访问身份、持久化、照片资产、基础 API 全部成型。
- 结果要求：
  - 能支撑核心日记链路从前端调真实后端；
  - 相关 CASE 至少有替身和本地集成两层结果。

#### 批次 2：核心日记链路

- 任务：
  - `CRE-001`、`CRE-002`、`CRE-003`、`CRE-004`、`CRE-005`、`CRE-006`
  - `DIA-001`、`DIA-002`、`DIA-003`、`DIA-004`、`DIA-005`、`DIA-006`
  - `NAV-001`
- 重点文件：
  - `app/permission/photos.tsx`
  - `app/album/select.tsx`
  - `app/create/generating.tsx`
  - `app/companion/naming.tsx`
  - `app/diary/[id]/edit.tsx`
  - `app/diary/[id]/edit-text.tsx`
  - `app/(tabs)/memories.tsx`
  - `src/hooks/use-diary-flow.ts`
- 目标：
  - 跑通“照片 -> 生成 -> 编辑 -> 保存 -> 回忆”真实链路；
  - 先实现不受待决策阻塞的 AC；
  - 对 `Q-002/Q-003/Q-008/Q-009/Q-018` 影响的 AC 单独记阻塞。

#### 批次 3：隐私、素材、明信片

- 任务：
  - `SHR-001`~`SHR-005`
  - `MAT-001`~`MAT-005`
  - `PCD-001`~`PCD-002`
- 重点文件：
  - `app/share/privacy.tsx`
  - `app/share/result.tsx`
  - `app/library/index.tsx`
  - `app/postcard/index.tsx`
  - `src/store/diary-domain.ts`
- 目标：
  - 先完成内容投影、匿名、预览、素材真实读写、明信片生成等可明确部分；
  - 平台导出、正式分辨率、真实第三方交付若缺环境，则保留文件证据或记录阻塞，不停止。

#### 批次 4：陪伴、发现、成长

- 任务：
  - `PET-001`~`PET-002`
  - `DSC-001`~`DSC-003`
  - `GRW-001`~`GRW-006`
- 重点文件：
  - `app/(tabs)/discover.tsx`
  - `app/discover/[id].tsx`
  - `src/components/profile/*`
  - `src/mocks/discovery.ts`（迁移替身角色，不保留为真实来源）
- 目标：
  - 基于真实留存数据实现聊天、记忆概览、发现列表与详情、成长统计与锚点链路；
  - 对 `Q-005/Q-006/Q-007/Q-016` 影响的算法与正式预期，单独阻塞。

#### 批次 5：端到端验收

- 任务：
  - `INT-001`
- 目标：
  - 依照 `J-01 ~ J-06` 串联真实链路；
  - 输出统一端到端证据、缺陷与复测记录。

### D. 自主循环策略

#### 5. 每轮执行流程

每一轮都严格按下面顺序：

1. 读取当前批次任务、案例、引用规格和未决 Q。
2. 实现所有不受阻塞的验收条件。
3. 生成或补齐对应测试代码。
4. 执行：
   - `typecheck`
   - 相关 Jest 套件
   - 后端单测 / e2e
   - 可做的真实集成命令
5. 将结果写入：
   - `autonomous-progress.md`
   - `autonomous-acceptance-matrix.md`
   - `autonomous-blockers.md`
6. 若有失败且不依赖外部决策/环境，则立即进入下一轮自主修复。
7. 若只剩环境/规则阻塞，则继续推进下一个任务批次。

#### 6. 阻塞记录规范

每个阻塞至少记录：

- 任务 ID / 验收 ID / CASE ID
- 阻塞类型：`待决策` / `环境缺失` / `外部凭据` / `真实设备缺失` / `实现缺陷`
- 具体缺失内容
- 已完成到哪一步
- 下一次恢复时应先做什么

## Minimal Execution Steps

1. 回填 `BAS-001 / BAS-004` 当前真实进度到任务和报告。
2. 完成 `BAS-004` 剩余测试报告与故障注入要求。
3. 创建 `backend/`，接入 NestJS、Prisma、MySQL、Redis、本地 Docker。
4. 落 `BAS-002` 访问身份与 API 基座。
5. 落 `BAS-003` 草稿、日记、照片资产和回忆读模型持久化。
6. 推进 `CRE-001 ~ DIA-006 + NAV-001`，打通核心日记主链路。
7. 对主链路做替身测试、本地集成测试、可行的真实验收；修复失败再复测。
8. 推进 `SHR / MAT / PCD`。
9. 推进 `PET / DSC / GRW`。
10. 执行 `INT-001`，汇总最终通过项与未解决问题清单。

## Verification

### 当前已存在的验证入口

```bash
npm run typecheck
npm run test:domain
npm run test:ui
npm run test:contracts
node tools/run-domain-tests.js
```

### 基础设施完成后应新增

```bash
docker compose -f backend/docker-compose.local.yml up -d mysql redis
npm --prefix backend run test
npm --prefix backend run test:e2e
```

### 自动推进期间的统一验证矩阵

```bash
npm run typecheck
npm run test
npm --prefix backend run test
npm --prefix backend run test:e2e
```

### 验收完成条件

- 任务至少具备以下之一：
  - 已通过的替身测试 + 已通过的集成/真实证据
  - 明确的待决策/环境阻塞记录
- 最终必须能形成：
  - 已通过任务清单
  - 失败但可继续修复的任务清单
  - 明确阻塞与恢复建议清单

## Expected Deliverables

执行完成后，至少应新增或持续维护这些文档：

- `docs/reference/delivery/reports/autonomous-progress.md`
- `docs/reference/delivery/reports/autonomous-blockers.md`
- `docs/reference/delivery/reports/autonomous-acceptance-matrix.md`

以及：

- `backend/` 完整工程
- 各任务对应的测试代码
- 真实环境或本地集成执行证据

## No Open Questions For Planning

当前没有阻塞本次计划输出的必要问题。

用户已经明确要求：

- 继续推进，不停下来等确认
- 遇到问题先跳过并记录
- 任务处理完后继续测试和验收
- 若发现问题，再进入下一轮自主开发，直到全部通过或全部阻塞被收录

因此本计划不再额外向用户发起实现前澄清。
