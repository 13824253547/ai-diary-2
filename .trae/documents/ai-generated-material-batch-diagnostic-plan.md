# AI 素材批量生成故障排查计划

## 概要

逐张检查当前设备素材库中所有 `generationSource=provider` 的 AI 配图，找出不能经过日记生成照片预处理的素材及失败阶段；随后将预检通过的 AI 配图按后端约束分组，串行提交真实日记生成任务，定位上传、后端读图和 Provider 阶段的问题，并修复已证实的根因。

## 当前状态分析

- `src/services/diary-photo-upload.ts` 对服务端 AI 素材调用设备身份授权的 `FileSystem.downloadAsync` 下载到缓存，再用 `ImageManipulator.manipulateAsync` 转成 JPEG。下载或转码异常会被统一改写成“所选照片暂时无法处理”，且当前诊断事件未携带失败素材 ID、序号或请求关联 ID。
- 最近调试事件显示：一组 10 张在 4 张处理完成后，素材下载抛错；另有 3 张全数预处理完成的批次；其它 3 张/5 张批次也在素材下载阶段失败。事件目前不能确认失败的是哪一个素材。
- 同期后端 `/api/photos/materials/:photoId/content` 多次返回 HTTP 200，但日志没有请求关联 ID，不能据此将这些响应与具体客户端失败一一对应。
- `POST /api/generation/jobs` 先校验并暂存上传文件，建单后立即由 `MemoryStoreService` 启动 `DiaryGenerationService.generate(...)`；因此任务提交会调用当前配置的真实模型。生成至少需要 3 张不同照片，上传单图上限 10 MB、总量上限 48 MB，服务默认每个任务最多尝试 2 次。
- 素材库按当前设备隔离，最多 100 张。`generationSource=provider` 可与普通上传素材区分。后端没有删除草稿/生成任务的 API。

## 已确认的范围与约束

- 覆盖当前设备素材库内全部 `source=generated` 且 `generationSource=provider` 的素材；不测试普通上传照片、设备相册照片或 mock 图片。
- 每张素材先独立执行授权下载和 JPEG 预处理，避免一个坏素材遮住同批其它素材的结果。记录稳定素材 ID、序号、阶段、HTTP 状态/请求关联、错误类别和转换结果；不记录照片 URI、Base64、图片内容、生成提示词、身份凭据或模型正文。
- 预检通过的素材全部按合法组提交真实日记生成任务，串行等待每个任务终态。组内仅包含 AI 素材；不得用普通上传/设备照片补足三张门槛。若最后不足三张，则报告预检结果，不创建不合规任务。
- 真实任务会触发 Provider；组数由实际素材数量、预检失败项及 10 MB/48 MB 限制决定。素材库上限 100 张时，通常至多约 34 个任务；每任务最多 2 次 Provider 尝试。用户已确认全量分组提交，并选择保留本轮创建的诊断草稿和生成任务记录。
- 所有诊断草稿使用 `private` 隐私，不调用保存日记接口、不发布、不改写已有草稿/日记或素材。诊断记录保留，其 draftId/jobId 会返回给用户。禁止清库、删除记录、迁移或改动生产数据。
- 临时诊断入口只供本地开发直接访问，不加入常规导航；不改变生产 UI/UX，完成后移除临时入口和一次性调试插桩。

## 实施方案

### 1. 按素材定位客户端下载失败

文件：[src/services/diary-photo-upload.ts](../../src/services/diary-photo-upload.ts)

- 将下载/转码诊断上下文绑定到稳定素材 ID 与该次运行的序号。
- 为单次素材内容下载增加临时 `x-request-id`，将客户端阶段记录与 `.dev-logs/backend.jsonl` 的 HTTP 状态关联。
- 捕获有限且脱敏的下载异常名称/错误码、服务端响应状态、缓存文件大小和转码结果。已存在的开发诊断服务作为本机证据出口；不把诊断数据写入业务接口。
- 根据复现信号进行最小修复：服务端非 200 或文件缺失时修复设备归属/资产读取映射；后端 200 但 Expo 下载本地失败时修复设备下载与缓存落盘路径；下载成功但转换失败时修复 MIME/解码/尺寸归一化。任何分支都必须保留设备身份校验、图片签名验证、文件尺寸限制和临时文件清理。
- 下载和转换失败始终带具体素材 ID 与阶段进入本机开发日志；正式用户反馈沿用通用中文提示，不透出路径、异常栈或凭据。

### 2. 本地开发诊断执行器

新增临时文件：

