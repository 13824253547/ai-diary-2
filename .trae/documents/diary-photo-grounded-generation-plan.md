# 日记图片理解与连贯生成实施计划

## Summary

把当前日记生成从“只有照片 ID 和静态事实”升级为真实图片理解：一篇日记的所有已选照片在同一多模态请求中按选择顺序提供给当前已接入的 Ark 模型，由模型结合整组照片生成连贯正文。严格执行用户确认的 N 张照片对应 N 个正文块，不额外生成独立 `quote` 块；每个正文块只关联对应的一张照片。

“重写本段”使用独立提示词，提供整篇其它文字作为只读上下文、目标段落关联的实际照片及目标原文；模型只返回目标段落新文本，Store 只替换该段正文，保留照片引用和其它块。

## Current State Analysis

- 当前三个创作可选排版师定义在 `src/mocks/characters.ts`：`character-blue`（日式杂志、温柔叙事）、`character-green`（复古明信片、风景来信）、`character-brown`（北欧简约、留白诗意）。其它角色目前不是新建创作入口的可选项。
- `backend/src/common/diary-generation.service.ts` 已有生成和局部重写的 OpenAI-compatible 调用及 JSON 结构校验，但系统提示词不区分排版师；生成用户消息只有 `selectedPhotoIds` 和静态 `PHOTO_FACTS`，没有收到实际图片。
- 日记生成当前配置仍为 `AI_PROVIDER=deterministic`；本机 `backend/.env` 只有 `PET_CHAT_*` Ark 配置。`doubao-seed-character-260628` 当前用于 PET-001。不会在文档或提交中暴露本地密钥。
- `POST /generation/jobs` 目前为 JSON 请求；服务端 `Draft` 和 `GenerationJob.inputSnapshot` 只持久化选中照片 ID，不持有照片二进制或可访问 URL。前端 `DiaryPhoto` 有 `uri/localUri`，且通过 `expo-file-system/legacy` 等本地文件能力读取资源。
- 生成结构校验目前允许任意数量的正文块、`quote` 块和不定照片引用；需要将一图一正文及顺序绑定变成后端硬校验，不能只靠提示词约束。
- 工作区已有多处未提交改动。本实现需保留它们，尤其是用户刚修改的 `src/store/create-app-store.ts` 中 PET-001 流式聊天状态逻辑；只在生成/重写相关区域增量修改。

## Assumptions & Decisions

- 已确认复用现有 Ark endpoint、模型和服务端密钥。采用独立日记提示词，不复用小橘聊天系统提示词。模型官方清单将当前模型标注为支持“多模态理解”，Ark Chat API 支持在一条消息中混合文本与图片，并接受图片 URL 或 Base64；这证明接口能力，不代表日记文风质量已经验收。
- provider 选择顺序固定为：可选 `DIARY_GENERATION_PROVIDER` 显式覆盖；未设置时复用完整配置的 `PET_CHAT_PROVIDER=ark-openai-compatible` 及其 `PET_CHAT_*` endpoint/model/key；没有可用 PET provider 时仅沿用 `AI_PROVIDER` 的显式开发/测试设置。生产环境未配置真实 provider 时 fail closed。这样本机现有 `AI_PROVIDER=deterministic` 不会盖过已经配置的 Ark 模型。
- 已确认通过 App 将当前草稿所选原图临时直传后端；不建设对象存储，不把照片二进制或 Base64 放进 MySQL。仅后端向 Ark 的请求发送图片内容。临时文件按设备/草稿/生成轮次隔离，任务终态清理，并由 TTL 清理进程回收异常退出残留；缺图、上传失败、超限和读取失败均明确失败，不静默退回静态或 deterministic 正文。
- 全文生成使用一次包含所有选中图片的联合多模态请求，图片按 `selectedPhotoIds` 顺序与照片 ID 标签交错传入；不对每张照片分别发起正文生成请求。正文每段只绑定同序的一张图，精确生成 N 个 `text` 块；本轮新生成不产出独立 `quote` 块。历史已有 `quote` 块仍可阅读、编辑和单段重写。
- 排版师差异通过后端内置的三份 style profile 提供；共同任务提示负责 JSON 契约、图文顺序和真实性约束，任务提示分别实现“全文生成”和“单段重写”，不能将一个提示词拼接后复用。
- 全文重写上下文只读；目标段落照片原图随 rewrite 请求提供。重写结果不得更换目标照片，不得改变其它段落、标题、摘要或人物数据。
- 尊重现有 Q-003 未决的照片最大数量和尺寸策略，不臆造产品级张数上限。仅实施调用服务所必需的可配置单文件/请求体安全上限；任一选中照片无法按模型限制提交时明确失败，不跳过照片、不减少正文数。
- 不改变正式页面版式、选择路径或新增上传入口；图片上传接入现有生成/重写动作，并沿用已有失败状态和反馈。不会运行真实付费 Ark 调用或上传真实用户照片进行测试；真实质量评测需另行授权。

