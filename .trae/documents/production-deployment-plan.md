# Orange Glow AI Diary 生产部署计划

## 摘要

将 NestJS 后端部署到 Ubuntu `152.32.225.67`，通过 Nginx 在 `https://www.comiaite.com/api` 提供 API，并在同域名 `/privacy-policy` 发布当前隐私协议草案的醒目标注版本。前端正式 API 地址改为该 HTTPS 地址，App Attest 切换至 production，并构建新的 iOS production 包供验证；不提交 App Store、不自动发布给用户。

计划保留现有 AI provider 配置及隐私协议正文，不修改其他正在进行的 AI 同意/UI 工作。唯一获准的后端源码修正是让 App Attest 限流识别本机 Nginx 转发的真实客户端地址；其余后端工作仅为部署与配置。

## 当前状态与约束

- 前端 `src/config/app-config.ts` 当前指向 `http://127.0.0.1:3001/api`。
- iOS `app.json` 和 `ios/AIDiary2/AIDiary2.entitlements` 当前 App Attest 环境均为 `development`；NestJS `NODE_ENV=production` 会拒绝 development attestation。
- 后端为 NestJS + Prisma/MySQL，生产需要 `DATABASE_URL`、服务端身份签名密钥、模型环境变量和照片持久存储目录。当前本地 `backend/.env` 没有数据库或 Redis 地址；密钥值未读取、复制或写入计划。
- 本地模型运行配置及图像 provider 实现指向火山方舟。部署按用户要求保留现有模型代码和配置，不替换 provider。
- `backend/src/modules/identity/identity.controller.ts` 使用 TCP socket 来源地址作 App Attest challenge 限流。Nginx 反代后所有请求会显示为本机地址；默认 20 次/小时可能变成所有设备共享额度。
- 本地无生产 Dockerfile、生产 Compose 或 Nginx 模板；Docker Buildx 可用，本机为 ARM64。生产镜像须在本机/非生产构建环境生成匹配服务器架构的 Linux 镜像，禁止在生产服务器构建。
- 工作区已有大量用户未提交改动。实现期间必须保留；只修改下文明确列出的目标文件，不整理或覆盖无关改动。
- 当前策略文档声称具体自研模型，而运行配置为火山方舟。用户要求不修改该政策正文，并同意以草案形式发布。因此网页必须醒目标注“草案、尚未生效、不得作为 App Store 正式隐私政策”；不得声称隐私披露和模型归属已核验。
- AI 同意实现目前存在用户并行改动，源码可见日记生成入口已调用 consent service，但聊天、AI 配图和洞察尚未检索到对应调用。删除设备身份及全部关联数据的后端流程也尚未找到。本计划不改这些并行功能，不把部署描述成 App Store 发布就绪；正式公开发版须等待相关任务完成和政策与真实服务一致。
- 服务器现有 Nginx、域名绑定、MySQL、Redis、Docker、磁盘与架构无法从本机配置推知。本地 SSH 公钥尝试失败，未尝试密码登录或进行任何服务器写操作；执行阶段须使用可用的授权访问方法。不得将口令放入脚本、仓库、镜像或日志。

## 部署方案

### 1. 服务器只读盘点与备份

先检查 Ubuntu 版本/架构、磁盘与内存、`www.comiaite.com` 的 DNS、现有 Nginx server blocks/证书、MySQL、Redis、Docker、已有站点与监听端口。

上线前备份相关 Nginx 配置和可能受影响的服务配置；记录现有服务状态及端口。不要覆盖、停止或迁移不属于本应用的站点和服务。

