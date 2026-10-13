# Orange Glow AI Diary

`Orange Glow AI Diary` 是一个独立的 Expo + React Native iOS 前端原型项目。

## 当前范围
- 仅前端
- 仅 mock 数据
- iOS 优先
- 基于 `AI日记设计图04.pptx`
- 参考 `ai-diary-1` 的工程组织与设计语言

## 已接入流程
1. 首页
2. 相册授权
3. 照片选择
4. 模板选择
5. 排版师选择
6. 自动生成
7. 同伴命名
8. 编辑日记
9. 查看我的日记
10. 日记详情
11. 公开范围
12. 分享日记

## 启动
```bash
npm install
npm run ios
```

## 独立安装说明
- 当前已配置独立安装标识：
  - iOS `bundleIdentifier`: `com.hjd.aidiary2`
  - Android `package`: `com.hjd.aidiary2`
  - `scheme`: `ai-diary-2`
- 与 `ai-diary-1` 分开后，可以作为两套独立 App 安装在同一台设备上。
- 开发阶段若要同时安装两者，需分别构建和安装各自的开发包，而不是通过 Expo Go 在同一个宿主 App 中切换项目。

## iOS Dev Build
- 已启用 `expo-dev-client`
- 已提供 `eas.json` 的 `development / preview / production` 构建配置
- 本机若使用 `Xcode 26.0.x`，会遇到 Expo SDK 57 的 Swift 工具链兼容问题；建议升级到 `Xcode 26.4+` 后再执行原生 iOS 构建。
- 常用命令：

```bash
npm install
npm run prebuild:ios
npm run ios:device
```

- 如果要走 EAS 内部分发安装：

```bash
eas build --platform ios --profile development
```

- 安装到真机后，启动开发服务请使用：

```bash
npm run start:dev-client
```

## 目录
- `app/`: Expo Router 页面
- `src/components/`: 共享组件
- `src/mocks/`: mock 数据
- `src/store/`: Zustand 状态管理
- `src/theme/`: 主题 tokens
- `design/source/`: 原始 PPT
- `design/extracted/`: 从 PPT 提取出的媒体资源
- `docs/business/`: 业务文档和页面映射
