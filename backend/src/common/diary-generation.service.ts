import { Injectable } from '@nestjs/common';

export type GenerationInputSnapshot = {
  draftId: string;
  draftVersion: number;
  type: string;
  characterId: string;
  selectedPhotoIds: string[];
  privacy: string;
  sourceDiaryId?: string;
};

export type GenerationBlockRecord =
  | { id: string; type: 'text'; title?: string; content: string; photoIds?: string[] }
  | { id: string; type: 'quote'; content: string; photoIds?: string[]; relatedBlockId?: string }
  | { id: string; type: 'photo'; photoId: string; caption: string; relatedBlockId?: string };

export type GenerationPersonRecord = {
  id: string;
  name: string;
  photoIds: string[];
  avatarPhotoId: string;
};

export type GenerationResultRecord = {
  title: string;
  summary: string;
  location: string;
  date: string;
  companionName: string;
  coverPhotoId: string;
  posterPhotoIds: string[];
  blocks: GenerationBlockRecord[];
  people?: GenerationPersonRecord[];
};

export type RewriteInputSnapshot = {
  draftId: string;
  blockId: string;
  draftVersion: number;
  characterId: string;
  blockType: 'text' | 'quote';
  content: string;
  selectedPhotoIds: string[];
  photoIds?: string[];
};

export type RewriteResultRecord = {
  draftId: string;
  blockId: string;
  draftVersion: number;
  blockType: 'text' | 'quote';
  content: string;
  photoIds?: string[];
};

export class DiaryGenerationProviderError extends Error {
  constructor(
    readonly code: 'timeout' | 'provider_failed' | 'cancelled',
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const PHOTO_FACTS: Record<string, { title: string; location: string; date: string }> = {
  'photo-1': { title: '赤崁楼的午后', location: '台南 · 赤崁楼', date: '2024.09.12' },
  'photo-2': { title: '神农街慢慢走', location: '台南 · 神农街', date: '2024.09.12' },
  'photo-3': { title: '夕阳落在海上', location: '台南 · 安平', date: '2024.09.12' },
  'photo-4': { title: '一碗台南味道', location: '台南 · 老街', date: '2024.09.13' },
  'photo-5': { title: '巷子里的咖啡馆', location: '台南 · 中西区', date: '2024.09.13' },
  'photo-6': { title: '一束小小的花', location: '台南 · 花店', date: '2024.09.13' },
  'photo-7': { title: '远山与云', location: '台南 · 郊外', date: '2024.09.13' },
  'photo-8': { title: '把海风装进口袋', location: '台南 · 渔光岛', date: '2024.09.14' },
  'photo-9': { title: '城市的晚灯', location: '台南 · 夜市', date: '2024.09.14' },
  'photo-10': { title: '下一站，回忆', location: '台南 · 火车站', date: '2024.09.14' },
  'photo-11': { title: '镜头里的自己', location: '台南 · 老街', date: '2024.09.14' },
  'photo-12': { title: '一起旅行的人', location: '台南 · 老街', date: '2024.09.14' },
  'photo-13': { title: '蓝白色的夏天', location: '圣托里尼', date: '2026.08.20' },
  'photo-14': { title: '清晨的热气球', location: '卡帕多奇亚', date: '2026.08.15' },
  'photo-15': { title: '湖边的小镇', location: '因特拉肯', date: '2026.08.10' },
  'photo-16': { title: '黄昏海岸线', location: '高雄 · 西子湾', date: '2026.08.09' },
  'photo-17': { title: '蓝色小屋前', location: '海边小镇', date: '2026.08.08' },
  'photo-18': { title: '一起吃晚饭', location: '台南 · 餐馆', date: '2026.08.07' },
  'photo-19': { title: '甜点收尾', location: '台南 · 甜品店', date: '2026.08.07' },
  'photo-20': { title: '清晨问候', location: '旅途清晨', date: '2026.08.06' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireProviderString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`provider result is missing ${field}`);
  }
  return value.trim();
}

function stripMarkdownFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '').trim();
}

