# 开发环境诊断日志

本系统只用于本地开发，不是产品分析或远程遥测。前端仅在 Expo `__DEV__` 下写入结构化事件；后端仅在 `NODE_ENV=development` 下记录 HTTP 请求。生产环境不生成这些诊断事件，也不会发送到第三方。

## 启动与采集

```sh
npm run start:dev-client
npm --prefix backend run start:dev
npm run diagnostics:collect -- --lines 200
```

`start:dev` 是单次启动；修改后端源码后需手动重启。需要保存文件后自动重启时，改用：

```sh
npm --prefix backend run start:watch
```

`start:watch` 保留相同的开发数据库、Redis、终端日志和 `.dev-logs/backend.log`，并通过当前 Node 的原生 watch 模式重启后端进程。

采集命令默认读取已启动的 iOS 模拟器、Metro 日志和后端请求日志。指定模拟器并附加最近 10 分钟的 iOS 原生日志：

```sh
npm run diagnostics:collect -- --simulator <UDID> --lines 300 --native
```

复现问题后直接运行采集命令，输出可由开发工具读取，无需从终端复制日志。App 首次启动或重新加载 JavaScript 后，才会开始产生客户端事件。

## 日志位置与范围

- App 沙盒 `Documents/orange-glow-diagnostics.jsonl`：启动/恢复阶段、未处理 JS 异常、身份初始化、HTTP 请求、宠物聊天 SSE 首片段与完成/失败、相册读取失败。最多保留当前 256 KB 和一个轮转文件。
- 仓库 `.dev-logs/backend.jsonl`：后端 HTTP 请求关联 ID、归一化路由、状态码和耗时；最多保留当前 512 KB 和一个轮转文件。
- 仓库 `.dev-logs/metro.log`、`.dev-logs/backend.log`：开发服务启动/构建错误与结构化诊断事件，不保存一般 App `console` 输出；每个文件最多 4 MB 后轮转。
- `.dev-logs/` 已加入 `.gitignore`，日志只留在本机。

前后端通过 `x-request-id` 关联同一 HTTP 请求。允许字段使用白名单；不记录日记/聊天正文、请求/响应 body、照片 URI、相册名称、设备 ID、身份凭证、Authorization、Cookie 或 IP。URL 查询参数会去除，资源 ID 会归一化。

客户端请求失败事件额外记录 `bodyKind`（`none`、`text`、`multipart`、`binary`）与 `failureStage`（`headers`、`fetch`、`response_body`），用于区分身份请求头准备、原生网络发送和响应解析阶段；不会记录 multipart 字段、照片数量或文件内容。

`--native` 是显式选项，会额外读取该模拟器最近 10 分钟、仅限 `AIDiary2` 进程的 iOS 统一日志；只在诊断原生异常时启用。