## Proposed Changes

### Backend prompts and model input

- `backend/src/common/diary-generation.service.ts`
  - 通过现有 `PET_CHAT_*` Ark 配置调用当前模型；增加日记能力自己的 provider 解析/配置优先级，明确缺失配置时 fail closed。仅测试/显式开发配置可启用 deterministic，不得在 Ark 失败时回退为成功。
  - 构造 Ark Chat Completions 多模态消息：每张图片前加入稳定的 photo ID、顺序和可用拍摄日期提示，再加入对应图片 Base64 输入。保留当前 JSON 结果契约的非视觉字段。
  - 全文提示要求一次看完整组图片后组织有开头、发展和收束的连贯日记；逐张理解可见主体、环境、动作和色彩，按照片顺序为每张图片写一个独立但与前后段衔接的正文块；日期仅使用有效拍摄日期提示，文件名和相册名不进入模型输入；未知信息不得从画面臆测，无明确可信地点时不得编造具体地点；不识别或推断敏感身份、关系和不可见事实。
  - 重写提示单独构造，带入排版师风格、当前段落类型/原文、关联图像及整篇其它段落只读文本；要求保留事实、叙事位置和语气连续性，只输出目标段落正文及必要的结构化字段。
  - 增加硬结构校验：恰有 N 个 `text` 块、无新增 `quote` 块；第 i 段只引用第 i 张选中照片；违反即按 provider 结果无效失败，不能修补成假成功。
- `backend/src/common/diary-prompt-templates.ts`（新增）
  - 在服务端集中定义共享事实/隐私/输出策略，以及 `character-blue`、`character-green`、`character-brown` 三种独立风格模板。
  - 分别导出全文生成与单段重写的任务提示构造器，使提示选择路径、排版师映射和规则可独立测试。
- `backend/src/common/diary-generation.service.spec.ts`
  - 覆盖不同排版师选择不同提示、全文/重写提示彼此隔离、图片以所选顺序进入请求、约束/上下文正确、照片数量与对应关系错误时拒绝结果，以及 provider 错误不回退成功。
- `backend/.env.example`
  - 说明可选 `DIARY_GENERATION_PROVIDER` 覆盖项及未显式设置时对 PET_CHAT provider 的复用方式；只记录变量名/示例占位，不写入本机密钥。

### Temporary photo transport and identity

- `backend/src/modules/generation/generation.controller.ts`、`backend/src/modules/generation/generation.module.ts`、`backend/src/common/memory-store.service.ts`
  - 将生成建单输入扩展为带拍摄日期提示和多文件的 multipart 请求；身份校验后验证草稿设备归属、每个 photo ID 均属于该草稿当前 `selectedPhotoIds`，并拒绝重复 ID、非法 MIME、无效图片签名、空文件、过大的单图/总请求体。
  - 重写请求扩展为 multipart，额外接收只读 `contextBlocks` 和目标段落的照片文件；后端仍从设备所属草稿取可信角色及选中照片集合，拒绝调用方越界照片。
  - 使用 OS 临时目录内的隔离资产服务暂存生成任务所需文件；不新增 Prisma 图片表、不公开文件 URL、不接受任意本地路径。任务结束（含失败/取消/耗尽重试）后清理；服务启动/周期性回收超过 TTL 的孤儿文件。恢复任务发现原图不存在时返回明确失败。
- `backend/src/common/temporary-generation-photo-store.ts`（新增）
  - 对 multipart 文件验证、目录隔离、文件读回、任务重试期间保留、终态清理和 TTL 清理提供单一可测试边界。
- `backend/package.json`、`backend/package-lock.json`
  - 引入 Nest/Express multipart 接收所需的显式依赖及类型（优先使用 Nest Express 适配方式，不引入对象存储 SDK）。
- `backend/src/modules/generation/generation.controller.spec.ts`、`backend/src/common/diary-generation.service.spec.ts`、`backend/test/app.e2e-spec.ts`
  - 覆盖设备隔离、草稿归属、照片集合边界、MIME/大小限制、无照片失败、取消/失败清理、重试复用暂存文件、终态删除及孤儿 TTL 回收。
  - e2e 只使用合成图片字节、真实 HTTP 和隔离 MySQL；必须继续通过 `backend/test/e2e-database-safety.ts`。不使用 `db push/reset` 触碰 `ai_diary`。

