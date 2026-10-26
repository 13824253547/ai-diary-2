import { Image } from 'expo-image';
import { appConfig } from '../config/app-config';
import {
  AI_IMAGE_GENERATION_CONTRACT_VERSION,
  type AIImageGenerationRequestContract,
} from '../contracts/ai-image-generation-contract';
import type { DiaryPhoto } from '../types/diary';
import {
  AIImageGenerationError,
  hasReadableImageSource,
  type AIImageGenerationProvider,
} from './ai-image-generation-provider';
import { ApiClient, ApiRequestError, PROVIDER_REQUEST_CLIENT_TIMEOUT_MS } from './api-client';
import { getDeviceIdentityHeaders } from './device-identity';

type GeneratedAssetContract = {
  id: string;
  sourceAssetId: string;
  title: string;
  date: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  generationRequestId: string;
  generationPrompt: string;
};

type GenerationEnvelope =
  | {
      ok: true;
      data: {
        version: string;
        requestId: string;
        source: string;
        photo: GeneratedAssetContract;
      };
    }
  | { ok: false; error?: { message?: string } };

const client = new ApiClient({
  baseUrl: appConfig.backendBaseUrl,
  getHeaders: getDeviceIdentityHeaders,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnvelope(value: unknown): GenerationEnvelope | undefined {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return undefined;
  return value as GenerationEnvelope;
}

function isGeneratedAsset(value: unknown): value is GeneratedAssetContract {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.sourceAssetId === 'string'
    && typeof value.title === 'string'
    && typeof value.date === 'string'
    && typeof value.filename === 'string'
    && typeof value.mimeType === 'string'
    && typeof value.size === 'number'
    && typeof value.generationRequestId === 'string'
    && typeof value.generationPrompt === 'string'
    && (value.width === undefined || typeof value.width === 'number')
    && (value.height === undefined || typeof value.height === 'number');
}

export function createHttpAIImageGenerationProvider(): AIImageGenerationProvider {
  return {
    async generate(request) {
      if (process.env.JEST_WORKER_ID) {
        throw new AIImageGenerationError('provider_failed', '测试环境不请求配图服务。');
      }
      const payload: AIImageGenerationRequestContract = {
        version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
        requestId: request.requestId,
        attempt: request.attempt,
        description: request.description,
        generatedAt: request.generatedAt,
      };
      try {
        const response = await client.request<unknown>('/photos/materials/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }, {
          signal: request.signal,
          timeoutMs: PROVIDER_REQUEST_CLIENT_TIMEOUT_MS,
        });
        const envelope = readEnvelope(response.data);
        if (!response.ok || !envelope || envelope.ok !== true
          || envelope.data.version !== AI_IMAGE_GENERATION_CONTRACT_VERSION
          || envelope.data.requestId !== request.requestId
          || envelope.data.source !== 'provider'
          || !isGeneratedAsset(envelope.data.photo)
          || envelope.data.photo.generationRequestId !== request.requestId
          || envelope.data.photo.generationPrompt !== request.description) {
          const message = envelope?.ok === false ? envelope.error?.message : undefined;
          throw new AIImageGenerationError('provider_failed', message || '配图暂时无法生成，请稍后重试。');
        }

        const headers = await getDeviceIdentityHeaders();
        const photo: DiaryPhoto = {
          id: envelope.data.photo.id,
          sourceAssetId: envelope.data.photo.sourceAssetId,
          title: envelope.data.photo.title,
          location: '',
          emoji: '🖼',
          color: '#EFE3D5',
          date: envelope.data.photo.date || '未知日期',
          filename: envelope.data.photo.filename,
          width: envelope.data.photo.width,
          height: envelope.data.photo.height,
          uri: client.buildUrl(`/photos/materials/${encodeURIComponent(envelope.data.photo.id)}/content`),
          remoteHeaders: headers,
          source: 'generated',
          generationRequestId: envelope.data.photo.generationRequestId,
          generationPrompt: envelope.data.photo.generationPrompt,
          generationSource: 'provider',
        };
        return {
          version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
          requestId: request.requestId,
          source: 'provider',
          photo,
        };
      } catch (error) {
        if (error instanceof AIImageGenerationError) throw error;
        if (request.signal?.aborted || (error instanceof ApiRequestError && error.code === 'cancelled')) {
          throw new AIImageGenerationError('cancelled', '本次配图生成已取消。');
        }
        throw new AIImageGenerationError('provider_failed', '配图暂时无法生成，请稍后重试。');
      }
    },
    async isAssetReadable(photo) {
      if (!hasReadableImageSource(photo) || !photo.uri) return false;
      try {
        return await Image.prefetch(photo.uri, {
          headers: photo.remoteHeaders,
          cachePolicy: 'memory',
        });
      } catch {
        return false;
      }
    },
  };
}
