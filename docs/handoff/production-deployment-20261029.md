# 生产部署交接

日期：2026-10-29。产品显示名称：AI旅行日记。部署项目标识仍为`orange-glow`。

## 当前认证过渡方案（2026-10-29）

- 用户授权暂不使用 App Attest；当前线上为 `DEVICE_IDENTITY_MODE=installation`，前端 `identityMode=installation`。独立安装 Ed25519 私钥存 Keychain，服务端分配身份，一次性挑战+签名换取一小时 EdDSA JWT；分层限流、归属/tokenVersion/撤销校验保持启用，不采集硬件指纹、不使用共享长期通行证。未来 Apple 登录绑定设计见安装身份契约，尚未实现账号登录。
- 仍运行原镜像 `orange-glow-backend:20261029-01`，但 Compose 将 `identity-releases/20261029-installation-04/` 下六个已在本机编译的 JS 只读挂载到 `/app/dist/modules/identity/`。只替换认证模块；新业务、删除功能等其他并行任务不在本次线上发布中。无 schema 迁移，生产不构建。
- 初次 03 包：`13b7b75dd5fff0d4b6b38c22940a485b7f186525e3bb9f88cfd6dde72276e99f`；修复 MySQL 首次 upsert P2002 后的 04 包：`126531998dd77bfe0eec8fb86456f500a8c8d43daa0b48652b406085c6a84fcd`。新安装并发读取 20/20 HTTP 200；挑战/交换/续期 201，身份/回忆/素材/聊天读取 200，缺凭证/替换 owner/重放 401。两个独立烟测身份已精确撤销，不包含用户照片/模型调用。
- 原环境与 Compose 先备份到本机 `/tmp/orange-glow-installation-ops-ARVtXg/` 受限目录；服务器 `backups/installation-20261029-installation-03/` 保存 App Attest-only 原配置，`backups/installation-20261029-installation-04/` 保存上一个安装认证配置，环境/Compose 均 0600。新私钥仅在服务器生成，更新时不轮换。
- 完整回滚恢复 03 备份的 `backend.env` 与 `compose.production.yml`，只重建 backend；回滚并发补丁则恢复 04 备份。均不还原/删除数据库；App Attest-only 原代码会拒绝安装凭证。后续发布完整新镜像时必须备份并移除六个挂载，否则旧文件覆盖新镜像。运维脚本更新需显式给出 `PREVIOUS_INSTALLATION_RELEASE`，并校验全部旧挂载。
- ExpoCrypto 已加入依赖，新的 iPhone 17 模拟器开发包已本地编译/安装；终端 Metro 8081 运行中。App 完成真实 HTTPS 注册，重启后从 Keychain 恢复，素材/回忆/聊天/锚点摘要 200，首页显示真实空态。正式 EAS 包仍需用户重新构建以包含新原生模块；未执行 EAS 发布或真机计费业务验收。
- 首次模拟器启动触发现有旧本地草稿恢复同步；现已按服务地址+服务端身份隔离草稿缓存，保留旧快照，不再自动恢复到新身份。最后盘点生产草稿 19、已保存日记 0、有效安装身份 1；未删除这些草稿，不能沿用此前“生产空库”结论。没有上传照片或调用计费模型。
- 本轮未更改 Nginx、隐私 HTML 或其他业务模块。后端/MySQL/Redis healthy，隐私页 200。细节及限额见 `docs/reference/delivery/contracts/installation-identity-v1.md`；专项证据不代表全业务或 Apple 登录验收。

## 部署目标与状态

- 主机：`152.32.225.67`，Ubuntu 24.04，x86_64，约1GB内存、19GB根盘。
- API：`https://www.comiaite.com/api`，后端已上线并通过Nginx提供服务；未经有效production设备认证的业务请求返回401。
- 隐私草案：`https://www.comiaite.com/privacy-policy`，HTTPS返回200，明确标注草案、尚未生效、不能用于App Store。
- 现有主页和`/soul-haven/`保持原服务，修改后仍返回200。
- 原域名证书复用：DigiCert证书，包含`comiaite.com`及`www.comiaite.com`，2027-01-09到期。本次未替换证书，需按原管理方式及时续期。
- 未迁移开发库的日记、照片、聊天、设备身份或本地JWT密钥；生产创建独立数据库及新身份签名密钥。
- AI provider模式与凭据从当前服务器端配置的安全来源保留。没有将运行服务认定为自研；隐私正文按用户要求不改，页面只作为明确草案预览。

