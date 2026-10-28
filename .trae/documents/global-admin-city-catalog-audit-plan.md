# 全球城市目录行政层级审计与重建计划

## 摘要

逐区审计当前非大陆城市目录，将中国大陆以外的 WUP 城市聚居区名录改为各国家/地区官方认定的 City / Municipality 行政单位。只纳入有来源证据支持其城市级行政身份的记录；不以人口、英文后缀、地图地名标签或主观判断代替行政分类。保留既有地区政治显示标签和必要的印章 ID 兼容。

## 当前状态

- 当前运行时目录有 14,665 条记录：大陆 297 个民政部市级单位，非大陆 14,368 条 WUP 2025 F21 聚居区。
- 非大陆 WUP 定义描述人口与密度阈值下的连续城市聚居区，不保证每一项都是该国的城市/市政行政单位；因此 WUP 名录不能用作各国官方市级单位清单。
- 对 14,368 条非大陆记录按名称作只读初筛，发现 135 条含 `county`、`district`、`township`、`village` 等词的候选，分布于多个地区。该初筛包含合法城市名称（如 `Cape Town`），只能作为逐项审计线索，不能直接按后缀删除。
- 当前目录来源及标签混合 WUP 原名、GeoNames、UNGEGN、Wikidata、OSM 与人工覆盖；记录中尚无统一、可证明各国行政级别的来源清单。
- 已查明城市印章用于明信片时通过路由参数解析配置；当前 PCD-001 `make()` 尚不生成持久化图片资产。继续保留 `stampKyoto`、`stampKamakura`、`stamp` 三个既有装饰 ID。非大陆 WUP 城市 ID 若能与新官方市级单位通过来源证据唯一对应，可增加仅供读取旧路由的 ID 映射；不能唯一对应的旧记录不作为新城市收录。

## 已确认决策

- 审计顺序按当前 `cityStampCatalogAreas` 地区顺序逐区推进，包括中国大陆以外的全部 193 个地区；中国大陆已完成的 4 个直辖市和 293 个地级市不重做。
- “市级单位”采用各地官方定义：纳入法定或官方行政数据明确分类为 City / Municipality 的城市型单位。宽泛的基层 Commune / Municipality 若同时覆盖乡村、且官方不认定为城市型单位，不纳入。明确属于县、区、镇、Township、村、自治州、地区、盟或纯聚居区的记录不纳入，除非该地区官方制度明确将该实体归类为城市/市政行政单位。
- 香港和澳门继续分别作为单一地区单位，不把区或堂区扩成城市；中国台湾地区继续沿用现有政治显示标签，目录单位按当地官方的城市/市政建制核验。
- 首选国家/地区政府行政区划代码、官方统计名录或法律/行政公开目录。用户允许在官方资料不足时采用权威国际来源，但来源必须明确提供行政单位类别或可验证的行政层级；单纯的 WUP 聚居区、GeoNames populated-place、OSM `place=city/town` 标签或名称相似性不能证明行政级别。
- 官方政府公开名录可用作事实来源，即使页面没有单独列出数据许可；必须保留发布机构、链接及数据截止日期。非官方国际来源须有明确、兼容的再利用许可。无法核实城市级身份的地区作为来源缺口报告，不用 WUP 回填、不猜测、不伪造记录；其余已核实地区可发布。
- 外文名优先使用来源可证的官方英文/外文名；缺少官方外文名时，允许采用对应文字的标准罗马化，并记录 `latinNameSource` 和转写标准。转写不宣称为官方英语名称；无法可靠转写时保留原文字并在审计报告中列缺口。
- 城市序号在每个地区内部按中文名称拼音或已记录的标准罗马化排序，从 `01` 起，不表示官方行政排名。地点解锁继续要求已保存且 `ready` 的日记地点完整匹配；多个同名单位需要省份/上级行政区信息唯一消歧。
- 用户此前确认的来源面板移除规则不变：不增加展开式来源 UI；按来源许可保留必要的 OSM 贡献者署名。完整来源证据放在目录元数据和项目审计文件中。

## 实施方案

### 来源审计和规范数据

- 新增 `tools/city-stamps/area-audit.json`，以地区 ID 顺序记录每个地区的单位定义、官方行政类别、所用来源及链接、数据截止日期、复用许可、核验数量、排除规则、未解决缺口和审计状态。一个地区只有所有候选来源审阅完才标为已审。
- 新增 `tools/city-stamps/admin-city-units.json` 作为可重复构建的规范数据输入。每条记录包含稳定 ID、地区 ID、当地官方名称、中文名（有来源时）、官方英文/罗马化名、行政单位类别、行政代码或原始稳定实体 ID、省份/上级行政区、名称来源、许可与引用。无可验证 ID、单位类别或名称的候选不能静默进入运行时目录。
- 逐区审计当前 14,368 条 WUP 候选。对每条分别记录“映射到正式市级单位”“仅为聚居区或下级单位”“同名歧义”“来源缺失”等结论；WUP 仅用作交叉比对和发现遗漏的辅助索引，不再决定最终收录资格。
- 对无可用官方开放接口的地区，使用可验证的官方网页/文件快照，并保存来源版本和访问日期；若只能找到名称或 populated-place 坐标、无法确认行政级别，则记为缺口。
- 汇总所有来源许可。官方公开行政名录按用户决定记录署名而不推断未声明授权；非官方来源许可不明或不兼容时不使用。若使用 OSM 衍生内容，目录数据仍遵循 ODbL-1.0 并保留版权署名。

