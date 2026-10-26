# App Attest 匿名设备身份契约 v1

状态：已实现代码路径，真实设备和生产签名验收待执行。

## 身份边界

- App Attest 只证明请求密钥属于已注册 App 的一个有效 iOS 安装实例，不代表真实用户、账号或善意行为。
- App Attest 私钥由 Apple 安全硬件管理，不离开设备。客户端只保存 key ID 和服务端访问凭证到 iOS Keychain。
- 服务端验证 Apple attestation 后生成全新的 `deviceId`，不接受客户端自选 ID 作为认证身份。旧 `x-device-id` 下的数据不自动迁移。
- 服务端使用独立 HMAC 密钥签发 30 天 HS256 bearer token。生产环境所有现有 API 都要求有效 token，且 `x-device-id` 必须与 token 的 `sub` 完全相同。
- token 到期前后，客户端都可通过一次性 challenge 和 App Attest assertion 证明仍持有原 key，随后换发 token。key 被撤销或丢失后须重新 attestation 并分配新身份。
- bearer token 被窃取后，在有效期内可重放；当前版本不对每个业务请求附加 App Attest assertion。需要进一步降低 token 重放风险时，应将逐请求 assertion 加到高敏感操作。

## 协议

1. 客户端请求 `POST /api/identity/attestation/challenge`，取得随机一次性 challenge。challenge 至少 32 字节随机熵，5 分钟过期；每个来源 IP 默认每小时最多 20 次，数据库只存该来源的 HMAC 摘要和计数，不存原始 IP。
2. iOS 使用 `@expo/app-integrity` 生成/读取 App Attest key，并对 challenge 生成 Apple attestation。
3. 客户端提交 `POST /api/identity/attestation/register`，包含 `challengeId`、`keyId` 和 attestation。
4. 后端原子消费 challenge，使用 Apple App Attest Root CA 验证证书链、nonce、bundle ID、Team ID、环境和 key ID；每个 key 只能注册一次。
5. 验证通过后，后端随机生成新设备 ID，保存公钥与计数器，并返回 30 天 access token。注册响应丢失时，客户端可使用 key 对新 challenge 生成 assertion，恢复/换发 token。
6. `DEVICE_IDENTITY_MODE=attested` 时，全局 guard 校验 token 签名、过期时间、设备记录、key 绑定及请求头 ID 一致。`NODE_ENV=production` 时强制 attested 模式，不能用 legacy 配置降级。

## 配置与环境

后端环境变量：

- `APP_ATTEST_TEAM_ID`：Apple Developer Team ID。
- `APP_ATTEST_BUNDLE_ID`：App ID；默认当前 `io.com.shihangbiji.www.aidiary`。
- `DEVICE_AUTH_JWT_SECRET`：每个部署独立生成、至少 32 字节的随机服务端秘密，不得进入客户端。
- `APP_ATTEST_CHALLENGES_PER_IP_PER_HOUR`：挑战请求限额，默认 `20`。
- `DEVICE_IDENTITY_MODE`：本地开发默认为 `legacy`；真实 attestation 开发可设为 `attested`。生产环境无论此值如何都强制 `attested`。

本项目此身份认证方案的正式支持范围为 iOS；Android 不在当前产品范围内，不接入 Play Integrity。客户端只在支持 App Attest 的真实 iOS 设备上执行此流程。模拟器和开发期可使用 legacy 流程，但 Release 不回退到客户端自报身份；不具备 App Attest 凭证的请求在生产 strict mode 下会被拒绝。

## 迁移、验收与限制

- 按本轮确认，身份升级签发新 ID；旧 ID 数据保留在原归属下，不会自动显示到新身份。当前没有旧安装身份的独立秘密可证明旧 ID 所有权，自动迁移会重新引入首次冒领风险。
- 在本地或隔离数据库应用新增 Prisma migration 前，不要启用 `attested` 服务路径；本次开发不自动修改或迁移已有数据库。
- App Attest 增加伪造客户端和脚本批量签发 ID 的成本，但不能完全阻止真实设备农场、合法 App 自动化、分布式 IP 或凭证被盗。IP 限流是补充措施，需依据部署代理及正常用户流量调优。
- Apple App Attest 在模拟器不提供真实设备证明。sandbox 与 production key/receipt 不可混用；TestFlight/App Store 分发使用 production 环境。
- 必须在真实设备、正确 Team ID、更新后的 provisioning profile 和实际 Release 签名下执行 Apple attestation 验收；单测/模拟证明不代表 Apple 生产验收。
