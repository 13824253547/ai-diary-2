---
title: "自研AI审核说明与授权提醒"
subtitle: "场景草案 · 不代表配置已更换"
date: "2026年10月29日"
lang: zh-CN
---

> 本文件按“模型已自研、由运营方自行运营且不向外部模型提供方传输用户内容”的假设编写。实际部署未核验。若仍使用第三方推理、模型托管或其他会接收用户数据的服务，须如实披露，不能因模型权属为自研就省略接收方。

## 商店描述替换段落

**中文**

AI旅行日记帮助你把照片写成游记、和小橘聊聊日常，整理回忆并生成配图。AI功能需要联网，相关照片和文字由服务处理。AI内容提供来源提示，可能存在偏差，请在保存或分享前核对。详见隐私政策。

**English**

AI Travel Diary helps you create photo journals, chat with Xiaoju, organize memories, and generate images. AI features require internet access; relevant photos and text are processed by the service. AI content includes origin notices and may contain inaccuracies. Review it before saving or sharing. See the privacy policy.

此段替换简版上架材料中的AI处理说明，其余功能描述不变。不要同时保留“自运营模型”与“由第三方模型处理”两种互相矛盾的说法。

## 审核备注补充

**中文**

本应用的AI创作与陪伴功能由我们自主研发并运营的模型提供支持，相关处理在服务端完成，不是全部在设备本地进行。首次使用相关功能前向用户说明照片或文字的处理范围，并提供所需许可及撤回方式。日记和AI图片提供来源提示，使用AI图片制作的明信片在保存与分享时保留标识。

**English**

AI creation and companion features are powered by models developed and operated by us. Processing takes place on our servers, not entirely on the device. Before first use of relevant features, users are informed about the photos or text being processed and are provided with the required consent and withdrawal options. Journals and AI images include origin notices; postcards made with AI images retain their label when saved or shared.

只有模型部署、许可、撤回与标识均与上述描述一致后才可提交。不把未实现的弹窗或设置入口写成已可用功能。

## 提醒放在哪里

**推荐：首次使用相关AI功能时提醒，不在App启动时立即强制弹窗。** 一般隐私政策告知按实际首次使用流程提供，与分用途AI提醒分开；允许用户先了解App。

| 场景 | 提醒时机 | 必须说清楚的重点 |
|---|---|---|
| 日记生成 | 用户选好照片后、首次向生成服务上传前 | 处理所选照片；若保存后自动整理文字记忆，应明确说明这一额外用途 |
| 萌宠聊天 | 第一次发送消息前 | 处理聊天文字和必要历史，也会参考近期日记摘要 |
| AI配图 | 第一次提交生成描述前 | 使用输入的场景描述生成图片 |
| 个人洞察 | 第一次发起全库分析前 | 会分析当前有效日记正文，而非仅当前一篇 |
| 权限与授权管理 | 在易找到的设置或隐私入口 | 查看已授权用途，撤回后停止后续处理及相关后台任务 |

同一用途已获有效许可时，不必每次弹窗；新增用途、扩大数据范围或变更接收方时，重新判断告知和许可。不能等照片已上传、聊天已发送后再提醒，也不能将相册系统权限当作对AI分析的同意。

真正自运营、未向第三方AI提供数据时，Apple关于“第三方AI共享前明确许可”的特定要求不能直接当作仍有第三方的证明；但一般数据收集许可、敏感内容、透明说明、用户选择和实际发行地区的法律仍需落实。自研不是不需要告知，也不是可以默认用私人内容训练模型。

## 提醒文案草案

**日记创作**

“你选择的照片将用于AI创作可编辑游记。保存后，还会整理相关文字记忆，供你回看。请确认是否同意这些用途。”

**萌宠聊天**

“AI会处理你发送的聊天文字，并参考近期日记摘要生成回复。请确认是否同意这些用途。”

**配图**

“AI会根据你的场景描述生成配图并保存到素材库。生成图片不是实拍记录。”

**个人洞察**

“AI会分析本设备已保存的日记正文，用于成长记录和个人洞察。新保存或修改的日记也会用于后续分析。”

按钮建议：“同意并继续”“暂不使用”，配套隐私政策链接及真实撤回入口。合并多个用途时，应允许用户理解和选择，不默认勾选或把训练许可捆绑其中。

## 发布前只需确认

- 实际模型研发和运营归属，以及是否存在接收数据的外部推理服务。
- 运营主体、联系邮箱、存储地区、保留与删除期限。
- 提醒在传输或后台分析之前出现；拒绝与撤回能真正停止相关处理。
- 应用内身份删除可用，政策、商店隐私标签和正式服务一致。

本次只生成文案，不更换模型、添加弹窗、修改设置或实施删除流程。实际功能改动需另行明确授权。
