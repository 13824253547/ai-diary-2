# 明信片 AI 寄语契约 v1

## 请求

`POST /api/postcards/message`

必须通过安装身份认证，并携带 `x-device-id`。请求体只传当前已登记素材的 `photoId` 与可用地点，不上传客户端照片字节。

```json
{
  "version": "postcard-message-v1",
  "photoId": "material-photo-id",
  "location": "苏州"
}
```

`photoId` 必须属于当前认证设备；服务端使用 `PhotoAssetService.readMaterialPhoto(ownerDeviceId, photoId)` 读取文件。地点是客户端提供的可选参考文本，最多 80 个字符，不作为身份或素材归属凭据。

## 成功

HTTP `201`：

```json
{
  "ok": true,
  "version": "postcard-message-v1",
  "data": {
    "message": "海风轻吻落日"
  }
}
```

`message` 必须非空、单行且最多 12 个 Unicode 字符。服务端 Provider 和服务边界均校验；客户端再次校验合同和长度。不能验证的模型结果视为失败。

## 失败

- `400 device_identity_required` / `invalid_input`：缺少设备身份或请求字段无效。
- `404 not_found`：照片不属于当前设备或素材不存在。
- `500 asset_unreadable`：登记照片无法读取。
- `502 provider_failed`、`504 provider_timeout`：模型调用失败或超时。
- `502 invalid_response`：模型寄语为空、多行或超过 12 个 Unicode 字符；不自动重试无效生成结果。
- `503 provider_unavailable`：服务端模型未配置。

错误不得暴露服务凭据、文件路径或底层 Provider 响应。失败不能回退为固定寄语；客户端在当前寄语未成功生成前禁用分享和保存。该路由使用与其它高成本 AI 请求相同的设备/IP 限流。

## 数据边界

客户端在首次寄语生成前单独请求“明信片寄语”授权。仅处理当前卡片已选的一张素材照片及其可用地点；不读取其它照片、日记或历史记录，不持久化寄语。用户更换照片或地点时，旧异步结果不得覆盖新输入。
