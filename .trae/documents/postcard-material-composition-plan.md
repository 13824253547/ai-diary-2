# 明信片多素材组合实施计划

## 概要

让一张明信片同时呈现照片、贴纸表情和城市印章。素材库预览的“用于明信片”入口进入独立的 `/postcard/apply` 页面，预填当前素材；照片必需，贴纸与城市印章可选，每类最多一个。应用页确认后进入 `/postcard` 预览、分享或保存。

## 当前状态分析

- `app/library/index.tsx` 的照片、贴纸和已解锁城市印章预览共用“用于明信片”入口；当前入口每次只携带 `photoId` 或 `decoration` 中的一项并立即跳转，不能累积三个类别。
- `app/postcard/index.tsx` 接受 `photoId` 和单个 `decoration` 参数；贴纸和城市印章共用卡片右下角的同一个展示位，所以即使同时传入两者也无法同时呈现。
- 卡片导出由 `src/services/postcard-export.ts` 捕获当前原生视图为临时 PNG；现有输入版本键包含照片和单个装饰，已用于避免旧卡片结果被当作新选择交付。
- 当前城市印章入口只提供已解锁的印章；该门槛继续生效。明信片已有分享、保存流程，本需求不新增作品历史、后端接口或自由拖拽排版。
- 相关页面、业务文档和交付记录已有工作区修改。本轮实施须在其当前版本上增量修改，尤其保留用户对 MAT-001 task、CASE 和执行快照的更新。

## 方案与文件

### 组合状态与路由类型

- 新增 `src/types/postcard.ts`，定义 `PostcardComposition`，包含可选的 `photoId`、`stickerId`、`cityStampId`。照片选择期间允许为空；提交进入卡片前要求照片有效。
- 使用现有路由参数传递这三个稳定 ID，不把图片字节、URI 或城市印章完整配置塞进路由。素材库从明信片返回继续选择时，用独立的 `postcardPhotoId`、`postcardStickerId`、`postcardCityStampId` 参数恢复暂存组合，避免与现有业务参数重名。

### 独立明信片素材应用页

- 在 `app/postcard/apply.tsx` 独立呈现本机素材照片、贴纸和已解锁城市印章；支持照片必选、每类最多一个、同类替换，以及再次点选已选贴纸/印章移除。
- `app/library/index.tsx` 不维护组合暂存或底部组合摘要。照片、贴纸和印章预览点击“用于明信片”后打开 `/postcard/apply`，并仅传入当前选中的稳定 ID；AI 配图仍使用当前设备素材 ID。
- 应用页只从当前设备素材目录读取可用照片，城市印章保持现有解锁门槛；不增加印章与照片地点必须相同的规则。
- `app/postcard/index.tsx` 的“编辑素材”入口返回 `/postcard/apply` 并携带完整组合；确认后回到当前卡片预览。

### 明信片同时渲染三层

- 在 `app/postcard/index.tsx` 分别解析照片、贴纸、城市印章。照片继续作为主体，照片地点/日期继续沿用现有位置；城市印章固定叠放在照片区域左下方，贴纸保留在卡片正文区域右下方，避免二者互相覆盖或遮挡现有地点/日期章与寄语。
- 保持当前明信片外框、照片区域和固定寄语的尺寸与结构，不增加自由拖拽、缩放或旋转能力。
- 将组合中的三个 ID 及照片实际 URI 纳入输入版本键。任一素材变化时重置图片加载/错误状态，并沿用现有导出期间输入版本保护；分享与保存捕获同一张包含全部已选层的卡片。
- 不显示默认表情贴纸；仅当用户在应用页明确选择贴纸时才渲染贴纸。
- 保持旧路由兼容：继续接受原有 `photoId` 与单个 `decoration`；在新参数缺失时将已知 sticker ID 或 city stamp ID 映射到相应展示层。未知参数仍不伪造素材。

### 自动化与交付文档

- 新增 `app/__tests__/postcard-apply-screen.spec.tsx`，覆盖照片必选、同类替换、装饰移除、解锁印章限制及最终组合路由。
- 扩展 `app/__tests__/library-screen-decorations.spec.tsx` 和 `app/__tests__/library-screen-ai-image.spec.tsx`，确认素材预览进入独立应用页并正确预填当前素材。
- 扩展 `app/__tests__/postcard-screen-assets.spec.tsx`，覆盖照片、贴纸、城市印章同屏显示、缺少可选装饰、无效 ID、旧 `decoration` 兼容，以及组合改变后不交付过期捕获。现有导出服务测试继续验证 PNG 检查、清理和分享/保存边界。
- 更新 `docs/reference/business-spec/modules/postcards.md`、`docs/reference/business-spec/modules/material-library.md`、`docs/reference/delivery/tasks/PCD-001.md`、`docs/reference/delivery/test-cases/PCD-001.md`、相关 PCD-002 案例、`docs/reference/delivery/reports/development-progress.md` 与 `docs/reference/delivery/reports/current-execution-snapshot.md`，记录组合规则、验收和真实设备未验收范围。仅增量更新这些文件，不覆盖其中已有证据或并行修改。

## 决策与边界

- 用户最新确认素材应用为独立页面，不在通用素材库页面暂存组合。
- 用户已确认每张卡片必须有一张照片；贴纸和城市印章可选，照片与两种装饰允许同卡呈现。
- 同类别最多一个素材；重新选择替换。城市印章仍只允许使用素材库已解锁印章。
- 卡片未选择贴纸时不显示原有默认表情贴纸，避免与用户所选内容叠加。
- 固定版式，不支持自由排版；位置固定为城市印章在照片左下、贴纸在正文右下。
- 不改变系统分享面板、相册保存许可、临时 PNG 生命周期、既有照片/日记数据；不触发生图模型或修改后端/数据库。
- 保留当前工作区所有与本任务无关的修改；不回退 MAT-001 用户更新。自动化通过不代表真实设备视觉、分享渠道或相册验收通过。

## 验证

1. 运行素材预览与明信片页面定向测试：`app/__tests__/library-screen-decorations.spec.tsx`、`app/__tests__/library-screen-ai-image.spec.tsx`、`app/__tests__/postcard-screen-assets.spec.tsx` 及 `src/services/__tests__/postcard-export.spec.ts`。
2. 运行 `npm run typecheck` 和 `git diff --check`。
3. 检查明信片输入版本键覆盖三类素材，卡片捕获会导出当前组合，失效/缺失照片时不能分享或保存成功。
4. 条件允许时在 iPhone 17 模拟器检查照片、日期地点章、城市印章、贴纸四者的实际层叠位置，并实际保存后独立打开 PNG；系统分享渠道和真实设备接收仍单独记录，不以 Jest 结果代替。
