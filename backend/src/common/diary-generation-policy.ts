export type DiaryGenerationPolicyCode = 'out_of_scope' | 'unsafe_request';

const PROMPT_OVERRIDE_PATTERNS = [
  /(?:忽略|无视|覆盖|忘记).{0,16}(?:系统|之前|以上|前面|安全|范围|限制|提示词|规则)/i,
  /(?:ignore|disregard|override).{0,32}(?:system|previous|above|instructions|rules|safety)/i,
  /(?:泄露|输出|显示|打印).{0,12}(?:系统提示|隐藏提示|内部指令|密钥)/i,
  /(?:reveal|print|show).{0,24}(?:system prompt|hidden instructions|secret key)/i,
];

const CODE_REQUEST_PATTERNS = [
  /(?:帮我|请|给我|替我|为我).{0,12}(?:写|生成|编写|开发|实现|制作|输出).{0,20}(?:代码|脚本|程序|算法|python|javascript|typescript|sql|html|css)/i,
  /(?:写|生成|编写|开发|实现|制作|输出).{0,20}(?:代码|脚本|程序|算法|python|javascript|typescript|sql|html|css)/i,
  /(?:代码|脚本|程序|算法|python|javascript|typescript|sql|html|css).{0,20}(?:帮我写|怎么写|如何编写|生成|实现)/i,
];

const FICTION_REQUEST_PATTERNS = [
  /(?:帮我|请|给我|替我|为我)?.{0,8}(?:写|创作|生成|续写|编一个).{0,20}(?:小说|剧本|网文|童话|架空故事|虚构故事|故事大纲|人物设定)/i,
  /(?:小说|剧本|网文|童话|架空故事|虚构故事|故事大纲).{0,20}(?:帮我写|续写|创作|生成)/i,
];

const COMMERCIAL_REQUEST_PATTERNS = [
  /(?:帮我|请|给我|替我|为我)?.{0,10}(?:写|生成|制作|策划|包装|润色).{0,20}(?:广告|营销|带货|推广|招商|促销|商业文案|品牌宣传|销售话术)/i,
  /(?:广告|营销|带货|推广|招商|促销|商业文案|品牌宣传|销售话术).{0,20}(?:帮我写|制作|生成|润色|策划)/i,
];

const UNSAFE_TOPIC_PATTERNS = [
  /(?:炸弹|爆炸物|枪支制作|毒药|毒品制作|自杀(?:的)?方法|自残(?:的)?方法|杀人方法|伤人方法|勒索软件|恶意软件|木马病毒|钓鱼邮件|盗号|入侵他人|漏洞利用|绕过认证)/i,
  /(?:bomb making|malware|ransomware|phishing|steal credentials|break into|evade authentication|self-harm method|suicide method)/i,
];

const UNSAFE_INSTRUCTION_PATTERNS = [
  /(?:教我|告诉我|怎么|如何|步骤|制作|生成|编写|攻击|破解|实施|详细方法)/i,
  /(?:teach me|how to|steps to|instructions for|make a|build a|write malware)/i,
];

const GENERATED_CODE_PATTERNS = [
  /```[\s\S]*?```/,
  /<script\b[\s\S]*?<\/script>/i,
  /(?:^|\n)\s*(?:def\s+\w+|function\s+\w+\s*\(|class\s+\w+\s*[:{]|import\s+\w+|SELECT\s+.+\s+FROM\s+)/im,
];

const GENERATED_COMMERCIAL_PATTERNS = [
  /(?:限时优惠|立即购买|立即下单|点击下单|扫码购买|购买链接|下单链接|优惠码|买一送一|关注转发抽奖|私信购买)/,
  /(?:广告文案|营销文案|带货话术|招商话术|产品卖点)/,
];

const GENERATED_FICTION_PATTERNS = [
  /(?:^|\n)\s*第[一二三四五六七八九十百\d]+章[：:\s]/,
  /(?:小说正文|剧本正文|人物设定|故事大纲)[：:]/,
];

function normalizeText(value: string) {
  return value.normalize('NFKC').toLowerCase();
}

export function classifyDiaryGenerationInput(value: string): DiaryGenerationPolicyCode | undefined {
  const text = normalizeText(value);
  if (PROMPT_OVERRIDE_PATTERNS.some(pattern => pattern.test(text))) return 'out_of_scope';
  if (UNSAFE_TOPIC_PATTERNS.some(topic =>
    topic.test(text) && UNSAFE_INSTRUCTION_PATTERNS.some(instruction => instruction.test(text)))) {
    return 'unsafe_request';
  }
  if (
    CODE_REQUEST_PATTERNS.some(pattern => pattern.test(text))
    || FICTION_REQUEST_PATTERNS.some(pattern => pattern.test(text))
    || COMMERCIAL_REQUEST_PATTERNS.some(pattern => pattern.test(text))
  ) return 'out_of_scope';
  return undefined;
}

export function classifyDiaryGenerationOutput(value: string): DiaryGenerationPolicyCode | undefined {
  const text = normalizeText(value);
  if (
    PROMPT_OVERRIDE_PATTERNS.some(pattern => pattern.test(text))
    || GENERATED_CODE_PATTERNS.some(pattern => pattern.test(text))
    || GENERATED_COMMERCIAL_PATTERNS.some(pattern => pattern.test(text))
    || GENERATED_FICTION_PATTERNS.some(pattern => pattern.test(text))
  ) return 'out_of_scope';
  if (UNSAFE_TOPIC_PATTERNS.some(topic =>
    topic.test(text) && UNSAFE_INSTRUCTION_PATTERNS.some(instruction => instruction.test(text)))) {
    return 'unsafe_request';
  }
  return undefined;
}

export function getDiaryGenerationPolicyMessage(
  code: DiaryGenerationPolicyCode,
  phase: 'input' | 'output',
) {
  if (code === 'unsafe_request') {
    return phase === 'input'
      ? '该请求涉及可能造成伤害的操作，已拦截；此功能仅用于整理日记内容。'
      : '生成结果涉及可能造成伤害的操作，未予采用；请检查照片或原文后重试。';
  }
  return phase === 'input'
    ? '此功能仅用于整理日记和已选照片，不支持代码、小说或商业推广内容。'
    : '生成结果超出日记内容范围，未予采用；请检查照片或原文后重试。';
}
