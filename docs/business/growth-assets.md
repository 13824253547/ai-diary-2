# 成长页面素材修复记录

来源是 `AI日记设计图04.pptx` 的原始扁平媒体 `design/extracted/ppt_media/image14.png`（2048 × 1152）和 `image4.png`（2048 × 1152）。原始媒体和旧参考切图均未覆盖；新的运行时图片存放在 [assets/restored/](../../assets/restored/)。本轮页面效果见[成长模块验收记录](../verification/growth-20260922/README.md)。

## 已修复的问题

旧提取脚本把树和花朵的文字区域整块设为透明，区域内的标签底板、丝带、背景甚至树枝随之消失。现已删除该逻辑。新[修复脚本](../../tools/restore-growth-assets.py)只在逐个标注的文字范围内选择深色字形像素，并使用 OpenCV Telea 修复字形及其抗锯齿边缘。标签底板、花台、玻璃高光、阴影和星光保留。

树和三花组合分别作为局部插画，不含标题、系统栏、导航、里程碑或进度条；文字和交互继续由原生组件实现。插画采用暖底 `#FFF3E5`，裁剪外缘以平滑过渡接到页面背景，未对内部浅色像素抠图。玻璃罩花朵保留透明材质已经合成在原稿中的暖色背景，其周围匹配 `#FFF9F1`。

## 输出与放置

| 文件 | 原始尺寸 | 用途 |
| --- | --- | --- |
| `growth-tree.png` | 459 × 616 | 记忆树，四个标签和一条丝带均为空白，叠加可点击原生文字 |
| `growth-flowers-locked.png` | 462 × 495 | 两朵已开花、一朵灰色花苞的完整插画 |
| `growth-flowers-unlocked.png` | 462 × 495 | 演示解锁状态：第三朵使用同一原稿的已开放花朵合成 |
| `growth-globe.png` | 162 × 182 | “小橘眼中的你”卡片里的玻璃罩花朵 |
| `tree-glyph-mask.png`、`flowers-glyph-mask.png` | 与对应素材一致 | 可审查的修复掩膜，不供 App 渲染 |
| `restoration-preview.jpg` | 1180 × 850 | 暖背景检查图，不供 App 渲染 |

`docs/business/growth-assets.json` 记录每个源裁剪坐标、文件哈希、标签底板及文字框。坐标为素材原生像素，格式 `[left, top, right, bottom]`。按照 `渲染宽度 / 原始宽度` 同比例缩放位置、字号与行高；文字层使用透明底色，不再创建覆盖丝带的大色块。

树文字框（459 × 616）：珍视旧友 `[32,82,104,101]`，追光的人 `[354,144,426,164]`，山与海 `[366,338,426,357]`，深夜食堂 `[45,369,119,389]`，人生旷野的寻路者 `[202,456,347,477]`。

花朵文字框（462 × 495）：第一朵 `[57,238,204,260]`，第二朵 `[279,285,416,306]`，第三朵 `[124,426,262,469]`。第三朵标题和状态占两行。

## 可重复执行

依赖 Python、Pillow、NumPy、`opencv-python-headless`。在独立 Python 环境安装依赖后执行：

```bash
python tools/restore-growth-assets.py
```

本次实际执行使用现有工作区 Python，OpenCV 仅安装在临时独立目录 `/tmp/ai-diary-growth-image-deps`，没有修改项目运行依赖：

```bash
PYTHONPATH=/tmp/ai-diary-growth-image-deps /Users/hjd/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/restore-growth-assets.py
```

`tools/extract_design.py` 仍负责原始切图；不应把它产生的旧分片重新接回成长页面。运行素材修复脚本不修改 `src/theme/assets.ts`，不会覆盖 UI 引用。

## 验证与限制

已检查局部成品和组合预览：无矩形透明洞，树枝与丝带完整，三花共享的光影没有互相覆盖的矩形边界，玻璃罩保留原始半透明视觉。

源文件是扁平图片，无法无损还原被物体遮住的背景，也无法恢复真实分层透明通道。原始像素尺寸保持不变；放大不能获得不存在的高清细节。移除笔画后标签上仍可能有轻微修补纹理，原生文字覆盖后不形成白块。第三朵解锁态没有对应的独立设计稿，使用同源开放花瓣替换灰色花苞作为前端演示，不属于生成式 AI 图片，也不宣称是 PPT 原有解锁图。