- 若 MySQL 已运行，保留现有数据库与服务，为本应用创建/确认独立数据库和最小权限账号；迁移前只读确认目标 schema，不清库、不运行 `db push`。
- 若 MySQL 不存在，使用隔离的私有容器和持久数据卷安装，数据库端口不映射到公网。
- 按用户明确要求检查 Redis；若无现存实例则以私有地址和持久卷安装。当前后端没有运行时 Redis 调用，计划不连接 Redis 执行业务，也不将其描述为应用必要依赖。
- 为当前生产数据库在首次 migration 前做一致性备份；若发现含有既有业务数据或无法确认用途，暂停 migration 并向用户报告，不覆盖数据。

### 2. 本地产出 Linux 部署包

新增后端 production Dockerfile、`.dockerignore` 和部署 Compose 配置。镜像使用锁文件执行生产依赖安装，生成 Prisma Client，并启动编译后的 NestJS 服务；目标平台按服务器实际架构选 `linux/amd64` 或 `linux/arm64`。服务仅绑定 Docker 私网，宿主机 API 端口只对本机 Nginx 开放。

镜像不包含 `.env`、provider 密钥、JWT 密钥或照片数据。通过受限权限的服务器运行时环境文件配置：

- `NODE_ENV=production`、内部 `PORT`、MySQL `DATABASE_URL`。
- 全新且唯一的 production `DEVICE_AUTH_JWT_SECRET`、当前 Bundle ID 和 Team ID；production App Attest 必须校验 production proof。
- 保留现有 PET Chat、日记生成和图片 provider 模式/模型。密钥从既有安全来源写入服务器的 `0600` 环境文件，不显示在终端、不进入 Git 或镜像。不做付费模型 smoke 请求，除非用户另行授权。
- `PHOTO_ASSET_STORAGE_DIR` 指向独立持久卷，确保素材、日记照片副本和生成图在容器替换后仍存在。

在部署端运行 `prisma migrate deploy`，不使用 `prisma db push`。检查 migration 状态与服务日志，但不打印密钥或请求正文。镜像从本机安全传输到服务器，不依赖生产服务器编译。

### 3. 唯一限流源码修正

修改 `backend/src/modules/identity/identity.controller.ts`：只有 socket 对端为 loopback 时才从 Nginx 转发头读取首个可信 client IP；非 loopback 连接忽略该头，避免客户端伪造来源。为可信/不可信代理来源增加定向测试。

Nginx 只监听公网 HTTP/HTTPS，后端只监听本机/私网。若执行前经单测/静态检查发现 Nest 对代理头解析方式需要调整，只限于这条 IP 解析边界；禁止增加全局 proxy trust 使任意请求头变可信。

### 4. Nginx、TLS 与静态隐私草案

按服务器现存配置择优添加独立应用配置，不覆盖其他域名：

- `www.comiaite.com/api` 透明转发至本机 NestJS `3001`，保持 `/api` path。
- 上传上限按当前生成请求设计设置约 55 MB。
- SSE/长任务关闭响应缓冲并设置匹配 Provider 最大时限的读取超时。
- 传递 Host、真实来源地址和 HTTPS scheme；身份限流以可信代理来源地址为依据。
- 若 DNS 已指向该机但无有效证书，签发/安装 Let's Encrypt 证书；若已有证书，先确认归属和续期方式后复用。启用 HTTPS 后再配置 HTTP 跳转。
- 以当前 `docs/reference/privacy-policy-self-developed-draft.md` 生成静态 HTML，不改动协议正文；页面最上方独立显示醒目的“草案 / 尚未生效 / 不可用于 App Store 提审”提示。路径 `/privacy-policy`。运营方、存储地区等现有占位内容保留，不冒充已核实事实。

保存 Nginx 变更前后的备份，执行 `nginx -t` 成功后才 reload；失败则恢复备份，不重启或中断无关站点。

### 5. 前端正式连接和 iOS 生产身份

只修改以下正式连接文件：

- `src/config/app-config.ts`：将 `backendBaseUrl` 改为 `https://www.comiaite.com/api`。
- `app.json` 与 `ios/AIDiary2/AIDiary2.entitlements`：将 App Attest environment 从 development 改为 production，并核对 EAS 最终签名 entitlements 与 App ID 配置一致。

