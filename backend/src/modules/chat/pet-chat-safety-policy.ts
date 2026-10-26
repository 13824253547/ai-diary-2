export type PetChatPolicyCode = 'out_of_scope' | 'unsafe_request';

const PROMPT_OVERRIDE_PATTERNS = [
  /(?:忽略|无视|忘记|覆盖|绕过).{0,24}(?:之前|以上|全部|所有)?(?:系统|开发者)?(?:提示词|指令|规则|限制)/i,
  /(?:泄露|显示|打印|复述|导出).{0,20}(?:系统|开发者)?(?:提示词|隐藏指令|内部规则)/i,
  /(?:ignore|disregard|override|bypass).{0,32}(?:previous|system|developer).{0,16}(?:prompt|instruction|rule)/i,
  /(?:ignore|disregard|override|bypass).{0,24}(?:(?:all|your|the).{0,10})?(?:rules|instructions|restrictions|safety policy)/i,
  /(?:reveal|print|show|dump).{0,24}(?:system|developer).{0,16}(?:prompt|instruction)/i,
  /\b(?:jailbreak|dan mode|developer mode)\b/i,
];

const UNSAFE_REQUEST_PATTERNS = [
  /(?:教我|告诉我|帮我).{0,12}(?:自杀|自残)(?:的方法|方式|步骤)?/i,
  /(?:怎么|如何)(?:去|才能)?(?:自杀|自残)/i,
  /(?:如何|怎么|教我|告诉我|方法|步骤|教程).{0,20}(?:自杀方法|自残方法|结束生命|伤害自己)/i,
  /(?:自杀|自残|结束生命|伤害自己).{0,20}(?:方法|步骤|工具|怎么做|如何实施)/i,
  /(?:如何|怎么|教我|帮我|步骤|方法|制作|制造|配制).{0,24}(?:炸弹|炸药|爆炸物|毒药|枪支|武器|杀人|伤人)/i,
  /(?:炸弹|炸药|爆炸物|毒药|枪支|武器).{0,24}(?:怎么做|制作|制造|配制|教程|步骤)/i,
  /(?:如何|怎么|教我|帮我|写|生成|制作|部署).{0,24}(?:病毒|木马|勒索软件|钓鱼攻击|盗号|入侵系统|窃取密码|绕过登录)/i,
  /(?:如何|怎么|教我|帮我|步骤|教程|伪造).{0,24}(?:诈骗|骗钱|洗钱|假证|骗取密码)/i,
  /(?:如何|怎么|教我|帮我|追踪|监听|定位|窃取).{0,24}(?:别人|他人|前任|个人信息|住址|密码|账号)/i,
  /(?:如何|怎么|教我|帮我|步骤|方法).{0,20}(?:撬锁|潜入|避开监控|偷拍视频|跟踪前任|偷看手机)/i,
  /(?:如何|怎么|教我|帮我|生成|制作).{0,24}(?:未成年人色情|儿童色情|非自愿裸照|报复性色情)/i,
  /(?:instructions?|steps?|how to).{0,32}(?:self[- ]?harm|suicide|make a bomb|poison|weapon|malware|ransomware|phishing|steal passwords|break into)/i,
];

const OUT_OF_SCOPE_REQUEST_PATTERNS = [
  /(?:帮我|替我|请你|请帮我|能不能帮我|可以帮我|给我|代我).{0,20}(?:写|生成|编写|创作|续写|开发|实现|设计|制作|撰写|起草).{0,24}(?:代码|程序|脚本|算法|python|javascript|typescript|sql|html|小说|故事|剧本|歌词|诗歌|广告|营销|推广|带货|商业计划|投标|销售话术)/i,
  /(?:生成|编写|续写|开发|实现|设计|制作|撰写|起草).{0,12}(?:一个|一份|一篇|一段|一套|个|份|篇)?\s*(?:python|javascript|typescript|sql|html|代码|程序|脚本|小说|故事|剧本|歌词|诗歌|广告文案|营销文案|推广文案|商业计划|投标书|销售话术)/i,
  /(?:写(?:一个|一份|一篇|一段|一套|个|份|篇)).{0,12}(?:python|javascript|typescript|sql|html|代码|程序|脚本|小说|故事|剧本|歌词|诗歌|广告文案|营销文案|推广文案|商业计划|投标书|销售话术)/i,
  /(?:write|generate|create|draft|build|code|develop).{0,32}(?:code|script|software|novel|fiction|screenplay|marketing copy|advertisement|sales pitch|business plan)/i,
  /(?:忽略|无视|忘记|绕过).{0,24}(?:小橘|陪伴|日常聊天|业务范围|聊天范围|主题限制)/i,
];

const DISALLOWED_REPLY_PATTERNS = [
  /```/,
  /^\s*(?:import\s+[\w{*]|from\s+[\w.]+\s+import|export\s+(?:default|const|function|class)|function\s+\w+|class\s+\w+|def\s+\w+\s*\(|const\s+\w+\s*=|SELECT\s+.+\s+FROM|<html\b)/im,
  /^\s*(?:第一章|第二章|序章|第一幕|故事正文|小说正文)[：:\s]/m,
];
const SAFE_REFUSAL_PATTERN = /(?:不能|不会|无法|不可以|拒绝|不提供|不协助).{0,24}(?:自杀|自残|自伤|伤人|武器|炸药|诈骗|木马|代码|小说|商业文案)/i;

function normalizeText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function classifyPetChatInput(value: string): PetChatPolicyCode | undefined {
  const text = normalizeText(value);
  if (PROMPT_OVERRIDE_PATTERNS.some(pattern => pattern.test(text))) return 'out_of_scope';
  if (UNSAFE_REQUEST_PATTERNS.some(pattern => pattern.test(text))) return 'unsafe_request';
  if (OUT_OF_SCOPE_REQUEST_PATTERNS.some(pattern => pattern.test(text))) return 'out_of_scope';
  return undefined;
}

export function classifyPetChatReply(value: string): PetChatPolicyCode | undefined {
  const text = normalizeText(value);
  if (DISALLOWED_REPLY_PATTERNS.some(pattern => pattern.test(text))) return 'out_of_scope';
  if (SAFE_REFUSAL_PATTERN.test(text)) return undefined;
  if (UNSAFE_REQUEST_PATTERNS.some(pattern => pattern.test(text))) return 'unsafe_request';
  return undefined;
}

export function getPetChatPolicyMessage(code: PetChatPolicyCode) {
  return code === 'unsafe_request'
    ? '这个请求可能带来伤害，我不能提供相关方法。如果你正遇到困难，我可以陪你聊聊，也请联系身边可信任的人。'
    : '小橘主要陪你聊日常、心情和旅行回忆，暂不提供代码、小说或商业内容创作。';
}
