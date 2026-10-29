# 安装级匿名身份契约 v1

日期：2026-10-29。用户批准的 Apple 登录前过渡方案；替代当前默认 App Attest 要求，不采集硬件指纹，不内置共享秘密或长期 JWT。

## 身份与边界

- 每个安装身份在客户端以 Expo Crypto 原生安全随机数生成 32 字节 Ed25519 私钥种子，使用独立公钥。私钥及访问凭证存入 iOS Keychain，`WHEN_UNLOCKED_THIS_DEVICE_ONLY`；不使用 Math.random、AsyncStorage、硬件指纹或客户端自报 ID 作为生产身份。
- Keychain 可能跨重装保留；不能承诺每次重装一定换身份。凭证按 API 基础地址分别存储，不跨开发、生产服务复用。
- 本地草稿快照按 API 地址+服务端身份隔离；新身份不自动读取旧共享快照或其他身份缓存。旧文件保留，不因身份切换而清空。已同步的服务端记录不自动删除。
- 服务端验证持钥证明后生成 `device-UUID`，同一公钥唯一绑定同一身份。客户端重试、响应丢失及令牌续期均恢复原身份；凭证损坏/服务失败不自动切成其他身份。
- 不接受旧设备 ID 认领数据，不迁移开发库。已有 App Attest 身份保持独立；安装身份不能冒充 App Attest 身份。
- 后续 Apple 登录应在验证 Apple 身份与当前安装持钥证明后新增账号绑定；当前仅保留稳定的服务端身份 ID，不实现账号登录、跨设备合并或数据迁移。

## 协议

- `POST /api/identity/installation/challenge`：提交 `publicKey`，32 字节小写十六进制 Ed25519 原始公钥；响应 `challengeId`、`keyId`、`payload`。
- `keyId` 为 `install-` 加原始公钥 SHA-256。payload 是服务端序列化的 JSON，绑定协议 `installation-ed25519-v1`、动作 `authenticate-installation`、挑战 ID、公钥 ID 和 32 字节安全随机挑战。
- 客户端校验协议和绑定字段，以安装私钥签名 payload 的 UTF-8 原始字节。
- `POST /api/identity/installation/exchange`：提交 `challengeId`、`publicKey`、64 字节十六进制 `signature`。服务端检查有效期和绑定，原子消费挑战，再验证 Ed25519 签名。挑战五分钟过期且只能消费一次；无效签名亦不能重用挑战。
- 响应 `deviceId`、`accessToken`、`tokenType=Bearer`、`expiresAt`。服务端以独立 Ed25519 私钥签发一小时 JWT，固定 issuer/audience、`amr=installation-key`，绑定 `sub`、`keyId`、`ver`、`iat`、`exp`。
- 业务请求携带 `Authorization: Bearer ...` 与匹配的 `x-device-id`。服务端每次检查签名、有效期、数据库身份方法、公钥 ID、撤销状态与 tokenVersion，然后按原有 ownerDeviceId 校验数据归属。
- 到期前五分钟，客户端重新挑战签名续期；不使用无限期 bearer/refresh token。并发初始化和续期共享一个 promise；网络故障、超时或 5xx 静默重试最多三次，间隔三秒，每次重新挑战，不重放已消费证明。401/429 不自动重试。

## 防滥用默认值

计数通过数据库原子 upsert 跨实例共享；IP 仅以服务器 HMAC 摘要参与计数，不存原始地址。仅 loopback Nginx 覆盖的 X-Real-IP 被信任。

- 所有挑战：每 IP 每小时 120 次；未注册公钥挑战每 IP 每小时 20 次。
- 已注册公钥续期挑战：每公钥每小时 30 次；证明交换每 IP 每小时 120 次。
- 业务：每身份每分钟 300 次、每 IP 每分钟 1200 次。
- AI 发起：每身份每分钟 6 次、每天 100 次；每 IP 每小时 300 次。覆盖日记生成、重写、聊天生成（含流式）、AI 配图、记忆花朵和洞察发起/重试。
- 超限 429；计数包含失败的发起尝试，不计为模型实际完成次数。轮询、取消与历史读取不占 AI 配额；既有素材容量、上传大小及业务任务并发控制不变。

## 部署与能力限制

- `DEVICE_IDENTITY_MODE=installation` 开启新流程；生产仍不能降为 legacy。`INSTALLATION_AUTH_PRIVATE_KEY` 是仅服务端保存的 base64 PKCS8 Ed25519 私钥；`DEVICE_AUTH_JWT_SECRET` 保留为计数 HMAC 与旧 App Attest token 的服务端密钥。
- 复用已部署的 AppAttestDevice/Challenge/RateLimit 表，以独立 environment/purpose 区分，不改业务 schema；表名不表示安装认证具有 Apple 硬件证明。
- 修改 tokenVersion 或设置 revokedAt 可撤销身份；丢失安装私钥后没有自动恢复私人数据的能力，后续依赖账号绑定。
- 安装密钥证明持有凭证，不证明真机、正版 App 或真实用户。私钥仍可能被提取，脚本能创建新密钥；成本主要来自挑战、注册限制与 AI 配额。JWT 是 bearer，在一小时窗口内被盗仍可重放。
- 当前支持 iOS 真机及模拟器，需要含 ExpoCrypto 与 ExpoSecureStore 的新原生包。Web/Android 不启用安全存储降级。
