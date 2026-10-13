# 页面与功能映射

此表是界面索引，不是业务目录。路由别名、重定向和开发入口不重复计算为业务功能。路径采用 Expo Router 文件结构；括号内的 tabs 是路由分组。

## 主要页面

| 页面 | 路由 | 对应功能 | 源文件 |
| --- | --- | --- | --- |
| 首页 | `/(tabs)/home` | 创作入口 CRE；素材入口 MAT；最近日记 DIA-001 | [home](../../../app/(tabs)/home.tsx) |
| 回忆 | `/(tabs)/memories` | DIA-001/006；PCD-001 | [memories](../../../app/(tabs)/memories.tsx) |
| 萌宠 | `/(tabs)/pet` | PET-001/002 | [pet](../../../app/(tabs)/pet.tsx) |
| 发现 | `/(tabs)/discover` | DSC-001/003 | [discover](../../../app/(tabs)/discover.tsx) |
| 我的 | `/(tabs)/profile` | GRW-001；成长/月度入口 | [profile](../../../app/(tabs)/profile.tsx) |
| 相册授权 | `/permission/photos` | CRE-001 | [photos](../../../app/permission/photos.tsx) |
| 照片选择 | `/album/select` | CRE-002；DIA-003（整篇更换模式） | [select](../../../app/album/select.tsx) |
| 日记类型 | `/create/template` | CRE-003 | [template](../../../app/create/template.tsx) |
| 排版师选择 | `/create/character` | CRE-004；DIA-004；浏览入口 | [character](../../../app/create/character.tsx) |
| 生成进度 | `/create/generating` | CRE-005 | [generating](../../../app/create/generating.tsx) |
| 人物命名 | `/companion/naming` | CRE-006 | [naming](../../../app/companion/naming.tsx) |
| 日记编辑 | `/diary/[id]/edit` | DIA-002～005 | [edit](../../../app/diary/[id]/edit.tsx) |
| 生成完成 | `/create/complete` | DIA-001/005；发现入口 | [complete](../../../app/create/complete.tsx) |
| 日记详情 | `/diary/[id]` | DIA-001；SHR-001；GRW-003入口 | [detail](../../../app/diary/[id]/index.tsx) |
| 公开范围 | `/share/privacy` | SHR-001～003 | [privacy](../../../app/share/privacy.tsx) |
| 分享日记 | `/share/result` | SHR-002～005 | [result](../../../app/share/result.tsx) |
| 素材与灵感 | `/library` | MAT-001～005 | [library](../../../app/library/index.tsx) |
| 明信片 | `/postcard` | PCD-001/002 | [postcard](../../../app/postcard/index.tsx) |
| 发现故事详情 | `/discover/[id]` | DSC-002/003 | [story](../../../app/discover/[id].tsx) |
| 成长树 | `/profile/insights` | GRW-002 | [insights](../../../app/profile/insights.tsx) |
| 记忆锚点 | `/profile/anchors` | GRW-003/004 | [anchors](../../../app/profile/anchors.tsx) |
| 记忆花朵 | `/profile/flowers` | GRW-005/006 | [flowers](../../../app/profile/flowers.tsx) |
| 专属洞察报告 | `/profile/report` | GRW-006 | [report](../../../app/profile/report.tsx) |
| 月度装订 | `/profile/monthly` | DIA-007 | [monthly](../../../app/profile/monthly.tsx) |
| 日记操作菜单 | `/modal/more-actions` | DIA-002/005；SHR-001/005；常规入口待Q-009 | [more-actions](../../../app/modal/more-actions.tsx) |

## 兼容入口与别名

| 路由 | 实际去向/行为 | 源文件 |
| --- | --- | --- |
| `/` | 重定向首页 | [index](../../../app/index.tsx) |
| `/(tabs)/index` | 首页别名 | [tabs index](../../../app/(tabs)/index.tsx) |
| `/(tabs)/diaries` | 回忆别名 | [diaries](../../../app/(tabs)/diaries.tsx) |
| `/create/type` | 类型页别名 | [type](../../../app/create/type.tsx) |
| `/create/preview` | 照片选择页别名，并非独立预览功能 | [preview](../../../app/create/preview.tsx) |
| `/diary/[id]/edit-text` | 编辑页别名 | [edit-text](../../../app/diary/[id]/edit-text.tsx) |
| `/diary/[id]/replace-photos` | 获取编辑草稿并打开整篇更换照片 | [replace-photos](../../../app/diary/[id]/replace-photos.tsx) |
| `/diary/[id]/styled` | 重定向分享页，并非独立排版编辑 | [styled](../../../app/diary/[id]/styled.tsx) |
| `/diary/[id]/export` | 重定向分享页 | [export](../../../app/diary/[id]/export.tsx) |
| `/modal/edit-actions` | 操作菜单别名 | [edit-actions](../../../app/modal/edit-actions.tsx) |

## 辅助页面与框架

| 项目 | 作用与范围 | 源文件 |
| --- | --- | --- |
| `/support/self-harm-notice` | 风险支持展示页；触发规则和正式业务入口未定义，见Q-017 | [notice](../../../app/support/self-harm-notice.tsx) |
| `/verification` | 开发环境确定场景/视觉验收入口，非用户功能；不能用于证明真实解锁 | [verification](../../../app/verification.tsx) |
| 根布局 | 页面栈、透明弹层等框架设置 | [root layout](../../../app/_layout.tsx) |
| tabs 布局 | 底部导航分组框架 | [tabs layout](../../../app/(tabs)/_layout.tsx) |

## 入口连通性

当前详情“更多”进入公开范围，完成后返回详情；独立操作菜单虽然表达继续编辑和分享，但普通业务页尚未连接到该菜单。分享功能本身已表达，仍需补齐可发现的常规入口。页面映射能定位功能，不代表每条导航路径均已通过端到端测试。

首次权限、从排版师开始创作、素材返回、明信片回传、无效草稿与无效日记入口，应作为 Q-009/Q-018 的导航和状态验证场景。
