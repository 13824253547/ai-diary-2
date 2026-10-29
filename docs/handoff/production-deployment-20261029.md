# 生产部署交接

日期：2026-10-29。产品显示名称：AI旅行日记。部署项目标识仍为`orange-glow`。

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
