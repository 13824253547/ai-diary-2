import { Injectable } from '@nestjs/common';
import {
  buildFullDiaryPhotoLabel,
  buildFullDiarySystemPrompt,
  buildFullDiaryUserPrompt,
  buildRewriteSystemPrompt,
  buildRewriteUserPrompt,
} from './diary-prompt-templates';
import {
  classifyDiaryGenerationInput,
  classifyDiaryGenerationOutput,
  getDiaryGenerationPolicyMessage,
} from './diary-generation-policy';
export type GenerationProgressReporter = (
  milestoneId: 'provider-submitted' | 'provider-response-received' | 'result-validated',
) => void | Promise<void>;

export type GenerationInputSnapshot = {
  draftId: string;
  draftVersion: number;
  type: string;
  characterId: string;
  selectedPhotoIds: string[];
  privacy: string;
  sourceDiaryId?: string;
};

export type GenerationPhotoInput = {
  photoId: string;
  mimeType: string;
  base64: string;
  date?: string;
};

export type RewriteContextBlock = {
  id: string;
  type: 'text' | 'quote';
  content: string;
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
  contextBlocks?: RewriteContextBlock[];
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

function resolveGenerationDate() {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('.');
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

function normalizeBlocks(value: unknown, input: GenerationInputSnapshot) {
  if (!Array.isArray(value)) throw new Error('provider blocks must be an array');
  const blocks = value
    .map((block, index) => {
      if (!isRecord(block)) {
        throw new Error('provider blocks contain invalid entries');
      }
      // Full generation accepts text blocks only; photo binding below validates this fallback.
      const blockType = block.type === undefined ? 'text' : block.type;
      if (typeof blockType !== 'string') throw new Error('provider block type is invalid');
      const id = typeof block.id === 'string' ? block.id : '';
      if (blockType === 'text') {
        if (typeof block.content !== 'string' || !block.content.trim()) {
          throw new Error('text block content is missing');
        }
        return {
          id,
          type: 'text' as const,
          title: block.title === undefined ? undefined : requireProviderString(block.title, 'text block title'),
          content: block.content,
          photoIds: normalizePhotoIds(block.photoIds, input.selectedPhotoIds, 'text block photoIds'),
        };
      }
      if (blockType === 'quote') {
        throw new Error('provider result must not contain standalone quote blocks');
      }
      if (blockType === 'photo') {
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
          id,
          type: 'photo' as const,
          photoId: block.photoId,
          caption: block.caption,
          relatedBlockId: block.relatedBlockId === undefined
            ? undefined
            : requireProviderString(block.relatedBlockId, 'photo block relatedBlockId'),
        };
      }
      throw new Error(`unsupported generation block type: ${blockType}`);
    });

  if (!blocks.length) {
    throw new Error('provider did not return any generation blocks');
  }
  const textBlocks = blocks.filter(block => block.type === 'text');
  if (textBlocks.length !== input.selectedPhotoIds.length) {
    throw new Error('provider result must contain exactly one text block per selected photo');
  }
  textBlocks.forEach((block, index) => {
    if (block.type !== 'text' || block.photoIds.length !== 1 || block.photoIds[0] !== input.selectedPhotoIds[index]) {
      throw new Error('provider text blocks must reference photos in selected order, exactly one per block');
    }
  });
  if (blocks.some(block => block.type === 'text' && !block.photoIds.length)) {
    throw new Error('provider text blocks must reference one selected photo');
  }

  return blocks.map((block, index) => ({
    ...block,
    id: block.id.trim() || `${input.draftId}-provider-block-${index + 1}`,
  }));
}

function normalizeResult(
  raw: unknown,
  input: GenerationInputSnapshot,
  photos: GenerationPhotoInput[],
): GenerationResultRecord {
  if (!isRecord(raw)) throw new Error('provider result must be an object');
  const title = requireProviderString(raw.title, 'title');
  const summary = requireProviderString(raw.summary, 'summary');
  const location = requireProviderString(raw.location, 'location');
  const date = resolveGenerationDate();
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
  const people = normalizePeople(raw.people, input.selectedPhotoIds);
  const companionName = typeof raw.companionName === 'string' && raw.companionName.trim()
    ? raw.companionName.trim()
    : people?.some(person => person.id !== 'person-self')
      ? '同行人'
      : '自己';
  const result = {
    title,
    summary,
    location,
    date,
    companionName,
    coverPhotoId,
    posterPhotoIds,
    blocks,
    people,
  };
  const generatedText = [
    title,
    summary,
    location,
    companionName,
    ...blocks.flatMap(block => {
      if (block.type === 'text') return [block.title, block.content];
      if (block.type === 'photo') return [block.caption];
      return [];
    }),
    ...(people ?? []).map(person => person.name),
  ].filter((value): value is string => Boolean(value)).join('\n');
  const policyCode = classifyDiaryGenerationOutput(generatedText);
  if (policyCode) {
    throw new DiaryGenerationProviderError(
      'provider_failed',
      getDiaryGenerationPolicyMessage(policyCode, 'output'),
      false,
    );
  }
  return result;
}

function normalizeRewriteResult(raw: unknown, input: RewriteInputSnapshot): RewriteResultRecord {
  if (!isRecord(raw) || typeof raw.content !== 'string' || !raw.content.trim()) {
    throw new Error('provider rewrite result is missing content');
  }
  const content = raw.content.trim();
  const policyCode = classifyDiaryGenerationOutput(content);
  if (policyCode) {
    throw new DiaryGenerationProviderError(
      'provider_failed',
      getDiaryGenerationPolicyMessage(policyCode, 'output'),
      false,
    );
  }
  return {
    draftId: input.draftId,
    blockId: input.blockId,
    draftVersion: input.draftVersion,
    blockType: input.blockType,
    content,
    photoIds: input.photoIds,
  };
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
  messages: Array<{
    role: 'system' | 'user';
    content: string | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
    >;
  }>;
}) {
  const body: {
    model: string;
    temperature: number;
    messages: typeof input.messages;
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

function buildImageDataUrl(photo: GenerationPhotoInput) {
  const mimeType = photo.mimeType.trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
    throw new DiaryGenerationProviderError('provider_failed', `unsupported image MIME type: ${mimeType}`, false);
  }
  if (!photo.base64.trim()) {
    throw new DiaryGenerationProviderError('provider_failed', `photo content is unavailable: ${photo.photoId}`, false);
  }
  return `data:${mimeType};base64,${photo.base64}`;
}

function assertGenerationPhotos(input: GenerationInputSnapshot, photos: GenerationPhotoInput[]) {
  if (
    photos.length !== input.selectedPhotoIds.length
    || photos.some((photo, index) => photo.photoId !== input.selectedPhotoIds[index])
  ) {
    throw new DiaryGenerationProviderError(
      'provider_failed',
      'generation photo assets do not match the selected photo order',
      false,
    );
  }
}

function resolveConfiguredProvider() {
  const explicitDiaryProvider = process.env.DIARY_GENERATION_PROVIDER?.trim();
  if (explicitDiaryProvider) return explicitDiaryProvider;

  if (
    process.env.PET_CHAT_PROVIDER?.trim() === 'ark-openai-compatible'
    && process.env.PET_CHAT_BASE_URL?.trim()
    && process.env.PET_CHAT_MODEL?.trim()
    && process.env.PET_CHAT_API_KEY?.trim()
  ) {
    return 'ark-openai-compatible';
  }
  return process.env.AI_PROVIDER?.trim() || 'deterministic';
}

function resolveProviderConfiguration(provider: string) {
  const ark = provider === 'ark-openai-compatible';
  return {
    baseUrl: (ark ? process.env.PET_CHAT_BASE_URL : process.env.AI_PROVIDER_BASE_URL)?.trim(),
    model: (ark ? process.env.PET_CHAT_MODEL : process.env.AI_PROVIDER_MODEL)?.trim(),
    apiKey: (ark ? process.env.PET_CHAT_API_KEY : process.env.AI_PROVIDER_API_KEY)?.trim(),
  };
}

function providerTemperature(provider: string, task: 'generation' | 'rewrite') {
  if (provider === 'ark-openai-compatible') {
    return parseTemperature(
      task === 'generation'
        ? process.env.DIARY_GENERATION_TEMPERATURE
        : process.env.DIARY_REWRITE_TEMPERATURE,
      parseTemperature(process.env.PET_CHAT_TEMPERATURE, 0.7),
    );
  }
  return parseTemperature(
    task === 'generation'
      ? process.env.AI_PROVIDER_GENERATION_TEMPERATURE
      : process.env.AI_PROVIDER_REWRITE_TEMPERATURE,
    0.7,
  );
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
    options: {
      signal?: AbortSignal;
      photos?: GenerationPhotoInput[];
      onProgress?: GenerationProgressReporter;
    } = {},
  ): Promise<GenerationResultRecord> {
    if (options.signal?.aborted) {
      throw new DiaryGenerationProviderError('cancelled', 'generation was cancelled', false);
    }
    const provider = this.resolveProvider();
    if (provider === 'deterministic') {
      await options.onProgress?.('provider-submitted');
      const result = this.buildDeterministicGenerationResult(input);
      await options.onProgress?.('provider-response-received');
      await options.onProgress?.('result-validated');
      return result;
    }
    if (provider === 'openai-compatible' || provider === 'ark-openai-compatible') {
      assertGenerationPhotos(input, options.photos ?? []);
      return this.generateWithOpenAICompatible(
        input,
        provider,
        options.photos ?? [],
        options.signal,
        options.onProgress,
      );
    }
    throw new DiaryGenerationProviderError('provider_failed', `unsupported AI provider: ${provider}`, false);
  }

  async rewriteBlock(
    input: RewriteInputSnapshot,
    options: { photos?: GenerationPhotoInput[] } = {},
  ): Promise<RewriteResultRecord> {
    const inputPolicyCode = classifyDiaryGenerationInput([
      input.content,
      ...(input.contextBlocks ?? []).map(block => block.content),
    ].join('\n'));
    if (inputPolicyCode) {
      throw new DiaryGenerationProviderError(
        'provider_failed',
        getDiaryGenerationPolicyMessage(inputPolicyCode, 'input'),
        false,
      );
    }
    const provider = this.resolveProvider();
    if (provider === 'deterministic') {
      return this.buildDeterministicRewriteResult(input);
    }
    if (provider === 'openai-compatible' || provider === 'ark-openai-compatible') {
      const targetPhotoIds = input.photoIds ?? [];
      const photos = options.photos ?? [];
      if (
        photos.length !== targetPhotoIds.length
        || photos.some((photo, index) => photo.photoId !== targetPhotoIds[index])
      ) {
        throw new DiaryGenerationProviderError(
          'provider_failed',
          'rewrite photo assets do not match the target block references',
          false,
        );
      }
      return this.rewriteWithOpenAICompatible(input, provider, photos);
    }
    throw new DiaryGenerationProviderError('provider_failed', `unsupported AI provider: ${provider}`, false);
  }

  private resolveProvider() {
    const configuredProvider = resolveConfiguredProvider();
    if (
      process.env.NODE_ENV === 'production'
      && configuredProvider === 'deterministic'
    ) {
      throw new DiaryGenerationProviderError(
        'provider_failed',
        'AI provider is not configured for production',
        false,
      );
    }
    return configuredProvider || 'deterministic';
  }

  private async generateWithOpenAICompatible(
    input: GenerationInputSnapshot,
    provider: string,
    photos: GenerationPhotoInput[],
    signal?: AbortSignal,
    onProgress?: GenerationProgressReporter,
  ) {
    const { baseUrl, model, apiKey } = resolveProviderConfiguration(provider);
    if (!baseUrl || !model || !apiKey) {
      throw new DiaryGenerationProviderError('provider_failed', 'AI provider credentials are incomplete', false);
    }

    const timeoutMs = Math.min(parsePositiveInt(
      provider === 'ark-openai-compatible' ? process.env.PET_CHAT_TIMEOUT_MS : process.env.AI_PROVIDER_TIMEOUT_MS,
      240000,
    ), 240000);
    const temperature = providerTemperature(provider, 'generation');
    const requestBody = JSON.stringify(buildOpenAICompatibleChatBody({
      model,
      temperature,
      messages: [
        {
          role: 'system',
          content: buildFullDiarySystemPrompt(input.characterId),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: buildFullDiaryUserPrompt({
                draftId: input.draftId,
                draftVersion: input.draftVersion,
                type: input.type,
                selectedPhotoIds: input.selectedPhotoIds,
              }),
            },
            ...photos.flatMap((photo, index) => [
              {
                type: 'text' as const,
                text: buildFullDiaryPhotoLabel(photo, index, photos.length),
              },
              {
                type: 'image_url' as const,
                image_url: { url: buildImageDataUrl(photo), detail: 'high' as const },
              },
            ]),
          ],
        },
      ],
    }));
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal?.aborted) {
      throw new DiaryGenerationProviderError('cancelled', 'generation was cancelled', false);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const responsePromise = fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
        signal: controller.signal,
      });
      try {
        await onProgress?.('provider-submitted');
      } catch (error) {
        controller.abort();
        await responsePromise.catch(() => undefined);
        throw error;
      }
      const response = await responsePromise;
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
      await onProgress?.('provider-response-received');
      const parsed = parseJsonObject(extractTextFromChatCompletion(json));
      const result = normalizeResult(parsed, input, photos);
      await onProgress?.('result-validated');
      return result;
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

  private async rewriteWithOpenAICompatible(
    input: RewriteInputSnapshot,
    provider: string,
    photos: GenerationPhotoInput[],
  ) {
    const { baseUrl, model, apiKey } = resolveProviderConfiguration(provider);
    if (!baseUrl || !model || !apiKey) {
      throw new DiaryGenerationProviderError('provider_failed', 'AI provider credentials are incomplete', false);
    }

    const timeoutMs = Math.min(parsePositiveInt(
      provider === 'ark-openai-compatible' ? process.env.PET_CHAT_TIMEOUT_MS : process.env.AI_PROVIDER_TIMEOUT_MS,
      240000,
    ), 240000);
    const temperature = providerTemperature(provider, 'rewrite');
    const scopedPhotoIds = input.photoIds ?? [];
    const requestBody = JSON.stringify(buildOpenAICompatibleChatBody({
      model,
      temperature,
      messages: [
        {
          role: 'system',
          content: buildRewriteSystemPrompt(input.characterId, input.blockType),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: buildRewriteUserPrompt({
                ...input,
                photoIds: scopedPhotoIds,
                contextBlocks: input.contextBlocks ?? [],
                photoFacts: photos.map(photo => ({
                  photoId: photo.photoId,
                  date: photo.date,
                })),
              }),
            },
            ...photos.flatMap(photo => [
              {
                type: 'text' as const,
                text: `目标段落照片 photoId=${photo.photoId}`,
              },
              {
                type: 'image_url' as const,
                image_url: { url: buildImageDataUrl(photo), detail: 'high' as const },
              },
            ]),
          ],
        },
      ],
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
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
      return normalizeRewriteResult(parsed, input);
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
    const opening = input.characterId === 'character-green'
      ? `把 ${location} 的风景慢慢写下来，${companionName === '同行人' ? '和同行人' : '和自己'}一起走过的画面，终于被认真地留住了。`
      : input.characterId === 'character-brown'
        ? `${location} 的光线很轻，照片里的节奏也很慢。把这一天拆成几段，再重新拼成一页完整的回忆。`
        : `从 ${primaryFact.title} 开始，这次旅程的情绪慢慢展开。照片里的风、街道和停留过的地方，都值得写进今天的日记里。`;
    const textBlocks: GenerationBlockRecord[] = selectedPhotoIds.map((photoId, index) => {
      const fact = PHOTO_FACTS[photoId] ?? { title: '旅途片段', location: '路上', date };
      const content = index === 0
        ? `${opening} ${fact.title}为这趟旅程打开了一个具体的入口。`
        : index === selectedPhotoIds.length - 1
          ? `沿着前面留下的线索，来到${fact.location}。${fact.title}把这一天的记忆轻轻收住。`
          : `顺着刚才的行程继续往前，${fact.title}让${fact.location}的风景多了一层新的细节。`;
      return {
        id: `${input.draftId}-remote-p${index + 1}`,
        type: 'text',
        title: fact.title,
        content,
        photoIds: [photoId],
      };
    });
    const photoBlocks: GenerationBlockRecord[] = selectedPhotoIds.map((photoId, index) => ({
      id: `${input.draftId}-remote-photo-${index + 1}`,
      type: 'photo',
      photoId,
      caption: PHOTO_FACTS[photoId]?.title ?? '这一刻值得被留住',
      relatedBlockId: `${input.draftId}-remote-p${index + 1}`,
    }));
    const blocks = textBlocks.flatMap((textBlock, index) => [textBlock, photoBlocks[index]]);

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
    const scopedPhotoIds = input.photoIds ?? [];
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
      photoIds: input.photoIds,
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
