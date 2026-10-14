# 第一阶段执行基线

日期：2026-10-13

## 当前基线结果

| CASE / 范围 | 环境 | 结果 | 证据 |
| --- | --- | --- | --- |
| `BAS-004` 现有领域回归 15 场景 | 本地 Node + TypeScript 转译运行器 | 通过 | `node tools/run-domain-tests.js` |
| 类型检查 | 本地 TypeScript | 通过 | `npm run typecheck` |
| `BAS-004` 领域回归 15 场景（Jest） | 本地 Jest | 通过 | `npm run test:domain` |
| `BAS-004` UI 路由映射基线 | 本地 Jest | 通过 | `npm run test:ui` |
| `BAS-001` 契约样例与异步语义 | 本地 Jest | 通过 | `npm run test:contracts` |
| `BAS-001` 文档/契约初始核对 | 本地文档审阅 | 已建立第一版契约 | `docs/reference/delivery/contracts/core-diary-v1.md` |

## 当前仍未完成

| 范围 | 状态 | 说明 |
| --- | --- | --- |
| 真实后端服务 | 未开始 | 第一阶段不把 `BAS-002/BAS-003` 伪装为已完成 |
| 真实持久化证据 | 未开始 | 需第二阶段接入 `NestJS + MySQL + Redis` |
| 真实相册/真实 AI 集成 | 未开始 | 本阶段只先完成测试底座与契约收口 |

## 第一阶段完成时应补充

- 继续补充更多 `CASE / 验收ID / 环境 / 结果 / 证据` 的逐条报告
- 第二阶段开始后增加真实环境阻塞、失败与人工评测记录