### App upload and scoped rewrite context

- `src/contracts/core-diary-contract.ts`、`src/repositories/core-diary-repository.ts`、`src/repositories/http-core-diary-repository.ts`
  - 扩展建单和 rewrite 的客户端调用以发送 multipart 文件，不将文件内容放进 JSON contract 或持久快照；保持现有设备身份头和请求取消行为。
- `src/store/create-app-store.ts`
  - 在发起远端生成任务前，从当前草稿 `selectedPhotoIds` 按序读取对应照片资产并上传；有任一上传失败则当前生成轮次进入失败，不建一个缺图成功任务。
  - 发起重写时快照目标及所有其它正文/引用文字作为只读上下文，上传目标块当前关联图像；异步响应仍受现有 draft/block/version/request fingerprint 保护，只更新目标块的 `content`，保留 `photoIds` 和所有其它块。
  - 不更改近期的 PET-001 SSE delta、attempt 或重试逻辑；在同文件中只修改生成/重写相关数据流。
- `src/store/__tests__/diary-domain.spec.ts`、`src/repositories/__tests__/http-core-diary-repository.spec.ts`、`src/contracts/__tests__/core-diary-contract.spec.ts`
  - 覆盖所有选中图上传且顺序稳定、缺图不建单、仅目标图用于 rewrite、全篇文本仅作为只读上下文、rewrite 不改引用、迟到响应不覆盖、请求 multipart 且没有文件数据落入持久化快照。

### Evaluation and delivery records

- `backend/src/common/diary-generation-evaluation.ts`、`backend/src/common/diary-generation-evaluation.spec.ts`
  - 自动检查正文数等于选图数、逐段一一绑定、无额外 quote 块、所有引用合法；人工评分增加“单图事实贴合度”和“跨段连贯性”，并继续评分排版师区分度、可编辑性。
- `backend/src/scripts/run-diary-generation-evaluation.ts`、`docs/reference/delivery/contracts/ai-quality-evaluation-v1.md`
  - 扩展固定评测样本与报告字段，覆盖蓝/绿/棕三风格、多人和纯风景。自动结构测试使用 provider doubles；真实文风评测使用合成/已授权测试图片并独立记录，不用 deterministic 输出冒充模型结果。
- `docs/reference/business-spec/modules/diary-creation.md`、`docs/reference/business-spec/modules/diary-management.md`、`docs/reference/business-spec/open-questions.md`
  - 记录严格一图一正文、共同上下文生成、全量只读单段重写上下文、模型照片处理和失败边界；保留 Q-003 未确认的业务上限及 Q-002 真实质量/成本门槛。
- `docs/reference/delivery/tasks/CRE-005.md`、`docs/reference/delivery/tasks/DIA-002.md`、`docs/reference/delivery/test-cases/CRE-005.md`、`docs/reference/delivery/test-cases/DIA-002.md`、`docs/reference/delivery/reports/development-progress.md`
  - 登记实现文件、自动化 CASE、provider/真实质量尚未执行的范围；仅取得真实证据后更新通过状态。开发台账与验收矩阵继续分开。

## Verification

- 服务单元：模板角色映射、全文与单段 prompt 差异、图像 payload 顺序、输入事实约束、输出结构/cardinality 校验、上传边界和清理生命周期。
- 客户端定向测试：照片读取与 multipart 请求、缺图阻断、重写上下文快照、目标块单独更新及旧响应保护。
- API/隔离数据库测试：生成建单与服务端处理的 HTTP 链路、身份/所有权隔离、provider 使用合成图片请求、失败/取消/重试与文件清理。E2E 使用受保护 runner 和专用 schema。
- `npm run typecheck`、`npm --prefix backend run build`、`git diff --check`。
- 不默认跑全量 Jest、不重复无变化的 CRE-002 或 CRE-005 大套件；按本轮新增风险执行定向覆盖并记录。
- 不发起真实 Ark 付费调用、不提交或打印密钥、不上传真实用户相片作为自动测试素材。代码与 mock/合成图片回归通过后，真实模型质量、iOS 原生文件上传、代理传输/取消及多图成本仍需独立测试轮/授权，不标记为真实 CASE 通过。

## External References

- [火山方舟模型列表](https://www.volcengine.com/docs/82379/1554682)：当前 `doubao-seed-character-260628` 的模型能力清单。
- [火山方舟对话 Chat API](https://www.volcengine.com/docs/82379/1494384)：多模态 `messages.content`、图片输入及 URL/Base64 形式。
- [火山方舟图片理解](https://docs.volcengine.com/docs/82379/1362931?lang=en)：视觉模型图像输入的官方示例与说明。
