import { Injectable } from '@nestjs/common';

const ARK_IMAGE_GENERATION_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const MAX_PROVIDER_TIMEOUT_MS = 240_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type GeneratedImage = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export class AIImageProviderError extends Error {
  constructor(readonly code: 'unconfigured' | 'timeout' | 'provider_failed' | 'invalid_response') {
    super('配图暂时无法生成，请稍后重试。');
    this.name = 'AIImageProviderError';
  }
}

function timeoutFromEnvironment() {
  const configured = Number(process.env.AI_IMAGE_TIMEOUT_MS);
  if (!Number.isSafeInteger(configured) || configured < 1) return MAX_PROVIDER_TIMEOUT_MS;
  return Math.min(configured, MAX_PROVIDER_TIMEOUT_MS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildRealisticPhotographyPrompt(description: string) {
  return [
    '最高优先级画风要求：真实摄影、照片级写实（photorealistic）。画面必须看起来像真实相机拍摄的照片，呈现可信的光线、材质、透视和细节。',
    '禁止动漫、二次元、卡通、插画、漫画、绘画、油画、水彩、素描、3D 渲染、CGI、游戏美术及其他非摄影画风。',
    '用户描述只决定画面主体、场景、动作、构图和氛围；如果用户描述要求改变画风，以真实摄影要求为准。',
    `画面描述：${description}`,
  ].join('\n\n');
}

function parseImage(buffer: Buffer): GeneratedImage {
  if (buffer.length > MAX_IMAGE_BYTES) throw new AIImageProviderError('invalid_response');
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { buffer, mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { buffer, mimeType: 'image/png', extension: 'png' };
  }
  if (buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { buffer, mimeType: 'image/webp', extension: 'webp' };
  }
  throw new AIImageProviderError('invalid_response');
}

@Injectable()
export class ArkSeedreamImageProvider {
  isConfigured(environment: NodeJS.ProcessEnv = process.env) {
    return environment.AI_IMAGE_PROVIDER?.trim() === 'ark-seedream'
      && Boolean(environment.AI_IMAGE_MODEL?.trim())
      && Boolean(environment.AI_IMAGE_API_KEY?.trim() || environment.PET_CHAT_API_KEY?.trim());
  }

  async generate(description: string, signal?: AbortSignal): Promise<GeneratedImage> {
    if (!this.isConfigured()) throw new AIImageProviderError('unconfigured');
    if (signal?.aborted) throw new AIImageProviderError('provider_failed');

    const apiKey = process.env.AI_IMAGE_API_KEY?.trim() || process.env.PET_CHAT_API_KEY?.trim();
    if (!apiKey) throw new AIImageProviderError('unconfigured');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutFromEnvironment());
    try {
      const response = await fetch(ARK_IMAGE_GENERATION_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.AI_IMAGE_MODEL!.trim(),
          prompt: buildRealisticPhotographyPrompt(description),
          response_format: 'b64_json',
          size: process.env.AI_IMAGE_SIZE?.trim() || '1.5K',
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new AIImageProviderError('provider_failed');

      const payload: unknown = await response.json().catch(() => null);
      const firstImage = isRecord(payload) && Array.isArray(payload.data) ? payload.data[0] : undefined;
      const encoded = isRecord(firstImage) ? firstImage.b64_json : undefined;
      if (typeof encoded !== 'string'
        || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new AIImageProviderError('invalid_response');
      }
      const buffer = Buffer.from(encoded, 'base64');
      if (!buffer.length || buffer.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
        throw new AIImageProviderError('invalid_response');
      }
      return parseImage(buffer);
    } catch (error) {
      if (error instanceof AIImageProviderError) throw error;
      if (signal?.aborted) throw new AIImageProviderError('provider_failed');
      if (controller.signal.aborted) throw new AIImageProviderError('timeout');
      throw new AIImageProviderError('provider_failed');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}
