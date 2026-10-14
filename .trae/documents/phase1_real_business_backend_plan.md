# 第一阶段真实业务实施计划

## Summary

- 目标：在**不改 UI/UX** 的前提下，先完成第一阶段两项基础工作：
  - `BAS-004`：把当前测试基线整理成可持续扩展的真实实施测试环境，并保留现有 15 个领域场景。
  - `BAS-001`：为后续“照片 -> 生成 -> 编辑 -> 保存 -> 回忆”主链路补齐业务决策边界与接口契约。
- 本阶段只做**测试底座 + 契约与决策收口**，不提前把 `BAS-002/BAS-003` 的真实后端与持久化实现伪装为已完成。
- 后续真实业务实现的推荐后端方案：`NestJS + MySQL + Redis + Docker`，后端项目放在仓库根目录新增 `backend/`。

## Current State Analysis

### 已确认的仓库现状

- 仓库当前是 Expo / React Native 前端原型，`src/config/app-config.ts` 明确标注 `mode: 'mock-only'`。
- 当前**没有后端工程**、没有 `docker-compose`、没有 API 客户端/服务适配层、没有远程持久化边界。
- 业务状态集中在 [`src/store/use-app-store.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/store/use-app-store.ts)，并直接依赖 `src/mocks/*`。
- 纯领域规则主要在 [`src/store/diary-domain.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/store/diary-domain.ts)，这里已经沉淀了部分值得保留的业务规则：
  - 至少 3 张照片才能生成
  - 旧轮生成回调不能覆盖新状态
  - 分享投影必须经过 `projectDiaryForSharing`
  - 私密内容不能直接外发
- 主要 UI 页面已经把流程跑通，但都还是前端模拟：
  - [`app/permission/photos.tsx`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/app/permission/photos.tsx)
  - [`app/album/select.tsx`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/app/album/select.tsx)
  - [`app/create/generating.tsx`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/app/create/generating.tsx)
  - [`app/diary/[id]/edit.tsx`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/app/diary/[id]/edit.tsx)
  - [`app/(tabs)/memories.tsx`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/app/%28tabs%29/memories.tsx)

### 当前可执行测试与类型基线

- `npm run typecheck`：当前通过。
- `node tools/run-domain-tests.js`：当前通过，保留了 15 个领域/状态场景。
- 现有回归入口：
  - [`tools/diary-domain.test.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/tools/diary-domain.test.ts)
  - [`tools/run-domain-tests.js`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/tools/run-domain-tests.js)

### 当前测试环境缺口

- `package.json` 已安装 `jest` / `jest-expo` / `@testing-library/react-native`，但**没有 Jest 配置文件，也没有测试脚本**。
- 现有 15 个场景依赖自定义 Node 转译运行器，不方便按 `CASE / 验收ID` 产出统一报告。
- `useAppStore` 目前是单例 store，虽然现有脚本里手动 reset 了状态，但后续做组件测试、契约测试、集成测试时还不够稳。
- 当前没有故障注入层，无法系统性覆盖：
  - 超时
  - 乱序/重复回调
  - 写失败
  - 权限撤回
  - 响应丢失

### 当前实现与第一阶段任务的差距

- `BAS-004`：有种子测试，但还不是完整测试环境。
- `BAS-001`：有任务、案例、决策登记，但还没有“可直接驱动后端与客户端实现”的版本化契约文档。
- `CRE-001/002/005`、`DIA-002/005/006` 的真实实现边界都还没从 mock store 里抽出来。

### 当前工作区注意事项

- `git status --short` 显示：
  - `package.json`
  - `package-lock.json`
  已有未提交修改。
- 第一阶段实施时必须**保留并兼容这些现有改动**，不能覆盖或回滚。

## Recommended Technical Approach

### 前端测试底座

- 保留当前 15 个领域场景作为回归基线，不删、不降级。
- 正式测试框架统一为：
  - `Jest`
  - `jest-expo`
  - `@testing-library/react-native`
- 将 store 改为“**工厂 + 单例包装**”：
  - 新增 `src/store/create-app-store.ts`
  - `src/store/use-app-store.ts` 保留为运行时单例壳层
- 可注入依赖至少包括：
  - 时钟
  - ID 生成器
  - 本地存储
  - 照片权限适配器
  - 照片读取适配器
  - 生成服务适配器
  - 保存仓库适配器
  - 回忆查询适配器

### 契约与业务边界

- 在 `docs/reference/delivery/` 下新增契约文档目录，先覆盖第一阶段主链路需要的对象与接口：
  - 草稿 `Draft`
  - 已保存日记 `Diary`
  - 照片资产 `PhotoAsset`
  - 生成任务 `GenerationJob`
  - 局部重写任务 `RewriteJob`
  - 提交保存 `SaveDraft`
  - 回忆检索 `MemoriesQuery`
  - 错误/冲突/幂等/取消语义

### 后端推荐方案

- 后端项目：仓库根目录新增 `backend/`
- 技术栈：
  - `NestJS`
  - `MySQL`
  - `Redis`
  - 本地环境：`Docker Compose`
- 推荐配套：
  - ORM：`Prisma`
  - 异步任务：`BullMQ`
  - HTTP 契约测试：`Jest + Supertest`
- 角色分工：
  - `MySQL`：日记、草稿、人物、公开范围、回忆索引等持久数据
  - `Redis`：生成任务状态、幂等键、轮次去重、异步队列

## Assumptions & Decisions

### 本阶段已锁定的实施约束

- 不修改任何既有 UI/UX 结构、样式、尺寸、文案排布。
- 只以本仓库现有文档和代码为依据，不引入外部项目约定。
- 测试报告必须区分：
  - 替身测试
  - 真实集成
  - 人工评测

### 推荐作为 V1 默认值、但仍保留待确认标签的业务决策

- `Q-001` 留存：
  - 推荐：**已保存日记走后端持久化；未提交草稿先支持本地恢复，不做跨设备草稿合并**。
  - 影响：可先打通 `DIA-005` 与 `BAS-003`，同时避免第一版就陷入冲突合并。
- `Q-002` AI 任务语义：
  - 推荐：**所有 AI 能力统一为异步任务模型**，以 `draftId + version + idempotencyKey` 识别；若供应商只能提供阶段事件，就展示阶段，不伪造完成百分比。
  - 影响：可统一覆盖 `CRE-005`、`DIA-002`、后续 `MAT-005 / PET-001 / GRW-006`。
- `Q-008` 改图与重生成：
  - 推荐：**新建草稿整篇换图必须失效旧结果；已保存作品的局部换图默认保留人工编辑文本，只有显式重生成才覆盖**。
  - 影响：能避免编辑态误覆盖用户手工内容。
- `Q-012` 访问身份：
  - 推荐：**V1 采用设备安装级匿名身份，不新增登录/VIP UI**。
  - 影响：足以支撑私有数据隔离和后端归属校验，不扩张到账号产品。
- `Q-018` 相册权限：
  - 推荐：**支持 full / limited / denied / revoked 四态；真实读取范围跟随系统授权，不把“最近 3 天”原型文案当作正式权限规则**。
  - 影响：可直接支撑 `CRE-001 / CRE-002` 的真实 iOS 接入。

### 本阶段不强行关闭的产品规则

- `Q-003` 照片上限、文本长度、空值边界
- `Q-004` 跨日/月/年归档与筛选口径
- `Q-007` 公开与发现的发布关系
- `Q-010` 跨作品人物记忆
- `Q-013/Q-014/Q-015/Q-016`

这些规则先在契约文档中明确“待决策范围”和“阻塞的验收/CASE”，不猜答案，不偷偷固化成代码。

## Proposed Changes

### A. `BAS-004` 测试环境与回归资产

#### 1. 保留并迁移现有 15 个领域场景

- 涉及文件：
  - [`tools/diary-domain.test.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/tools/diary-domain.test.ts)
  - [`tools/run-domain-tests.js`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/tools/run-domain-tests.js)
  - 新增 `src/store/__tests__/diary-domain.spec.ts`
- 处理方式：
  - 保留原 15 个场景的断言语义；
  - 迁移到 Jest 运行；
  - 给每条测试补充 `E01-E15` / `CASE` 注释或映射说明；
  - 在过渡期保留旧运行器，直到新套件稳定。
- 对应验收 / CASE：
  - `T-BAS-004-A01`
  - `T-BAS-004-A02`
  - `CASE-BAS-004-001`
  - `CASE-BAS-004-002`

#### 2. 抽离可注入 store 工厂

- 涉及文件：
  - 新增 `src/store/create-app-store.ts`
  - 调整 [`src/store/use-app-store.ts`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/src/store/use-app-store.ts)
  - 视需要新增 `src/store/adapters/*.ts`
- 处理方式：
  - 把直接依赖 mock、时钟、ID 的逻辑从单例里拆开；
  - 运行时仍暴露现有 `useAppStore`，避免 UI 页面改形；
  - 测试环境通过工厂注入故障、时序与替身服务。
- 对应验收 / CASE：
  - `T-BAS-004-A02`
  - `T-BAS-004-A03`
  - `CASE-BAS-004-002`
  - `CASE-BAS-004-003`

#### 3. 建立统一测试配置与报告入口

- 涉及文件：
  - 新增 `jest.config.ts`
  - 新增 `jest.setup.ts`
  - 新增 `src/test-utils/*`
  - 更新 [`package.json`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/package.json)
- 处理方式：
  - 增加统一测试脚本；
  - 区分领域/组件/契约/集成；
  - 让失败返回非零；
  - 输出最基础的 CASE 结果明细。
- 对应验收 / CASE：
  - `T-BAS-004-A01`
  - `T-BAS-004-A04`
  - `CASE-BAS-004-001`
  - `CASE-BAS-004-004`

#### 4. 补故障注入与“测试真有效”校验

- 涉及文件：
  - 新增 `src/test-utils/fakes/*`
  - 新增 `src/test-utils/reporting/*`
  - 补充 `src/store/__tests__/*`
- 处理方式：
  - 支持超时、取消、乱序回调、写失败、权限撤回；
  - 增加一条“故意引入错误会失败”的验证路径；
  - 明确人工项和阻塞项不会被 `skip` 掩盖。
- 对应验收 / CASE：
  - `T-BAS-004-A03`
  - `T-BAS-004-A04`
  - `T-BAS-004-A05`
  - `CASE-BAS-004-003`
  - `CASE-BAS-004-004`
  - `CASE-BAS-004-005`

### B. `BAS-001` 业务决策与接口契约

#### 5. 新增第一阶段核心契约文档

- 涉及文件：
  - 新增 `docs/reference/delivery/contracts/core-diary-v1.md`
  - 视需要新增 `docs/reference/delivery/contracts/examples/core-diary-v1.examples.md`
- 契约必须覆盖：
  - 对象结构：`Draft / Diary / PhotoAsset / Person / GenerationJob / SaveResult / MemoriesQueryResult`
  - 远程操作：权限读取、照片列表、生成、重写、保存、查询
  - 通用语义：空结果、失败、权限拒绝、取消、超时、幂等、版本冲突
  - 有效/无效示例
- 对应验收 / CASE：
  - `T-BAS-001-A02`
  - `T-BAS-001-A03`
  - `T-BAS-001-A04`
  - `CASE-BAS-001-002`
  - `CASE-BAS-001-003`
  - `CASE-BAS-001-004`

#### 6. 更新决策登记与任务链接

- 涉及文件：
  - [`docs/reference/delivery/decision-register.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/decision-register.md)
  - [`docs/reference/delivery/tasks/BAS-001.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/BAS-001.md)
  - [`docs/reference/delivery/tasks/BAS-002.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/BAS-002.md)
  - [`docs/reference/delivery/tasks/BAS-003.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/BAS-003.md)
  - [`docs/reference/delivery/tasks/CRE-001.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/CRE-001.md)
  - [`docs/reference/delivery/tasks/CRE-002.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/CRE-002.md)
  - [`docs/reference/delivery/tasks/CRE-005.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/CRE-005.md)
  - [`docs/reference/delivery/tasks/DIA-002.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/DIA-002.md)
  - [`docs/reference/delivery/tasks/DIA-005.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/DIA-005.md)
  - [`docs/reference/delivery/tasks/DIA-006.md`](file:///Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary/docs/reference/delivery/tasks/DIA-006.md)
- 处理方式：
  - 把已推荐但未最终确认的规则写成“建议默认值 + 阻塞范围”；
  - 给每个受影响任务补契约链接；
  - 不改验收含义，不删 CASE。
- 对应验收 / CASE：
  - `T-BAS-001-A01`
  - `T-BAS-001-A05`
  - `CASE-BAS-001-001`
  - `CASE-BAS-001-005`

### C. 为第二阶段真实后端实现预留稳定边界

#### 7. 明确后续后端工程目录与模块边界

- 计划新增目录：
  - `backend/`
  - `backend/src/modules/photos`
  - `backend/src/modules/drafts`
  - `backend/src/modules/diaries`
  - `backend/src/modules/generation`
  - `backend/src/modules/memories`
  - `backend/src/common`
  - `backend/test`
- 第一阶段只需要在契约文档中定义这些模块承接的接口，不提前把业务实现算完成。

## Minimal Execution Steps

1. 记录当前可运行基线：保留 `typecheck` 与现有 15 场景执行结果。
2. 新建 Jest 配置和测试脚本，让前端测试环境成型。
3. 拆出 `create-app-store`，把单例 store 改成可注入、可隔离测试的结构。
4. 把现有 15 个场景迁入 Jest，补足故障注入与 CASE 映射。
5. 新增第一阶段核心契约文档，覆盖“照片 -> 生成 -> 编辑 -> 保存 -> 回忆”主链路。
6. 更新决策登记与相关任务文档，明确推荐默认值、阻塞范围和受影响 CASE。
7. 产出第一阶段执行报告模板，后续每次实现都能附测试证据。
8. 第一阶段完成后，再进入 `BAS-002/BAS-003`，正式创建 `backend/`、接 MySQL/Redis、落真实 API 与持久化。

## Verification

### 当前已验证通过的基线命令

```bash
npm run typecheck
node tools/run-domain-tests.js
```

### 第一阶段实施完成后应具备的验证命令

```bash
npm run typecheck
npm run test:domain
npm run test:ui
npm run test:contracts
```

### 第二阶段开始后应补充的本地环境与后端验证命令

```bash
docker compose -f backend/docker-compose.local.yml up -d mysql redis
npm --prefix backend run test
npm --prefix backend run test:e2e
```

## Acceptance Mapping

- `BAS-004`
  - `A01/A02`：测试脚本、Jest 配置、15 场景迁移与隔离
  - `A03`：故障注入层
  - `A04`：执行报告格式
  - `A05`：故意引入错误的检出验证
- `BAS-001`
  - `A01`：决策与来源可追溯
  - `A02`：对象与字段契约
  - `A03`：服务/异步/幂等/取消语义
  - `A04`：AI 输入输出与评测维度
  - `A05`：已关闭 / 待关闭规则同步到任务与 CASE

## Blocking Status

- 当前**没有阻塞“输出第一阶段计划”**的问题。
- 真正进入实现前，若用户不先确认推荐默认值，最可能先阻塞的是：
  - `Q-001`
  - `Q-002`
  - `Q-008`
  - `Q-012`
  - `Q-018`
- 建议做法：第一阶段先把这些规则写进契约与决策登记，标注“推荐默认值 + 待确认”，再进入第二阶段实现。
