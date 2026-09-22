# AI Diary 2 页面与设计稿映射

## 设计源和裁剪规则

- 唯一设计源：`design/source/AI日记设计图04.pptx`。
- PPT 原生媒体复制到 `design/extracted/ppt_media/`；每个页面的独立裁剪保存为 `design/extracted/step-01-*.png` 至 `step-22-*.png`。
- 主流程取 slide 8–10 中四列手机的 `p:pic/a:srcRect` 裁剪，避免把整张流程图当作页面背景。
- 补充页面取 slide 5、6、12 的四列手机裁剪。复杂角色、照片、树、花朵、邮戳和贴纸从原媒体切成 `assets/reference/*.png`，代码负责排版和文字。
- 原 PPT 是扁平导出图；素材清晰度受源图限制。`docs/business/asset-manifest.json` 记录每个片段的媒体来源、原始尺寸和裁剪像素，不对源图做放大承诺。

## 22 页映射

| 页码 | 产品页面 | 当前路由 | PPT 来源 | 参考图 |
| ---: | --- | --- | --- | --- |
| 01 | 首页 | `app/(tabs)/home.tsx` | slide8 第 1 列，image3 | `step-01-home.png` |
| 02 | 相册授权 | `app/permission/photos.tsx` | slide8 第 2 列，image6 | `step-02-photo-permission.png` |
| 03 | 选择照片 | `app/album/select.tsx` | slide8 第 3 列，image7 + 独立照片素材 | `step-03-photo-select.png` |
| 04 | 选择模板 | `app/create/template.tsx` | slide8 第 4 列，image8 | `step-04-template-select.png` |
| 05 | 选择排版师 | `app/create/character.tsx` | slide9 第 1 列，image3 | `step-05-character-select.png` |
| 06 | 自动生成 | `app/create/generating.tsx` | slide9 第 2 列，image9 | `step-06-generating.png` |
| 07 | 同伴命名 | `app/companion/naming.tsx` | slide9 第 3 列，image10 | `step-07-companion-naming.png` |
| 08 | 编辑日记 | `app/diary/[id]/edit.tsx` | slide9 第 4 列，image7 | `step-08-edit-diary.png` |
| 09 | 生成完成 | `app/create/complete.tsx` (query `diaryId`) | slide10 第 1 列，image11 | `step-09-generation-complete.png` |
| 10 | 日记详情 | `app/diary/[id]/index.tsx` | slide10 第 2 列，image7 | `step-10-diary-detail.png` |
| 11 | 公开范围 | `app/share/privacy.tsx` | slide10 第 3 列，image12 | `step-11-privacy-select.png` |
| 12 | 分享日记 | `app/share/result.tsx` | slide10 第 4 列，image13 | `step-12-share-result.png` |
| 13 | 素材库·灵感 | `app/library/index.tsx` | slide5 第 3 列，image3 | `step-13-materials.png` |
| 14 | 萌宠 | `app/(tabs)/pet.tsx` | slide5 第 4 列，image3 | `step-14-pet.png` |
| 15 | 回忆 | `app/(tabs)/memories.tsx` | slide6 第 1 列，image4 | `step-15-memories.png` |
| 16 | 明信片 | `app/postcard/index.tsx` | slide6 第 2 列，image4 | `step-16-postcard.png` |
| 17 | 发现 | `app/(tabs)/discover.tsx` | slide6 第 3 列，image4 | `step-17-discover.png` |
| 18 | 我的 | `app/(tabs)/profile.tsx` | slide6 第 4 列，image4 | `step-18-profile.png` |
| 19 | 小橘眼中的你 | `app/profile/insights.tsx` | slide12 第 1 列，image14 | `step-19-growth.png` |
| 20 | 记忆锚点 | `app/profile/anchors.tsx` | slide12 第 2 列，image14 | `step-20-anchors.png` |
| 21 | 记忆花朵 | `app/profile/flowers.tsx` | slide12 第 3 列，image14 | `step-21-flowers.png` |
| 22 | 洞察报告 | `app/profile/report.tsx` | slide12 第 4 列，image14 | `step-22-insights.png` |

## 图片片段使用约定

- `src/theme/assets.ts` 导出 `art`，用于代码直接引用独立素材；图片内的标题、导航、按钮和标签不作为页面背景复用。
- `art.tree`、`art.flowerGold`、`art.flowerSecond`、`art.flowerLocked` 的文字标签区已透明处理，页面应把标签作为可点击文本层叠加，避免图片内容不可访问。
- `art.mascotCamera`、`art.mascotReading`、`art.mascotHello`、`art.generationHero` 是独立角色姿态；`art.temple`、`art.street`、`art.sunset`、`art.food` 为主流程照片。
- 页面使用真实系统安全区和自己的底部导航；参考图中的状态栏、Home 指示条和导航只用于比例验收。

## 视觉验收记录

每个页面以对应 `step-*.png` 为内容参考，按照结构、主视觉/素材、字体与间距、阴影/图标顺序校验。截图验收排除系统栏和开发浮层，长页面允许滚动，不缩小整体内容强行塞进一屏。