function parseJsonObject(value: string) {
  const cleaned = stripMarkdownFence(value);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('provider did not return a JSON object');
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

function normalizePhotoIds(value: unknown, selectedPhotoIds: string[], source: string) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${source} must be an array`);
  }

  const selected = new Set(selectedPhotoIds);
  return value.map(photoId => {
    if (typeof photoId !== 'string' || !photoId.trim()) {
      throw new Error(`${source} contains an invalid photo ID`);
    }
    if (!selected.has(photoId)) {
      throw new Error(`${source} references a photo outside the selected set`);
    }
    return photoId;
  });
}

function normalizePeople(value: unknown, selectedPhotoIds: string[]) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('provider people must be an array');
  const people = value
    .filter(isRecord)
    .map(person => {
      const photoIds = normalizePhotoIds(person.photoIds, selectedPhotoIds, 'person photoIds');
      if (
        typeof person.avatarPhotoId === 'string'
        && !selectedPhotoIds.includes(person.avatarPhotoId)
      ) {
        throw new Error('person avatarPhotoId references a photo outside the selected set');
      }
      if (
        typeof person.id !== 'string'
        || !person.id.trim()
        || typeof person.name !== 'string'
        || !person.name.trim()
        || typeof person.avatarPhotoId !== 'string'
      ) {
        return undefined;
      }
      if (!photoIds.length) return undefined;
      return {
        id: person.id,
        name: person.name,
        photoIds,
        avatarPhotoId: person.avatarPhotoId,
      } satisfies GenerationPersonRecord;
    })
    .filter((person): person is GenerationPersonRecord => Boolean(person));
  const personIds = new Set<string>();
  for (const person of people) {
    if (personIds.has(person.id)) throw new Error('provider people contain duplicate person IDs');
    personIds.add(person.id);
  }
  return people.length ? people : undefined;
}

function normalizeRewritePhotoIds(value: unknown, selectedPhotoIds: string[]) {
  const normalized = normalizePhotoIds(value, selectedPhotoIds, 'rewrite photoIds');
  return normalized.length ? normalized : undefined;
}

function normalizeBlocks(value: unknown, input: GenerationInputSnapshot) {
  if (!Array.isArray(value)) throw new Error('provider blocks must be an array');
  const blocks = value
    .map((block, index) => {
      if (!isRecord(block)) {
        throw new Error('provider blocks contain invalid entries');
      }
      if (typeof block.type !== 'string' || typeof block.id !== 'string') {
        throw new Error('provider blocks contain invalid identifiers');
      }
      if (block.type === 'text') {
        if (typeof block.content !== 'string' || !block.content.trim()) {
          throw new Error('text block content is missing');
        }
        return {
          id: block.id,
          type: 'text' as const,
          title: block.title === undefined ? undefined : requireProviderString(block.title, 'text block title'),
          content: block.content,
          photoIds: normalizePhotoIds(block.photoIds, input.selectedPhotoIds, 'text block photoIds'),
        };
      }
      if (block.type === 'quote') {
        if (typeof block.content !== 'string' || !block.content.trim()) {
          throw new Error('quote block content is missing');
        }
        return {
          id: block.id,
          type: 'quote' as const,
          content: block.content,
          photoIds: normalizePhotoIds(block.photoIds, input.selectedPhotoIds, 'quote block photoIds'),
          relatedBlockId: block.relatedBlockId === undefined
            ? undefined
            : requireProviderString(block.relatedBlockId, 'quote block relatedBlockId'),
        };
      }
      if (block.type === 'photo') {
        if (
          typeof block.photoId !== 'string'
          || !block.photoId.trim()
          || typeof block.caption !== 'string'
          || !block.caption.trim()
        ) {
          throw new Error('photo block is missing required fields');
        }
        if (!input.selectedPhotoIds.includes(block.photoId)) {
          throw new Error('photo block references a photo outside the selected set');
        }
        return {
          id: block.id,
          type: 'photo' as const,
          photoId: block.photoId,
          caption: block.caption,
          relatedBlockId: block.relatedBlockId === undefined
            ? undefined
            : requireProviderString(block.relatedBlockId, 'photo block relatedBlockId'),
        };
      }
      throw new Error(`unsupported generation block type: ${block.type}`);
    });

  if (!blocks.length) {
    throw new Error('provider did not return any generation blocks');
  }
  if (!blocks.some(block => block.type === 'text')) {
    throw new Error('provider result must contain at least one text block');
  }

  return blocks.map((block, index) => ({
    ...block,
    id: block.id.trim() || `${input.draftId}-provider-block-${index + 1}`,
  }));
}

function normalizeResult(raw: unknown, input: GenerationInputSnapshot): GenerationResultRecord {
  if (!isRecord(raw)) throw new Error('provider result must be an object');
  const title = requireProviderString(raw.title, 'title');
  const summary = requireProviderString(raw.summary, 'summary');
  const location = requireProviderString(raw.location, 'location');
  const date = requireProviderString(raw.date, 'date');
  const companionName = requireProviderString(raw.companionName, 'companionName');
  const coverPhotoId = requireProviderString(raw.coverPhotoId, 'coverPhotoId');
  if (!input.selectedPhotoIds.includes(coverPhotoId)) {
    throw new Error('coverPhotoId references a photo outside the selected set');
  }
  if (!Array.isArray(raw.posterPhotoIds)) {
    throw new Error('posterPhotoIds must be an array');
  }
  if (raw.people !== undefined && raw.people !== null && !Array.isArray(raw.people)) {
    throw new Error('provider people must be an array');
  }
  const blocks = normalizeBlocks(raw.blocks, input);
  const posterPhotoIds = normalizePhotoIds(raw.posterPhotoIds, input.selectedPhotoIds, 'posterPhotoIds').slice(0, 2);
  return {
    title,
    summary,
    location,
    date,
    companionName,
    coverPhotoId,
    posterPhotoIds,
    blocks,
    people: normalizePeople(raw.people, input.selectedPhotoIds),
  };
}

function normalizeRewriteResult(raw: unknown, input: RewriteInputSnapshot): RewriteResultRecord {
  if (!isRecord(raw) || typeof raw.content !== 'string' || !raw.content.trim()) {
    throw new Error('provider rewrite result is missing content');
  }
  return {
    draftId: input.draftId,
    blockId: input.blockId,
    draftVersion: input.draftVersion,
    blockType: input.blockType,
    content: raw.content.trim(),
    photoIds: normalizeRewritePhotoIds(raw.photoIds, input.selectedPhotoIds) ?? input.photoIds,
  };
}

function buildPhotoFactsPrompt(selectedPhotoIds: string[]) {
  return selectedPhotoIds.map(photoId => {
    const fact = PHOTO_FACTS[photoId];
    return `- ${photoId}: ${fact?.title ?? '旅途片段'} / ${fact?.location ?? '未知地点'} / ${fact?.date ?? '未知日期'}`;
  }).join('\n');
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function extractTextFromChatCompletion(json: unknown) {
  if (!isRecord(json) || !Array.isArray(json.choices) || !json.choices.length) {
    throw new Error('provider response does not contain choices');
  }
  const choice = json.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new Error('provider response does not contain a message');
  }
  const content = choice.message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const firstText = content.find(item => isRecord(item) && item.type === 'text' && typeof item.text === 'string');
    if (isRecord(firstText) && typeof firstText.text === 'string') {
      return firstText.text;
    }
  }
  throw new Error('provider message content is empty');
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseTemperature(value: string | undefined, fallback: number) {
  const normalized = value?.trim() ?? '';
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) return fallback;
  return parsed;
}

function resolveOpenAIResponseFormat() {
  const mode = (process.env.AI_PROVIDER_RESPONSE_FORMAT ?? 'json_object').trim().toLowerCase();
  if (!mode || mode === 'off' || mode === 'none' || mode === 'disabled') {
    return undefined;
  }
  if (mode === 'json_object') {
    return { type: 'json_object' as const };
  }
  throw new DiaryGenerationProviderError('provider_failed', `unsupported AI provider response format: ${mode}`, false);
}

function buildOpenAICompatibleChatBody(input: {
  model: string;
  temperature: number;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}) {
  const body: {
    model: string;
    temperature: number;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    response_format?: { type: 'json_object' };
  } = {
    model: input.model,
    temperature: input.temperature,
    messages: input.messages,
  };
  const responseFormat = resolveOpenAIResponseFormat();
  if (responseFormat) {
    body.response_format = responseFormat;
  }
  return body;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function readErrorCode(error: unknown) {
  if (isRecord(error) && typeof error.code === 'string') {
    return error.code;
  }
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  if (isRecord(cause) && typeof cause.code === 'string') {
    return cause.code;
  }
  return undefined;
}

function isRetryableNetworkError(error: unknown) {
  if (isAbortError(error)) return false;
  const code = readErrorCode(error);
  if (code && RETRYABLE_NETWORK_ERROR_CODES.has(code)) return true;
  return error instanceof TypeError && /fetch failed|network|socket|connect/i.test(error.message);
}

function buildRetryableNetworkFailureMessage(error: unknown) {
  const code = readErrorCode(error);
  if (code) {
    return `AI provider network request failed (${code})`;
  }
  if (error instanceof Error && error.message.trim()) {
    return `AI provider network request failed: ${error.message.trim()}`;
  }
  return 'AI provider network request failed';
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

@Injectable()
export class DiaryGenerationService {
  async generate(
    input: GenerationInputSnapshot,
    options: { signal?: AbortSignal } = {},
  ): Promise<GenerationResultRecord> {
    if (options.signal?.aborted) {
      throw new DiaryGenerationProviderError('cancelled', 'generation was cancelled', false);
    }
    const provider = this.resolveProvider();
    if (provider === 'deterministic') {
      return this.buildDeterministicGenerationResult(input);
    }
    if (provider === 'openai-compatible') {
      return this.generateWithOpenAICompatible(input, options.signal);
    }
    throw new DiaryGenerationProviderError('provider_failed', `unsupported AI provider: ${provider}`, false);
  }

  async rewriteBlock(input: RewriteInputSnapshot): Promise<RewriteResultRecord> {
    const provider = this.resolveProvider();
    if (provider === 'deterministic') {
      return this.buildDeterministicRewriteResult(input);
    }
    if (provider === 'openai-compatible') {
      return this.rewriteWithOpenAICompatible(input);
    }
    throw new DiaryGenerationProviderError('provider_failed', `unsupported AI provider: ${provider}`, false);
  }

  private resolveProvider() {
    const configuredProvider = process.env.AI_PROVIDER?.trim();
    if (
      process.env.NODE_ENV === 'production'
      && (!configuredProvider || configuredProvider === 'deterministic')
    ) {
      throw new DiaryGenerationProviderError(
        'provider_failed',
        'AI provider is not configured for production',
        false,
      );
    }
    return configuredProvider || 'deterministic';
  }

  private async generateWithOpenAICompatible(input: GenerationInputSnapshot, signal?: AbortSignal) {
    const baseUrl = process.env.AI_PROVIDER_BASE_URL?.trim();
    const model = process.env.AI_PROVIDER_MODEL?.trim();
    const apiKey = process.env.AI_PROVIDER_API_KEY?.trim();
    if (!baseUrl || !model || !apiKey) {
      throw new DiaryGenerationProviderError('provider_failed', 'AI provider credentials are incomplete', false);
    }

    const timeoutMs = parsePositiveInt(process.env.AI_PROVIDER_TIMEOUT_MS, 15000);
    const temperature = parseTemperature(process.env.AI_PROVIDER_GENERATION_TEMPERATURE, 0.7);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    if (signal?.aborted) {
      clearTimeout(timeout);
      throw new DiaryGenerationProviderError('cancelled', 'generation was cancelled', false);
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildOpenAICompatibleChatBody({
          model,
          temperature,
          messages: [
            {
              role: 'system',
              content: [
                '你是一个中文旅行日记整理助手。',
                '请只输出 JSON，不要输出解释文字。',
                '必须返回 title、summary、location、date、companionName、coverPhotoId、posterPhotoIds、blocks、people 字段。',
                'blocks 至少包含 1 个 text 块。coverPhotoId、posterPhotoIds、blocks 和 people 中的所有照片引用都必须来自输入的 selectedPhotoIds。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: [
                `draftId: ${input.draftId}`,
                `draftVersion: ${input.draftVersion}`,
                `type: ${input.type}`,
                `characterId: ${input.characterId}`,
                `selectedPhotoIds: ${input.selectedPhotoIds.join(', ')}`,
                '可用照片事实：',
                buildPhotoFactsPrompt(input.selectedPhotoIds),
                '请生成适合移动端日记编辑的结构化结果，语言自然，不要逐字模仿示例。',
              ].join('\n'),
            },
          ],
        })),
        signal: controller.signal,
      });
      if (signal?.aborted) {
        throw new DiaryGenerationProviderError('cancelled', 'generation was cancelled', false);
      }

      if (!response.ok) {
        throw new DiaryGenerationProviderError(
          'provider_failed',
          `AI provider request failed with status ${response.status}`,
          isRetryableStatus(response.status),
        );
      }

      const json = await response.json() as unknown;
      if (signal?.aborted) {
        throw new DiaryGenerationProviderError('cancelled', 'generation was cancelled', false);
      }
      const parsed = parseJsonObject(extractTextFromChatCompletion(json));
      return normalizeResult(parsed, input);
    } catch (error) {
      if (error instanceof DiaryGenerationProviderError) throw error;
      if (signal?.aborted) {
        throw new DiaryGenerationProviderError('cancelled', 'generation was cancelled', false);
      }
      if (isAbortError(error)) {
        throw new DiaryGenerationProviderError('timeout', `AI provider request timed out after ${timeoutMs}ms`, true);
      }
      if (isRetryableNetworkError(error)) {
        throw new DiaryGenerationProviderError('provider_failed', buildRetryableNetworkFailureMessage(error), true);
      }
      if (error instanceof Error) {
        throw new DiaryGenerationProviderError('provider_failed', error.message, false);
      }
      throw new DiaryGenerationProviderError('provider_failed', 'AI provider request failed', false);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private async rewriteWithOpenAICompatible(input: RewriteInputSnapshot) {
    const baseUrl = process.env.AI_PROVIDER_BASE_URL?.trim();
    const model = process.env.AI_PROVIDER_MODEL?.trim();
    const apiKey = process.env.AI_PROVIDER_API_KEY?.trim();
    if (!baseUrl || !model || !apiKey) {
      throw new DiaryGenerationProviderError('provider_failed', 'AI provider credentials are incomplete', false);
    }

    const timeoutMs = parsePositiveInt(process.env.AI_PROVIDER_TIMEOUT_MS, 15000);
    const temperature = parseTemperature(process.env.AI_PROVIDER_REWRITE_TEMPERATURE, 0.7);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const scopedPhotoIds = input.photoIds?.length ? input.photoIds : input.selectedPhotoIds.slice(0, 2);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildOpenAICompatibleChatBody({
          model,
          temperature,
          messages: [
            {
              role: 'system',
              content: [
                '你是一个中文旅行日记改写助手。',
                '请只输出 JSON，不要输出解释文字。',
                '必须返回 content 字段；如需返回 photoIds，必须只使用输入中允许的 photoIds。',
                '只改写当前目标段落，不得扩写其他段落或描述未提供的照片。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: [
                `draftId: ${input.draftId}`,
                `blockId: ${input.blockId}`,
                `draftVersion: ${input.draftVersion}`,
                `characterId: ${input.characterId}`,
                `blockType: ${input.blockType}`,
                `allowedPhotoIds: ${(scopedPhotoIds.length ? scopedPhotoIds : input.selectedPhotoIds).join(', ')}`,
                '可用照片事实：',
                buildPhotoFactsPrompt(scopedPhotoIds.length ? scopedPhotoIds : input.selectedPhotoIds),
                `原文：${input.content}`,
                '请把这一个目标段落改写成更自然、仍可继续编辑的中文文本，保留原意，不要输出标题或多段结构。',
              ].join('\n'),
            },
          ],
        })),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new DiaryGenerationProviderError(
          'provider_failed',
          `AI provider request failed with status ${response.status}`,
          isRetryableStatus(response.status),
        );
      }

      const json = await response.json() as unknown;
      const parsed = parseJsonObject(extractTextFromChatCompletion(json));
      return normalizeRewriteResult(parsed, {
        ...input,
        photoIds: scopedPhotoIds.length ? scopedPhotoIds : undefined,
      });
    } catch (error) {
      if (error instanceof DiaryGenerationProviderError) throw error;
      if (isAbortError(error)) {
        throw new DiaryGenerationProviderError('timeout', `AI provider request timed out after ${timeoutMs}ms`, true);
      }
      if (error instanceof Error) {
        throw new DiaryGenerationProviderError('provider_failed', error.message, false);
      }
      throw new DiaryGenerationProviderError('provider_failed', 'AI provider request failed', false);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildDeterministicGenerationResult(input: GenerationInputSnapshot): GenerationResultRecord {
    const selectedPhotoIds = [...new Set(input.selectedPhotoIds)];
    const coverPhotoId = selectedPhotoIds[0] ?? 'photo-1';
    const posterPhotoIds = selectedPhotoIds.slice(0, 2);
    const primaryFact = PHOTO_FACTS[coverPhotoId] ?? {
      title: '旅途里的片刻',
      location: '旅途中的一个角落',
      date: '2026.10.13',
    };
    const people = this.buildGenerationPeople(selectedPhotoIds);
    const companionName = people.some(person => person.id !== 'person-self') ? '同行人' : '自己';
    const location = [...new Set(selectedPhotoIds.map(id => PHOTO_FACTS[id]?.location).filter((value): value is string => Boolean(value)))]
      .slice(0, 2)
      .join(' / ') || primaryFact.location;
    const date = PHOTO_FACTS[coverPhotoId]?.date ?? primaryFact.date;
    const chunks = [selectedPhotoIds.slice(0, 4), selectedPhotoIds.slice(4, 8), selectedPhotoIds.slice(8)];
    const opening = input.characterId === 'character-green'
      ? `把 ${location} 的风景慢慢写下来，${companionName === '同行人' ? '和同行人' : '和自己'}一起走过的画面，终于被认真地留住了。`
      : input.characterId === 'character-brown'
        ? `${location} 的光线很轻，照片里的节奏也很慢。把这一天拆成几段，再重新拼成一页完整的回忆。`
        : `从 ${primaryFact.title} 开始，这次旅程的情绪慢慢展开。照片里的风、街道和停留过的地方，都值得写进今天的日记里。`;
    const blocks: GenerationBlockRecord[] = [
      {
        id: `${input.draftId}-remote-p1`,
        type: 'text',
        title: '把旅程重新展开',
        content: opening,
        photoIds: chunks[0],
      },
      {
        id: `${input.draftId}-remote-p2`,
        type: 'text',
        title: '照片里的细节',
        content: `从 ${chunks[1][0] ? (PHOTO_FACTS[chunks[1][0]]?.title ?? '第二段风景') : '一路上的片段'} 到 ${chunks[1][1] ? (PHOTO_FACTS[chunks[1][1]]?.title ?? '另一个瞬间') : '同行的脚步'}，每张照片都在补完这一天的层次。`,
        photoIds: chunks[1],
      },
      {
        id: `${input.draftId}-remote-p3`,
        type: 'text',
        title: '留给以后再看的心情',
        content: '等回头再翻开这一页时，还是能重新想起当时的温度、路线和停下来的理由。',
        photoIds: chunks[2],
      },
      {
        id: `${input.draftId}-remote-quote`,
        type: 'quote',
        content: '回忆不是把照片排好，而是把当时的心情重新接回来。',
        relatedBlockId: `${input.draftId}-remote-p3`,
      },
    ];
    chunks.forEach((photos, index) => {
      if (photos[0]) {
        blocks.push({
          id: `${input.draftId}-remote-photo-${index + 1}`,
          type: 'photo',
          photoId: photos[0],
          caption: PHOTO_FACTS[photos[0]]?.title ?? '这一刻值得被留住',
          relatedBlockId: `${input.draftId}-remote-p${index + 1}`,
        });
      }
    });

    return {
      title: `${primaryFact.title}，把旅程写成一页`,
      summary: opening.slice(0, 72),
      location,
      date,
      companionName,
      coverPhotoId,
      posterPhotoIds,
      blocks,
      people: people.length ? people : undefined,
    };
  }

  private buildDeterministicRewriteResult(input: RewriteInputSnapshot): RewriteResultRecord {
    const scopedPhotoIds = input.photoIds?.length ? input.photoIds : input.selectedPhotoIds.slice(0, 2);
    const scopedFacts = scopedPhotoIds
      .map(photoId => PHOTO_FACTS[photoId])
      .filter((fact): fact is { title: string; location: string; date: string } => Boolean(fact));
    const photoLead = scopedFacts[0];
    const highlight = scopedFacts.map(fact => fact.title).slice(0, 2).join('、');
    const source = truncateText(input.content, input.blockType === 'quote' ? 26 : 40);
    const toneLead = input.characterId === 'character-green'
      ? '把这一段慢慢放轻一点，像写给未来的自己。'
      : input.characterId === 'character-brown'
        ? '让这段话更简洁，也更有停顿感。'
        : '把这段经历写得更柔和，也更贴近当时的光线和空气。';
    const rewritten = input.blockType === 'quote'
      ? `“${highlight || source || '把这一刻留下来'}，${toneLead.replace(/[。！]$/, '')}，回头再看时，还是会记得${photoLead?.location ?? '当时的心情'}。”`
      : [
          toneLead,
          source ? `原来写下的“${source}”被重新理顺成更完整的一段。` : '把原来的零散描述重新整理成了一段更完整的话。',
          highlight ? `照片里的 ${highlight} 也让这段回忆更有具体的落点。` : undefined,
          `最后留下来的，是${photoLead?.location ?? '这一路'}里那个值得再回头看的瞬间。`,
        ].filter(Boolean).join('');

    return {
      draftId: input.draftId,
      blockId: input.blockId,
      draftVersion: input.draftVersion,
      blockType: input.blockType,
      content: rewritten,
      photoIds: scopedPhotoIds.length ? scopedPhotoIds : undefined,
    };
  }

  private buildGenerationPeople(selectedPhotoIds: string[]): GenerationPersonRecord[] {
    const people: GenerationPersonRecord[] = [];
    if (selectedPhotoIds.includes('photo-11')) {
      people.push({
        id: 'person-self',
        name: '我',
        photoIds: ['photo-11'],
        avatarPhotoId: 'photo-11',
      });
    }
    if (selectedPhotoIds.includes('photo-12')) {
      people.push({
        id: 'person-friend',
        name: '同行人',
        photoIds: ['photo-12'],
        avatarPhotoId: 'photo-12',
      });
    }
    return people;
  }
}
