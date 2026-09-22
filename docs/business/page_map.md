# 页面映射

| PPT 步骤 | 页面路由 | 说明 |
|---|---|---|
| 首页 | `/(tabs)` | 主入口与流程概览 |
| 允许访问相册 | `/permission/photos` | mock 授权页 |
| 选择照片 | `/album/select` | 选择本次创作图片 |
| 选择模板 | `/create/template` | 当前以旅行游记为主模板 |
| 选择排版师 | `/create/character` | 选择叙事角色 |
| 自动生成 | `/create/generating` | 展示生成进度 |
| 保存同伴名字 | `/companion/naming` | 写入同伴称呼 |
| 编辑日记 | `/diary/[id]/edit` | 调整正文 |
| 查看我的日记 | `/(tabs)/diaries` | 历史日记承接页 |
| 日记详情 | `/diary/[id]` | 查看详情与分享入口 |
| 公开范围 | `/share/privacy` | 设置可见范围 |
| 分享日记 | `/share/result` | 保存或导出 |

## 旧路由兼容
- `/create/type` -> `/create/template`
- `/create/preview` -> `/album/select`
- `/diary/[id]/edit-text` -> `/diary/[id]/edit`
- `/diary/[id]/replace-photos` -> `/album/select`
- `/diary/[id]/export` -> `/share/result`
- `/diary/[id]/styled` -> `/share/result`
- `/modal/edit-actions` -> `/modal/more-actions`