## 服务与目录

应用目录：`/opt/orange-glow`。

- `compose.production.yml`：独立项目`orange-glow`，不管理其他项目。
- `backend.env`、`mysql.env`：权限0600，禁止复制到公开网页、日志或Git。
- `.env`：仅发布镜像标签。
- `photo-assets`：图片持久目录，UID/GID1000，权限0750。
- `generation-tmp`：生成临时目录，2小时默认TTL、5分钟扫描；不是已保存照片目录。
- 数据库：MySQL8.4，独立schema`orange_glow`，独立非root业务用户；仅`127.0.0.1:33307`可访问。
- Redis7.4：仅`127.0.0.1:36380`可访问。当前业务代码没有运行时Redis依赖，按用户要求安装。
- 数据库和Redis使用独立Docker持久卷。不得执行`down -v`或清理卷。
- 后端使用host网络，部署入口绑定`127.0.0.1:3001`，不公开3001端口。
- Nginx配置：`/etc/nginx/nginx.conf`内增加HTTPS include；`/etc/nginx/orange-glow.locations.conf`仅管理本应用路径。
- 静态草案：`/var/www/orange-glow/privacy-policy.html`。

## 备份

修改服务器配置前已下载原始Nginx完整备份至本机受限临时目录，且服务器保留：

- `/opt/orange-glow/backups/nginx-before-20261029.tar.gz`。
- `/opt/orange-glow/backups/nginx.conf-before-20261029`。
- `/opt/orange-glow/backups/database-before-migrations-20261029.sql.gz`，0600；新schema为空时备份，gzip完整性验证通过。

这是首次部署备份，不代表已经配置周期备份或异地恢复服务。后续应独立规划数据库、图片卷和密钥的受限备份，不能仅备份数据库而遗漏图片。

## 本地修改

- `backend/Dockerfile.production`、`.dockerignore`及`backend/deployment/`：Linux镜像、本机监听启动入口、Compose、Nginx路径和草案模板。
- `backend/src/modules/identity/identity.controller.ts`：仅loopback对端可提供合法`X-Real-IP`；Nginx覆盖该头，非本机对端的伪造头无效。
- `src/config/app-config.ts`：正式HTTPS API。
- `app.json`、`ios/AIDiary2/AIDiary2.entitlements`：App Attest production。
- `tools/prepare-production-environment.js`：通过SSH stdin初始化全新运行时配置，拒绝覆盖已有环境，密钥不进入argv/输出。
- 其他正在进行的AI授权、聊天、成长、位置用途文案改动均保留，不由本次部署重写。

镜像标签：`orange-glow-backend:20261029-01`与`orange-glow-backend:20261029-01-migration`。镜像在本机Linux/amd64构建，生产不构建；Docker Official Node镜像由AWS公共镜像源取得，解决本机Docker Hub认证域名超时。

## iOS构建

首次EAS生产构建`10ac4ea6-f71d-48be-9771-268a659eb692`（build8）失败：旧App Store描述文件缺少App Attest entitlement。

通过已有Apple开发者登录会话确认当前项目App ID已启用App Attest，刷新现有`Y9U46534WW`描述文件，保留原分发证书；下载解析后确认允许production，并备份EAS原描述文件后同步新版。

此前重新发起的生产构建`e4e5c3fb-aea4-4c01-87cf-4607110fe212`已成功（1.0.0，build9）。用户随后明确前端打包和上架自行处理，本任务不再推进任何前端发布。未提交App Store或上传TestFlight。实体设备的首次attestation、相册、生成、分享等完整流程仍需验证，模拟器不支持真实production证明。

