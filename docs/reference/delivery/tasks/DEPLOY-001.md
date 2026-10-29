# DEPLOY-001 后端与隐私草案生产部署

日期：2026-10-29。范围以用户批准计划及最新“前端上架自行处理”要求为准。

## 实施边界

- 在`152.32.225.67`部署NestJS/MySQL，Nginx提供`https://www.comiaite.com/api`。
- 隐私原文不修改，`/privacy-policy`明确标注草案、尚未生效、不可用于App Store。
- 先检查已有站点、TLS、数据库、Redis和Docker，先备份再改配置，不覆盖其他项目。
- Linux镜像只在本地构建；生产不编译应用、不使用开发JWT/数据库、不导入用户数据。
- 后端唯一源码改动为仅信任loopback代理的真实IP，恢复App Attest逐来源限流。
- 之前已按批准范围完成正式API地址和production App Attest配置；最新要求不再推进iOS打包、TestFlight或App Store上传。
- 模型保持现有服务端配置，不修改AI调用和其他并行业务功能。

## 当前实现

部署文件：`backend/Dockerfile.production`、`backend/.dockerignore`、`backend/deployment/`、`tools/prepare-production-environment.js`。

本机已构建runtime和migration的Linux/amd64镜像；运行依赖与编译后的可信代理检查通过，镜像无`.env`。服务端配置通过加密SSH stdin写入0600环境文件，并生成独立production JWT/数据库凭据。

服务器已有有效域名证书，新增Docker运行环境；原MySQL/Redis不存在，现以隔离容器和持久卷启动，端口仅loopback。新schema初始表数0，迁移前已有数据库备份。Nginx原配置在本机和服务器分别备份。

隐私草案已部署：HTTPS200、UTF-8、no-cache、noindex，HTTP路径跳转HTTPS。主页及`/soul-haven/`保持200。

镜像已完整上传导入，两个amd64版本核验成功后执行15条Prisma迁移，全部成功；后端已启动且healthy，仅loopback监听。迁移状态为up to date，没有迁移开发库或用户文件。

## 验证记录

- 可信代理及身份3 suites /16 tests通过，前后端类型检查和差异检查通过。
- 实际production镜像中确认可信代理拒绝外部伪造头，允许本机Nginx覆盖的合法IP。
- MySQL/Redis健康；服务器端口和环境文件权限符合上述边界。
- 隐私网页逐行核对保留Markdown正文，附加醒目草案提示，不改运营主体占位或模型假设。
- 首次iOS生产构建因旧profile缺App Attest失败；现有Apple账户中已启用App Attest，刷新并同步原profile、分发证书不变；此前发起的复建build9成功。没有上传TestFlight或提交App Store，后续由用户处理。

## 剩余验证与交付

已完成migration状态、三服务healthy、HTTPS鉴权拒绝401、公开挑战接口201及原站点200回归；没有调用计费AI或上传个人照片。详见[运维交接](../../../handoff/production-deployment-20261029.md)。当前后端与隐私草案部署完成，真实设备完整业务验收待用户准备production设备身份后另行执行。

线上部署不代表AI质量、真机身份、素材/相册/分享、完整隐私披露或App Store审核通过。原42项任务/225条验收统计保持不变。
