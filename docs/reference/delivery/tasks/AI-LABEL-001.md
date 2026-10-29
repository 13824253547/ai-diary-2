# AI-LABEL-001 AI来源标识与线上发布材料

日期：2026-10-29。状态：本地实现及定向验证完成，真机和正式服务验收待完成。

本任务是用户新增授权范围，不加入原42项任务或225条验收的通过统计。

## 需求与边界

- 用户授权在日记、AI素材及使用自有AI图片制作的明信片中添加来源标识，并更新隐私政策、上架和审核文案。
- 不部署服务器、不修改正式域名和App Attest环境、不调用计费Provider、不修改其他UI参数、导航、照片下限、素材容量或随机印章规则。
- 依据《人工智能生成合成内容标识办法》增加显式提示和文件来源元数据；不声称本次完成全部GB标准及上传传播治理验收。

## 实现

- 日记阅读与发现详情共用`DiaryPaper`的“含AI生成内容，可经用户编辑，请核对”；编辑、分享海报和PDF也有提示。当前日记创作类型全部经过AI生成；未来人工创作需另增可靠来源字段。
- `isGeneratedPhoto`按登记来源判定本应用生成素材，不按标题或画面推测；Photo、素材缩略图和预览保留可见提示。
- 服务端新生成文件入库前加入`AI GENERATED`水印与XMP，保持原尺寸、格式，保留已有供应商XMP。历史生成素材的鉴权读取补标，不批量覆盖用户文件；不满足图像处理条件则失败，不返回无标识成功。
- 日记照片副本查询按当前设备匹配尚存在的素材来源，避免恢复覆盖其生成来源；新标识文件复制后仍保留标识。历史副本原素材已删除且无标识时不猜测来源。
- AI图片明信片在被捕获的卡片范围显示小标识，修改“真实回忆”误导文案；普通照片不添加AI标识。来源状态加入捕获输入版本，导出PNG加入AIGC元数据，失败清理不外发。
- 日记PDF增加显式文本与XMP；旧长图导出未接通状态保持，不以新标识宣称已接通导出。
- 政策1.1和中英文审核备注补充线上域名、云商/备份/CDN、权限与文件私有性、标识和同意的区别及审核披露；实际部署信息仍待填。

主要源码：`src/components/common/ai-content-label.tsx`、`src/services/ai-content-provenance.ts`、`src/services/ai-file-metadata.ts`、`src/components/diary/`、`app/library/index.tsx`、`app/postcard/index.tsx`、`app/diary/[id]/edit.tsx`、`app/share/result.tsx`、`src/services/postcard-export.ts`、`src/services/share-export-file-service.ts`、`backend/src/common/ai-image-label.ts`、`backend/src/modules/photos/photo-asset.service.ts`。

## 验证与交付

- 集中定向前端10 suites / 86 tests、后端3 suites / 22 tests通过，合计108项，不代表原CASE全部通过。
- 实际PNG编码器验证320×240图片插入AIGC块后仍可完整解码；服务端PNG/JPEG/WebP测试覆盖尺寸、标识像素、XMP保留、重复处理幂等和坏文件失败。
- 前后端类型检查、差异格式检查通过；未执行MySQL e2e、付费模型、真机相册、第三方接收或线上环境验收。页面测试有act测试环境警告，未修改全局测试设置或压制日志。
- 新依赖`sharp`仅位于后端；首次版本审计发现安全公告后已升级至`^0.35.5`并复测上述后端22项、后端类型检查。前端明信片异步等待调整后14项复测通过，不重复累计测试数。
- `npm audit --omit=dev`现不再报告sharp风险；其他现有后端生产依赖仍有1项中风险、6项高风险公告，未执行自动audit fix或擅自升级，应列为正式部署前安全处理项。

测试案例：[AI-LABEL-001](../test-cases/AI-LABEL-001.md)。正式材料：`docs/reference/privacy-policy.md`、`privacy-policy-research.md`、`app-store-materials.md`及对应Word文件。

## 发布前剩余事项

- 提供真实域名、云商、存储与备份地区、运营主体、联系渠道和留存期限；完成第三方AI许可、应用内删除及公开内容治理。
- 真机检查标识清晰度、图片完整比例、字体、卡片布局、导出可读性及系统相册是否保留元数据；检查第三方平台转码后处理。
- 专项检查GB 45438-2025字段/样式与平台互操作，外部上传元数据检测/用户声明及其他AI交互标识；准备用户服务协议标识条款，不以隐私政策替代。
- 升级旧用户已导出文件需新的合法流程，不能远程保证补标；本次未修改用户已有文件或数据库。