已有构建：[EAS build9](https://expo.dev/accounts/2317946738/projects/ai-diary/builds/e4e5c3fb-aea4-4c01-87cf-4607110fe212)。该包是先前发起时的代码快照，不保证包含其他并行任务之后的修改。

## 验证边界

- 可信代理和身份校验定向3 suites /16 tests通过。
- 前后端类型检查及差异格式检查通过。
- 镜像启动依赖检查成功，镜像内`.env`不存在。
- MySQL/Redis健康，数据库初始表数0；私有端口只监听loopback。
- Nginx配置检查成功；隐私草案200、UTF-8、no-cache与noindex；HTTP新增路径跳转HTTPS。
- 两个amd64镜像已完成导入，15条Prisma迁移全部成功，`prisma migrate status`确认up to date。后端、MySQL和Redis均healthy；日记与素材表初始行数均为0。
- `/api/identity/attestation/challenge`返回201；无效证明注册及无效JWT访问health返回401；没有为验证而关闭鉴权或伪造设备身份。
- 后端仅监听`127.0.0.1:3001`，数据库与Redis端口同样仅loopback。服务内存约后端64MB、MySQL175MB、Redis6MB；无容器OOM。
- 上线隐私HTML校验值：`70105d514da2e21f3d5195a05bc85b3206d148524b9b3e14aaa81ebda85f4897`，与本地生成文件一致。
- 未调用计费模型，未使用用户照片或开发库数据，未把容器监听健康等同真实模型和真机验收。

## 操作与回滚

运行命令见`backend/deployment/README.md`。查看日志时不输出环境文件、身份凭证、模型密钥或私人内容。

Nginx修改后先`nginx -t`再reload；出错还原备份配置。镜像以版本固定，回滚旧标签不能自动撤销已成功迁移的数据库。数据库恢复会覆盖新写入，必须另获明确恢复授权。

只有前端正式地址、生产签名包及服务器生产身份配置全部匹配后，正常用户业务请求才能通过鉴权。健康接口也需真正的production设备身份；外部未经授权访问返回401是预期安全行为，不可为获得200而关闭鉴权。

## 中国香港及中国澳门隐私草案更新

- 2026-10-29按用户最新要求，发行计划收敛为中国香港和中国澳门；政策升至1.4，第二节改为“二、AI创作”，补充资料查阅/更正及地区外处理说明，不修改App Store实际销售范围。
- 更新前备份线上HTML至`/opt/orange-glow/backups/privacy-policy-before-hk-macao-20261029.html`，权限0600；只原子替换静态网页，无Nginx改动或后端重启。
- 最新HTML校验值：`0e49d4c8a6969465eb215b2a040d77a9639f2aa70d47b7c90aea2b01e1f075b7`，与本地相同；线上标题、范围及草案警示验证通过，隐私与主页200、API无身份401。
- 正式发行仍需核对运营主体、真实接收方与存储地区、保留/删除规则及澳门适用的通知/跨境许可要求，不能视为此次文字更新已完成法务或App Store验收。详见`docs/reference/privacy-hong-kong-macao-notes.md`。

## 隐私草案红框内容调整

- 2026-10-29按用户标注移除了“匿名显示不保证无法识别身份……”段落、端到端加密状态说明，以及AI/其他资料的地区外处理说明；第三节标题为“三、公开、分享”。保留存储地区和AI处理地区的填写字段及其他未标注内容。
- 后续截图再确认红框还覆盖“我们无法收回他人此前已保存或转发的副本”、整个服务提供方段落、AI接收方地区字段及内容保存/删除期限段落，已一并按标注删除；保留首次服务及备份地区字段、事件响应说明、草案提示。第三节标题仍为“三、公开、分享”。
- 替换前备份线上HTML：`/opt/orange-glow/backups/privacy-policy-before-highlight-removal-20261029.html`及`/opt/orange-glow/backups/privacy-policy-before-second-redbox-20261029.html`，权限0600；最新线上与本地重建HTML校验值均为`0b92a92fc6c3493be448c016768205efbd07be4e49ebed03467cb47202bf8948`。检查确认红框文字已移除，HTTPS页面保留草案警示及标题。
- 同步更新源Markdown和Word版本。未修改后端、Nginx配置、AI授权逻辑或App功能。

## 运维SSH访问

- 为避免重复密码提示，新增主机别名`orange-glow-prod`和专用Ed25519密钥。本地私钥`~/.ssh/orange-glow-deploy-152-32-225-67`权限0600；服务器原`~/.ssh/authorized_keys`先备份为`authorized_keys.bak-20261029`后再追加公钥。
- SSH config仅增加该主机专属IdentityFile规则，不改其他Git/服务器主机项。`ssh -o BatchMode=yes orange-glow-prod`已验证无需密码可连接。
- 指纹：`SHA256:b4YRCEh00yA0/cBBNYIP3YbeP8b3i8B7rpkMgA2Vb3A`。不得分享本机私钥；如需撤销该访问，移除服务器授权公钥并删除本机专用密钥。

## 隐私草案移除发行地区表述

- 按用户要求，隐私政策不再写明中国香港、中国澳门或具体地区发行方案，也移除两地法律及监管机构名称；改为依据适用法律处理个人资料的通用表述。政策版本更新为1.5，草案警示及存储地区待填字段保留。
- 替换前备份线上HTML至`/opt/orange-glow/backups/privacy-policy-before-remove-hk-macao-20261029.html`，权限0600。线上页面由Nginx静态提供，只原子替换HTML，未更改Nginx或后端。
- 本地与线上HTML校验值均为`724773d6acee64eb381c2777b6ef3fa2a7048560da4b6cbb6ef245ad1bf7389d`；线上返回200，具体地区表述已移除，草案警示保留。

## 隐私页面移除草案提示（2026-10-29）

- 按用户要求从源稿和Word版移除内部编制依据及政策版本行，从网页模板移除顶部提示框和标题中的草案后缀；其余政策内容及占位字段未改。
- 更新前备份线上HTML至`/opt/orange-glow/backups/privacy-policy-before-notice-removal-20261029.html`，权限0600；之后原子替换静态网页，无Nginx或后端变更。
- 当前线上页面返回200，HTML与本地一致，SHA-256为`c0934eb741a491beeb1abca470ce309fc60e36898d58587c8fab833d0fb735e9`。运营主体、生效日期、存储地区及隐私邮箱等占位字段仍待填写。

## 隐私政策移除AI撤回及关联数据删除段落（2026-10-29）

- 按用户要求，从隐私政策源稿删除AI授权查看/撤回入口段落，以及设备身份和关联数据删除入口段落；重新生成HTML和Word版。同步修正部署README中过时的网页草案提示说明。
- 替换前备份线上HTML至`/opt/orange-glow/backups/privacy-policy-before-removal-data-entry-paragraphs-20261029.html`（权限0600）；页面原子替换后返回200，线上与本地HTML校验值均为`7bb1b3fa75436887532a9f62d7cc5b2d5e681a56477bfea8d021bfb0a381b76c`。未更改Nginx或后端。

## 隐私政策主体、日期与存储地区更新（2026-10-29）

- 按用户提供的信息，将运营主体填写为“云影天光科技有限公司”、服务和备份存储地区填写为“中国大陆”，生效日期设为2026年10月29日；删除政策变更通知段落及响应期限，将联系字段改为“客服邮箱”。未在项目中找到具体客服邮箱地址，暂留`[客服邮箱地址]`占位。
- 替换前备份线上HTML至`/opt/orange-glow/backups/privacy-policy-before-company-date-storage-update-20261029.html`（权限0600），随后原子替换静态页面。线上返回200，HTML校验值`83e0aa648c9cb3d87847758654ee452416b6477df14fc9780850f8bb88cb276b`与本地相同；未改Nginx或后端。

## 隐私政策填写客服邮箱（2026-10-29）

- 按用户提供的信息，将客服邮箱填写为`shuyingzhou1994@163.com`，同步重建Word和HTML并更新线上页面。线上返回200，HTML校验值`cf1037ec671d37dc31f75ae3b42a4429af3709572d8148eb6aafaba9c28e43a3`与本地相同；未改Nginx或后端。

## 隐私政策删除服务端处理说明和联系地址（2026-10-29）

- 按用户要求删除AI创作段落中“相关照片或文字在我们的服务端处理，不是全部在手机本地完成”及联系地址字段，重建Word和HTML并更新线上页面。线上返回200，HTML校验值`58a3e97b5415fd2e54104d8983c5cb41ff552f8e137c0fd356d045d9eb4e317c`与本地相同；未改Nginx或后端。

## 隐私政策不再声明模型归属（2026-10-29）

- 按用户允许的中性方案，将“自主研发并运营的大模型服务”改为“AI功能”，同步源稿、Word和线上HTML；不将文案变更视为模型迁移。用户确认存储地区正确，年龄尚未确定，本次均未修改。
- 发布前校验线上旧页与本地原版本一致，备份至`/opt/orange-glow/backups/privacy-policy-before-neutral-ai-20261029.html`（0600）后原子替换。HTTPS返回200，线上及本地SHA-256均为`8a5164622b0fe5c90b165e3c3a5d8846d1e970a8e67ce937268d3455144dea52`。未改后端或Nginx。

## 增加隐私政策入口并同步产品名称（2026-10-29）

- 在个人主页“月度装订”下方增加“隐私政策”行，使用系统外链打开`https://www.comiaite.com/privacy-policy`，打开失败显示提示；补充个人主页定向测试。
- 按用户最新源稿标题“AI旅行日记”重建Word/HTML，并同步更新线上政策页。替换前备份旧页至`/opt/orange-glow/backups/privacy-policy-before-current-product-title-20261029.html`（权限0600）。线上HTTPS返回200，SHA-256为`1deedfaa8066881e48e3b950cfebd0815730070443f721590331411f1e3062b1`，与本地HTML一致。
- 验证：个人主页1 suite / 5 tests通过，`npm run typecheck`、`git diff --check`通过。协议检查保留尚未确定的年龄占位；授权撤回/关联数据删除仍须待应用能力落实后再声明为可用。本次未实现删除后端功能。

## 隐私政策主体名称改为应用名（2026-10-29）

- 按用户要求将开篇改为“AI旅行日记（以下简称‘我们’）”，并将运营主体字段改为“AI旅行日记”；同步重建源稿对应的Word和HTML，备份线上旧页后原子发布。
- 线上返回200，SHA-256为`586dcac5e6938f0a72599c01e07ee7d375d926813046e86686e1f964a5a80b29`，与本地HTML一致。应用名称不一定等同于法定运营主体名称，正式提交前需确认披露主体。

## 隐私政策年龄分级说明更新（2026-10-29）

- 按用户提供的App Store分级截图，将原“适用年龄”待填项改为：年龄分级以各地区App Store展示为准，未成年人遵守适用法律并在依法需要时取得监护人同意；监护人可通过客服邮箱反映未成年人个人信息处理问题。未将商店分级推定为最低服务年龄。
- 重建Word与HTML，替换前备份线上旧页至`/opt/orange-glow/backups/privacy-policy-before-age-clause-update-20261029.html`（权限0600）后原子发布。线上返回200，SHA-256 `b7b4d6c1ac9fff17c9eec0ed18f5296d5f02efb635cd32aac8f60435fc2a5cfc`与本地一致。

## DIA-008 单篇日记删除后端部署（2026-10-29）

- 原生产镜像`orange-glow-backend:20261029-01`不含删除 handler。本次未重建镜像或部署并行服务改动；将生产 `src` 编译得到的五个 JS 模块发布到`/opt/orange-glow/backend-releases/20261029-diary-delete-01/`，以只读挂载提供删除 controller、事务清理、日记照片副本清理，以及锚点/成长迟到任务保护。
- Compose 原配置先备份到本机`/tmp/orange-glow-delete-deploy-20261029/compose.production.yml`（0600）及服务器`/opt/orange-glow/backups/diary-delete-20261029-01/compose.production.yml`（0600），随后原子更新。六个`installation-04`认证挂载、生产镜像标签、环境文件、数据库/Redis/照片卷与Nginx均保持不变；只重建backend，不执行schema migration。
- 定向验证：后端5 suites / 27 tests通过，`backend npm run build`及仅编译生产`src`的候选构建通过。部署后 backend、MySQL、Redis healthy；运行容器中五个文件与本地产物SHA-256一致，`DiariesController.deleteDiary`运行时元数据为`DELETE /api/diaries/:id`。`GET https://www.comiaite.com/api/health`无身份返回预期401，确认HTTPS入口可达。
- 未向生产发送DELETE请求，未删除或修改生产日记；未运行生产或真实MySQL E2E，真机系统确认仍待验。生产健康/路由检查不计为删除 CASE 完整通过。回滚只需恢复上述Compose备份并运行`docker compose --project-directory /opt/orange-glow -f /opt/orange-glow/compose.production.yml up -d --no-deps backend`，不恢复数据库。

## PCD-001 明信片 AI 寄语后端部署（2026-10-29）

- 发布 `20261029-postcard-message-01`：本机按生产 `src` 目录结构编译六个 JS 文件，放入 `/opt/orange-glow/backend-releases/20261029-postcard-message-01/` 并只读挂载。注册 `POST /api/postcards/message`，安装身份校验及 AI 限流保持启用；Provider 使用既有 `PET_CHAT_*` 生产配置。未更换镜像、未生产构建、无数据库迁移。
- Compose 原配置备份于本机受限目录 `/private/tmp/orange-glow-postcard-deploy-20261029/compose.production.yml` 和服务器 `/opt/orange-glow/backups/postcard-message-20261029-01/compose.production.yml`，权限均为 `0600`。原配置 SHA-256 `ab3f6e2b5f37a049c1b8d536375af99b5a876a718e18eb5f92b537c1ecc1c020`；部署后 Compose SHA-256 `1bf5acf76dd2cc7898dc30d4db4ec38e24dfe8df51dc99237aa60cf95acc2950`。仅更新 backend 挂载并重建 backend；MySQL、Redis、数据卷和 Nginx 未变。
- 发布模块：`app.module.js` `545e1a6bf89cc65ab8aa754c186bb70901eafc512a734ee7d38b9663da84996c`；`installation-auth.service.js` `2b347bfb7bd874d07e6d9b71bb9cb5fa6c0a1c0a394c49440c1129322d7799f9`；Provider `acfe59469fd80267abdad851877ecf13545bd1f372677b780a1d586912ecf706`；controller `0a7f198a3f246baf99cdbfa9107586051d82464a4e3a1ba9d37f54a3c7107d5d`；module `90632b1c10b8d210ba0baa00b80a13df01aa411851fbbb696bffa29750b13ff0`；service `c5217de018af3cba6af8c7f8738009fba442652a7aecfa4bac965af8d4e03690`。运行容器校验值与本机编译产物一致。
- 部署后 backend、MySQL、Redis 均 healthy；HTTPS 未授权 POST 返回预期 401，证明路由已注册并受身份保护。没有使用有效身份读取生产素材，没有调用计费模型；真实生成结果、生产素材处理及 iOS 真机授权/PNG 验收仍未执行，CASE-PCD-001-011/012 继续标记部分执行。
- 回滚只需将服务器备份 Compose 原子恢复到 `/opt/orange-glow/compose.production.yml` 并运行 `docker compose --project-directory /opt/orange-glow -f /opt/orange-glow/compose.production.yml up -d --no-deps backend`；不恢复数据库。保留版本文件目录直到回滚期结束。

## 隐私政策移除存储地区声明（2026-10-29）

- 按用户要求从隐私政策移除“服务和备份存储地区：中国大陆。”；保留必要期限内的数据保存及安全措施说明。已同步源Markdown、Word和HTML。
- 更新前备份线上HTML至`/opt/orange-glow/backups/privacy-policy-before-storage-region-removal-20261029.html`（权限0600）及本机受限目录`/tmp/orange-glow-privacy-region-20261029/`；备份内容与旧线上页面SHA-256一致。
- 原子替换`/var/www/orange-glow/privacy-policy.html`后，线上HTTPS返回200；线上与本地HTML SHA-256均为`b345adedb9d232bdb461f51e0e8332245aff6d0a7129e5bd677c704b87bbe0c9`。检查确认地区声明已移除，保留期限说明仍在；未改Nginx配置或后端。