不修改聊天、配图、洞察、AI同意流程、其它页面 UI 或隐私协议正文。API URL 变更会使现有绑定旧服务 URL 的本地 AI 同意记录重新提示，这是预期的重新确认，不迁移旧授权记录。

完成类型检查与构建后，生成新的 EAS iOS production binary；不提交 App Store、不自动上架。真实 App Attest 需要受支持的实体 iPhone 和 production-signed build；模拟器不能作为 production attestation 证据。

## 部署步骤

1. 在获授权 SSH 会话中检查域名 DNS/Nginx/证书、主机架构、Docker、MySQL/Redis、现有项目与磁盘容量；不输出任何凭据。
2. 备份可能涉及的服务器配置和目标数据库；确认 `www.comiaite.com` 不会覆盖其他现有站点。
3. 若数据服务缺失，按上文安装私有 MySQL/Redis；建立应用独立数据库及非 root 账号。若发现不可识别的既有数据或 DB schema，暂停并请求用户确认。
4. 在本地按服务器架构构建并校验 Linux image；写入安全 production 环境文件，上传镜像和必要部署文件。
5. 在备份后执行 Prisma `migrate deploy`，配置照片持久卷并启动后端；验证容器健康和 migration status。
6. 部署 `/api` Nginx upstream 与静态草案页；检测证书、`nginx -t`、HTTPS、SSE 和照片大文件转发后 reload。
7. 修改批准的 API URL 和 App Attest 环境，执行类型检查、bundle/App Attest配置校验并生成新的 EAS production build；不发布二进制。
8. 用不触发计费模型的 health/status 检查验证后端。真实 App Attest 注册、MySQL写入、上传照片、SSE、AI调用和相册流程只在用户授权的测试设备/账号上验证；付费 AI 调用需单独确认。
9. 汇报API、隐私草案URL、服务状态、migration、备份/回滚点及未通过项。保留既有进程和数据，不因单个 smoke 失败清理线上记录。

## 回滚与安全

- Nginx 先备份，修改后先 `nginx -t`；失败恢复原配置并 reload。
- 应用镜像以版本号固定，保留上一个镜像和 env 配置，服务异常可回滚容器。
- 数据迁移前备份；不自动回滚已应用的生产 migration，不执行清库或 schema drop。
- MySQL、Redis、文件存储均不开放公网直连；provider key 与 JWT secret 只保存在权限受限的服务器环境中。
- SSH口令已在对话中出现，执行部署前应按主机管理方流程轮换或使用授权密钥。计划、命令记录和日志不包含口令。

## 明确不在本计划中的事项

- 修改或“美化”为自研模型的隐私正文；本计划按用户指示不改，当前页面只以草案状态提供。
- 把第三方 Ark provider 描述成已确认自研模型；从仓库及本地运行配置检查到的事实与该声明不一致。
- 补齐聊天/配图/洞察 AI consent 和账号/设备数据删除功能；用户说明由其他任务处理。本次部署不等于这些功能已完成，也不构成 App Store-ready 声明。
- 中国大陆 App Store 发布、App Store Connect 元数据提交、TestFlight/App Store 自动上传或实际产品开放。
- 迁移其他应用、修改共享 Nginx 默认站点、开放数据库公网端口或清理服务器既有数据。

## 前置条件与待核实项

- 执行时必须取得可用 SSH 授权。只读公钥尝试未通过；未使用对话密码登录。
- 需要确认服务器现有站点、DNS、TLS、OS/CPU架构、数据库状态、备份可用性及可用磁盘。
- 若实际 Nginx 配置、域名证书或服务端数据与预期不符，先暂停对应步骤，不覆盖已有生产资源。
- `/privacy-policy` 在本计划中是带醒目草案标识的预览，不是 App Store 正式隐私政策 URL。