- `app/debug/material-generation-batch.tsx`：仅开发环境可直接访问的诊断执行入口，不链接到正常页面导航；展示/记录本轮运行号、素材检查结果、批次和任务 ID。
- `src/services/diary-material-diagnostic.ts`：复用 `listMaterialPhotosFromBackend`、当前设备身份、`prepareDiaryPhotoUploads` 和 `HttpCoreDiaryRepository`，按素材库真实顺序筛选 provider AI 配图并驱动检查与任务批次。
- 相应单元测试分别放在 `src/services/__tests__/diary-material-diagnostic.spec.ts` 和 `app/__tests__/material-generation-diagnostic-screen.spec.tsx`。

执行流程：

1. 通过当前 App 的设备身份读取完整素材目录，快照 provider AI 素材 ID 和输入顺序；不从 shell 读取 Keychain、token 或 backend `.env`。
2. 顺序对每张素材执行一次实际客户端下载、图片解码/转 JPEG；记录每张结果。失败项及时清理该项缓存并继续检查其余素材。
3. 将通过项按 3 张起步、单张不超过 10 MB、批次总计不超过 48 MB 组批；尽量每组 3 张，尾组不足 3 张时与前组平衡，仍无法满足门槛/体积限制的项只报告、不补入普通照片。
4. 每组创建一个 ID 可辨识的私密诊断草稿，经真实 HTTP Core Diary Repository 提交 `/generation/jobs`，等待其完成/失败/取消终态后再提交下一组。最多一个同设备 AI 任务同时运行，状态轮询保持串行。
5. 不调用保存日记、不生成已保存作品。每组输出 draftId、jobId、状态、终态错误码、尝试次数和素材 ID 对应关系；不读取或展示模型正文。
6. 如果预检通过的 provider AI 素材总数不足 3 张，不借用普通照片，不提交生成任务；仍完整输出逐项预检结论。

### 3. 按证据修复并验证

- 以请求关联 ID 对照移动端下载、后端内容读取和 `ImageManipulator` 结果，区分资源不存在/归属失败、服务端文件损坏、客户端 HTTP/缓存落盘失败、图片格式/解码失败，以及真实 Provider 失败。
- 保留原素材和请求的身份隔离；不把 Provider 生成失败误报成坏图，不静默改用 mock。
- 使用失败素材及通过素材各做一次针对性复测；随后重跑全部 provider AI 素材预检和用户已批准的真实分组任务，确认失败项状态、成功组结果和所有临时缓存清理。
- 若需要修改后端资产读取逻辑，仅修改当前设备授权内容读取/校验路径及相应测试；不新增 migration 或调用生图服务。

## 测试与验收

- 单测覆盖逐张下载成功/失败、素材 ID 与序号归属、状态码/异常分类、签名/尺寸验证、转换失败、部分成功继续、临时文件清理、分组最小 3 张/48 MB 上限/顺序稳定，以及没有至少 3 张有效 provider 素材时不提交任务。
- Runner 测试使用 ApiClient/Provider 替身验证 draft/job 关联、串行建单与轮询、终态错误区分、不会调用保存日记；替身测试不代替本轮批准的真实任务测试。
- 如改动生成控制器或资产服务，运行对应 controller/service 定向测试；另运行诊断 runner、`src/services/__tests__/diary-photo-upload.spec.ts`、`app/__tests__/generating-screen.spec.tsx`、root typecheck、backend build 和 `git diff --check`。不运行未隔离的全量 e2e，也不执行 CRE-002 全量重测。
- 实际验收以诊断页本机日志、服务端请求日志、每组 GenerationJob 快照和临时文件清理结果为证；精确列出成功/失败素材 ID、错误阶段、批次 draftId/jobId、尝试数和修复后结果。生成文本质量不在本次图片链路验收范围。
- 同步 `docs/reference/delivery/reports/development-progress.md`、`docs/reference/delivery/reports/current-execution-snapshot.md`，并在 CRE-002-009/CRE-005 对应 CASE 记录局部证据；自动化和 mock 结果不改写完整 CASE passed。

## 风险与恢复

- 真实 Provider 调用次数等于有效素材任务组数，失败任务可能自动尝试至多 2 次；总量根据本机实际 provider AI 素材数及逐项预检结果在提交前记录。
- 任务按同设备串行运行；Provider 超时或业务错误必须记录终态，不能把该素材归类为客户端图片损坏。
- 一次性诊断草稿/生成任务由用户选择保留，不自动清理。任何失败批次都保留已有输入和素材；不删除用户素材、不保存为正式日记。
- 若后端凭据/任务服务不可用，仍完成不触发模型的逐项下载与转码预检，并将无法完成的任务批次标记为环境阻塞。