### 构建与目录接口

- 更新 `tools/city-stamps/build-catalog.py`：保留中国大陆当前 MCA 来源；非大陆城市按 `admin-city-units.json` 构建，而不是保留全部 WUP 记录。仅收录行政类别通过审核且 ID、名称、来源字段齐备的单位；生成区级覆盖/缺口报告。
- 运行时记录增加 `administrativeLevel`、`administrativeCode` 或 `sourceEntityId`、`provinceName`、`nameSource`、`latinNameSource` 和 `sourceId`。稳定 ID 采用官方行政代码或来源稳定 ID，不使用排序序号或名称猜测生成实体身份。
- `src/components/library/city-stamp-catalog.ts` 保留原有 3 个 legacy stamp ID；地点消歧优先使用城市精确名称，其次用官方上级行政区唯一消歧。近似、来源缺口和名称回退候选不得被当作官方城市单位解锁。
- `app/library/cities.tsx` 搜索继续支持中外文名称，并支持省份/行政类别筛选或显示；地区列表只呈现有核实城市的地区。为符合现有偏好，不增加来源说明面板，只保留许可要求的最小 OSM 署名。
- 更新 `src/data/city-stamp-catalog.json`。记录数量由审计快照计算，不预设 WUP 总数；目录元数据保留全部已用来源，缺口统计在审计文件中列明。

### ID 和历史兼容

- 保持 `stampKyoto`、`stampKamakura`、`stamp` 的既有解析和渲染行为。
- 对新行政名录与旧 WUP 城市做有证据的精确交叉表。仅在一对一确定时，将旧 WUP ID 映射到正式市级单位，用于读取旧路由；不确定映射不得通过名称子串或最近点强行迁移。
- 不新增数据库迁移。若运行时仍发现 WUP 城市 ID 进入持久化路径，先在代码审查中记录影响，并只保留可验证的一对一兼容映射。

## 文件范围

- `tools/city-stamps/area-audit.json`：逐地区来源核验状态与缺口清单。
- `tools/city-stamps/admin-city-units.json`：规范化的官方城市单位源快照。
- `tools/city-stamps/build-catalog.py`：严格类别过滤、跨来源合并、稳定 ID、数据校验及来源元数据。
- `tools/city-stamps/README.md`：定义、来源优先级、许可边界、刷新方式和缺口规则。
- `src/data/city-stamp-catalog.json`：最终随包目录。
- `src/components/library/city-stamp-catalog.ts`：新的记录字段、地区分组、行政区消歧和兼容 ID。
- `app/library/cities.tsx`：目录城市展示、搜索和行政区提示。
- `src/components/library/__tests__/city-stamp-catalog.spec.ts`、`app/__tests__/library-city-catalog.spec.tsx`、`app/__tests__/library-city-catalog-sources.spec.tsx`、`app/__tests__/postcard-screen-assets.spec.tsx`：目录、缺口排除、行政类别、省份消歧、许可署名与历史 ID 回归。
- `tools/city-stamps/test_build_catalog.py`：官方单位类别、来源有效性、重复/缺字段、稳定 ID 和地区覆盖测试。
- `docs/reference/business-spec/modules/material-library.md`、`docs/reference/delivery/tasks/MAT-003.md`、`docs/reference/delivery/test-cases/MAT-003.md`、`docs/reference/delivery/reports/development-progress.md`：同步全球边界、核验数和执行状态，保留历史证据。

## 验收标准

- 已审核地区的运行时目录只包含当地正式分类为城市/城市型市政单位的条目；下级行政区、普通乡村市政体和仅为 WUP populated-place 的候选不能进入目录。
- 每条均保留可追溯的行政分类、稳定身份来源、名称来源、上级行政区及许可/引用；外文标准转写与官方外文名明确区分。
- 所有地区按既有顺序有一条可审计状态；无法核实的地区/记录进入缺口报告，不由 WUP 或模型名称补齐。
- 同名城市可由官方省份/上级行政区信息消歧；模糊子串、未知来源和非 `ready` 日记仍不能解锁。
- 保留 3 个 legacy stamp ID 和 OSM 必需署名，不改变既有 UI 宽度/印章尺寸或创建不相关数据库迁移。

## 验证步骤

1. 按地区显示顺序逐一完成单位类别与来源/许可登记，核实 135 个词面初筛候选但不把初筛结果当作错误结论。
2. 对来源快照做记录数量、单位类别、稳定 ID、名称来源、parent/province、重复和缺口校验。
3. 构建运行时目录，验证仅行政市政单位进入目录，逐区数量与来源快照完全一致，来源缺失项只出现在缺口报告。
4. 运行 `python3 tools/city-stamps/test_build_catalog.py`、城市目录/浏览/来源许可/明信片定向 Jest suites、`npm run typecheck` 和 `git diff --check`。
5. 对大陆/台湾/香港/澳门、含行政区消歧的重复名称、缺来源地区和旧 stamp ID 执行目录页面回归；未运行模拟器或真实设备时不声称目视验收通过。
