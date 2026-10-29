import { HttpCoreDiaryRepository } from '../http-core-diary-repository';
import { ApiClient } from '../../services/api-client';

class MultipartXMLHttpRequestFixture {
  static lastRequest: MultipartXMLHttpRequestFixture | undefined;
  static responseBody = '';

  status = 201;
  responseText = MultipartXMLHttpRequestFixture.responseBody;
  responseType = '';
  timeout = 0;
  headers: Record<string, string> = {};
  body: XMLHttpRequestBodyInit | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    MultipartXMLHttpRequestFixture.lastRequest = this;
  }

  open() {}

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: XMLHttpRequestBodyInit | null) {
    this.body = body;
    this.onload?.();
  }

  abort() {
    this.onabort?.();
  }
}

describe('HttpCoreDiaryRepository', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          id: 'draft-1',
          type: 'travel',
          characterId: 'character-blue',
          selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
          privacy: 'private',
          version: 1,
        },
      }),
    }) as unknown as typeof fetch;
  });

  test('uploads selected photos as ordered multipart parts without a JSON content-type header', async () => {
    const originalFormData = global.FormData;
    const originalXhr = globalThis.XMLHttpRequest;
    class FormDataFixture {
      _parts: Array<[string, unknown]> = [];
      append(name: string, value: unknown) {
        this._parts.push([name, value]);
      }
    }
    global.FormData = FormDataFixture as unknown as typeof FormData;
    MultipartXMLHttpRequestFixture.responseBody = JSON.stringify({
      ok: true,
      data: {
        jobId: 'job-upload-1',
        draftId: 'draft-1',
        draftVersion: 2,
        idempotencyKey: 'draft-1-round-2',
        status: 'queued',
        stage: 'queued',
        progressPercent: 0,
      },
    });
    MultipartXMLHttpRequestFixture.lastRequest = undefined;
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      value: MultipartXMLHttpRequestFixture,
    });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      getHeaders: () => ({ 'x-device-id': 'device-test-1' }),
    }));
    const legacyPhotoUploads = [
      {
        photoId: 'photo-3',
        uri: 'file:///photo-3.jpg',
        mimeType: 'image/jpeg',
        title: 'IMG_003.jpg',
        location: '家庭相册',
        date: '2026.10.20',
      },
      {
        photoId: 'photo-1',
        uri: 'file:///photo-1.jpg',
        mimeType: 'image/jpeg',
        title: 'IMG_001.jpg',
        location: '旅行相册',
        date: '2026.10.19',
      },
    ];

    try {
      const result = await repository.createGenerationJob({
        draftId: 'draft-1',
        draftVersion: 2,
        idempotencyKey: 'draft-1-round-2',
      }, undefined, legacyPhotoUploads);

      expect(result.ok).toBe(true);
      const xhr = MultipartXMLHttpRequestFixture.lastRequest!;
      expect(xhr.headers).toMatchObject({ 'x-device-id': 'device-test-1' });
      expect(xhr.headers).not.toHaveProperty('Content-Type');
      const parts = (xhr.body as unknown as FormDataFixture)._parts;
      expect(parts.filter(([name]) => name === 'photos').map(([, file]) => file)).toEqual([
        expect.objectContaining({ uri: 'file:///photo-3.jpg', type: 'image/jpeg', name: 'photo-001.jpg' }),
        expect.objectContaining({ uri: 'file:///photo-1.jpg', type: 'image/jpeg', name: 'photo-002.jpg' }),
      ]);
      expect(parts.find(([name]) => name === 'photoMetadata')?.[1]).toBe(JSON.stringify([
        { photoId: 'photo-3', date: '2026.10.20' },
        { photoId: 'photo-1', date: '2026.10.19' },
      ]));
    } finally {
      global.FormData = originalFormData;
      Object.defineProperty(globalThis, 'XMLHttpRequest', {
        configurable: true,
        value: originalXhr,
      });
    }
  });

  test('uploads readable diary photos with the save snapshot using the native multipart transport', async () => {
    const originalFormData = global.FormData;
    const originalXhr = globalThis.XMLHttpRequest;
    class FormDataFixture {
      _parts: Array<[string, unknown]> = [];
      append(name: string, value: unknown) {
        this._parts.push([name, value]);
      }
    }
    global.FormData = FormDataFixture as unknown as typeof FormData;
    MultipartXMLHttpRequestFixture.responseBody = JSON.stringify({
      ok: true,
      data: {
        diaryId: 'diary-1',
        draftId: 'draft-1',
        savedVersion: 1,
        id: 'diary-1',
        date: '2026.10.23',
      },
    });
    MultipartXMLHttpRequestFixture.lastRequest = undefined;
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      value: MultipartXMLHttpRequestFixture,
    });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      getHeaders: () => ({ 'x-device-id': 'device-test-1' }),
    }));

    try {
      const result = await repository.saveDiary({
        id: 'diary-1',
        draftId: 'draft-1',
        idempotencyKey: 'draft-1-save-new',
        title: '测试标题',
        summary: '测试摘要',
        location: '',
        date: '2026.10.23',
        privacy: 'private',
        photoIds: ['device-photo-1'],
        version: 1,
        contentSnapshot: {
          type: 'travel',
          subtitle: '',
          helperMessage: '',
          characterId: 'character-blue',
          companionName: '自己',
          coverPhotoId: 'device-photo-1',
          blocks: [{ id: 'block-1', type: 'text', content: '测试正文。', photoIds: ['device-photo-1'] }],
          posterPhotoIds: ['device-photo-1'],
          people: [],
        },
      }, undefined, [{
        photoId: 'device-photo-1',
        uri: 'file:///device-photo-1.jpg',
        mimeType: 'image/jpeg',
        date: '2026.10.20',
      }]);

      expect(result.ok).toBe(true);
      const xhr = MultipartXMLHttpRequestFixture.lastRequest!;
      expect(xhr.headers).toMatchObject({ 'x-device-id': 'device-test-1' });
      expect(xhr.headers).not.toHaveProperty('Content-Type');
      const parts = (xhr.body as unknown as FormDataFixture)._parts;
      expect(parts.some(([name, value]) => name === 'sourceDiaryId' || value === 'undefined')).toBe(false);
      expect(JSON.parse(String(parts.find(([name]) => name === 'photoIds')?.[1])))
        .toEqual(['device-photo-1']);
      expect(parts.find(([name]) => name === 'photoMetadata')?.[1]).toBe(JSON.stringify([
        { photoId: 'device-photo-1', date: '2026.10.20' },
      ]));
      expect(parts.filter(([name]) => name === 'photos').map(([, file]) => file)).toEqual([
        expect.objectContaining({ uri: 'file:///device-photo-1.jpg', type: 'image/jpeg' }),
      ]);
    } finally {
      global.FormData = originalFormData;
      Object.defineProperty(globalThis, 'XMLHttpRequest', {
        configurable: true,
        value: originalXhr,
      });
    }
  });

  test('wraps backend draft response into contract result', async () => {
    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.createDraft({
      id: 'draft-1',
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
      version: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('draft-1');
  });

  test('maps invalid draft creation response into remote error result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        ok: false,
        error: {
          code: 'invalid_input',
          message: 'diary type is not available for creation',
          retryable: false,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.createDraft({
      id: 'draft-work-1',
      type: 'work',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
      version: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.message).toBe('diary type is not available for creation');
    }
  });

  test('rejects malformed draft payload from backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          id: 'draft-1',
          type: 'unknown',
          characterId: 'character-blue',
          selectedPhotoIds: ['photo-1'],
          privacy: 'private',
          version: 1,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.createDraft({
      id: 'draft-1',
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
      version: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('provider_failed');
  });

  test('adds async device identity headers to requests', async () => {
    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
        getHeaders: async () => ({
          'x-device-id': 'device-test-1',
        }),
      }),
    );

    await repository.createDraft({
      id: 'draft-1',
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
      version: 1,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/drafts',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-device-id': 'device-test-1',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  test('loads generation job snapshot from backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          jobId: 'job-1',
          draftId: 'draft-1',
          draftVersion: 1,
          idempotencyKey: 'draft-1-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: {
            title: '远端结构化结果',
            summary: '后端已返回可编辑内容。',
            location: '台南',
            date: '2026.10.13',
            companionName: '同行人',
            coverPhotoId: 'photo-1',
            posterPhotoIds: ['photo-1', 'photo-2'],
            blocks: [
              { id: 'block-1', type: 'text', content: '这是远端正文。', photoIds: ['photo-1'] },
              { id: 'block-2', type: 'photo', photoId: 'photo-1', caption: '远端照片', relatedBlockId: 'block-1' },
            ],
          },
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.getGenerationJob('job-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stage).toBe('completed');
      expect(result.data.result?.title).toBe('远端结构化结果');
    }
  });

  test('binds generation create, poll, and cancel responses to their requests', async () => {
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));
    const job = {
      jobId: 'job-other',
      draftId: 'draft-1',
      draftVersion: 1,
      idempotencyKey: 'draft-1-round-1',
      status: 'running',
      stage: 'drafting',
    };

    const invalidId = await repository.getGenerationJob('');
    expect(invalidId).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(global.fetch).not.toHaveBeenCalled();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { ...job, idempotencyKey: 'another-request' } }),
    });
    const create = await repository.createGenerationJob({
      draftId: 'draft-1',
      draftVersion: 1,
      idempotencyKey: 'draft-1-round-1',
    });
    expect(create).toMatchObject({ ok: false, error: { code: 'provider_failed', retryable: false } });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: job }),
    });
    const poll = await repository.getGenerationJob('job-requested');
    expect(poll).toMatchObject({ ok: false, error: { code: 'provider_failed', retryable: false } });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { ...job, status: 'cancelled', stage: 'cancelled' } }),
    });
    const cancel = await repository.cancelGenerationJob('job-requested');
    expect(cancel).toMatchObject({ ok: false, error: { code: 'provider_failed', retryable: false } });
  });

  test('rejects an invalid generation draftVersion before sending a request', async () => {
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    const result = await repository.createGenerationJob({
      draftId: 'draft-1',
      draftVersion: 1.5,
      idempotencyKey: 'draft-1-round-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('accepts generation job payloads that only report stage without progress percent', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          jobId: 'job-stage-only',
          draftId: 'draft-1',
          draftVersion: 1,
          idempotencyKey: 'draft-1-round-1',
          status: 'running',
          stage: 'structuring',
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.getGenerationJob('job-stage-only');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.stage).toBe('structuring');
      expect(result.data.progressPercent).toBeUndefined();
    }
  });

  test('maps generation job create not found response into remote error result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        ok: false,
        error: {
          code: 'not_found',
          message: 'draft not found',
          retryable: false,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.createGenerationJob({
      draftId: 'draft-missing',
      draftVersion: 1,
      idempotencyKey: 'draft-missing-round-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.message).toBe('draft not found');
    }
  });

  test('maps generation job create permission denied response into remote error result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        error: {
          code: 'permission_denied',
          message: 'draft access denied',
          retryable: false,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.createGenerationJob({
      draftId: 'draft-forbidden',
      draftVersion: 1,
      idempotencyKey: 'draft-forbidden-round-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('permission_denied');
      expect(result.error.message).toBe('draft access denied');
      expect(result.error.retryable).toBe(false);
    }
  });

  test('cancels generation job through backend endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          jobId: 'job-1',
          draftId: 'draft-1',
          draftVersion: 1,
          idempotencyKey: 'draft-1-round-1',
          status: 'cancelled',
          stage: 'cancelled',
          progressPercent: 48,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.cancelGenerationJob?.('job-1');
    expect(result?.ok).toBe(true);
    if (result?.ok) expect(result.data.status).toBe('cancelled');
  });

  test('rejects malformed generation job payload from backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          jobId: 'job-1',
          status: 'running',
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.getGenerationJob('job-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('provider_failed');
  });

  test('maps generation job not found response into remote error result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        ok: false,
        error: {
          code: 'not_found',
          message: 'generation job not found',
          retryable: false,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.getGenerationJob('job-missing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.retryable).toBe(false);
    }
  });

  test('maps generation job permission denied response into remote error result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        error: {
          code: 'permission_denied',
          message: 'generation job access denied',
          retryable: false,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.getGenerationJob('job-forbidden');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('permission_denied');
      expect(result.error.message).toBe('generation job access denied');
      expect(result.error.retryable).toBe(false);
    }
  });

  test('posts rewrite requests to backend and returns scoped rewrite content', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          draftId: 'draft-1',
          blockId: 'block-1',
          draftVersion: 2,
          blockType: 'text',
          content: '这是后端返回的新段落。',
          photoIds: ['photo-1', 'photo-2'],
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.rewriteBlock({
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '原始段落',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      photoIds: ['photo-1', 'photo-2'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toBe('这是后端返回的新段落。');
      expect(result.data.photoIds).toEqual(['photo-1', 'photo-2']);
    }
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/generation/rewrite',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  test('uploads only the target block photo with read-only context in multipart rewrite requests', async () => {
    const originalFormData = global.FormData;
    const originalXhr = globalThis.XMLHttpRequest;
    class FormDataFixture {
      _parts: Array<[string, unknown]> = [];
      append(name: string, value: unknown) {
        this._parts.push([name, value]);
      }
    }
    global.FormData = FormDataFixture as unknown as typeof FormData;
    MultipartXMLHttpRequestFixture.responseBody = JSON.stringify({
      ok: true,
      data: {
        draftId: 'draft-1',
        blockId: 'block-2',
        draftVersion: 3,
        blockType: 'text',
        content: '只替换当前段落。',
        photoIds: ['photo-2'],
      },
    });
    MultipartXMLHttpRequestFixture.lastRequest = undefined;
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      value: MultipartXMLHttpRequestFixture,
    });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      getHeaders: () => ({ 'x-device-id': 'device-test-1' }),
    }));
    const contextBlocks = [{ id: 'block-1', type: 'text' as const, content: '只读的前段。' }];

    try {
      const result = await repository.rewriteBlock({
        draftId: 'draft-1',
        blockId: 'block-2',
        draftVersion: 3,
        characterId: 'character-green',
        blockType: 'text',
        content: '原段落',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        photoIds: ['photo-2'],
        contextBlocks,
      }, undefined, [{
        photoId: 'photo-2',
        uri: 'file:///photo-2.jpg',
        mimeType: 'image/jpeg',
        date: '2026.10.20',
      }]);

      expect(result.ok).toBe(true);
      const xhr = MultipartXMLHttpRequestFixture.lastRequest!;
      expect(xhr.headers).toMatchObject({ 'x-device-id': 'device-test-1' });
      expect(xhr.headers).not.toHaveProperty('Content-Type');
      const parts = (xhr.body as unknown as FormDataFixture)._parts;
      const fields = Object.fromEntries(parts.filter(([name]) => name !== 'photos'));
      expect(fields.contextBlocks).toBe(JSON.stringify(contextBlocks));
      expect(JSON.parse(String(fields.photoIds))).toEqual(['photo-2']);
      expect(parts.filter(([name]) => name === 'photos')).toEqual([
        ['photos', expect.objectContaining({ uri: 'file:///photo-2.jpg', type: 'image/jpeg' })],
      ]);
    } finally {
      global.FormData = originalFormData;
      Object.defineProperty(globalThis, 'XMLHttpRequest', {
        configurable: true,
        value: originalXhr,
      });
    }
  });

  test('rejects malformed rewrite payload from backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          draftId: 'draft-1',
          blockId: 'block-1',
          draftVersion: 2,
          blockType: 'text',
          content: '',
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.rewriteBlock({
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '原始段落',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      photoIds: ['photo-1'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('provider_failed');
      expect(result.error.message).toBe('rewrite result response is invalid');
    }
  });

  test('rejects rewrite results bound to a different request target', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          draftId: 'draft-1',
          blockId: 'another-block',
          draftVersion: 2,
          blockType: 'text',
          content: '不应被写入的结果。',
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.rewriteBlock({
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '原始段落',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      photoIds: ['photo-1'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('provider_failed');
      expect(result.error.retryable).toBe(false);
      expect(result.error.message).toBe('rewrite result response does not match the request');
    }
  });

  test('rejects succeeded generation payload without structured result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          jobId: 'job-1',
          draftId: 'draft-1',
          draftVersion: 1,
          idempotencyKey: 'draft-1-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.getGenerationJob('job-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('provider_failed');
  });

  test('rejects generation job payload with invalid stage and progress combination', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          jobId: 'job-1',
          draftId: 'draft-1',
          draftVersion: 1,
          idempotencyKey: 'draft-1-round-1',
          status: 'running',
          stage: 'completed',
          progressPercent: 140,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.getGenerationJob('job-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('provider_failed');
  });

  test('maps save result and save result lookup from backend', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            diaryId: 'diary-1',
            draftId: 'draft-1',
            savedVersion: 2,
            id: 'diary-1',
            date: '2026.10.23',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            diaryId: 'diary-1',
            draftId: 'draft-1',
            savedVersion: 2,
            id: 'diary-1',
            date: '2026.10.23',
          },
        }),
      });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const saved = await repository.saveDiary({
      id: 'diary-1',
      draftId: 'draft-1',
      sourceDiaryId: 'diary-1',
      sourceDiaryVersion: 1,
      idempotencyKey: 'draft-1-save-2',
      title: '测试标题',
      summary: '测试摘要',
      location: '厦门',
      date: '2026.02.03',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot: {
        type: 'travel',
        subtitle: '测试副标题',
        helperMessage: '',
        characterId: 'character-blue',
        companionName: '自己',
        coverPhotoId: 'photo-1',
        blocks: [{ id: 'block-1', type: 'text', content: '测试正文。', photoIds: ['photo-1'] }],
        posterPhotoIds: ['photo-1', 'photo-2'],
        people: [],
      },
      version: 2,
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.data.diaryId).toBe('diary-1');
      expect(saved.data.date).toBe('2026.10.23');
    }

    const recovered = await repository.getSaveResult('draft-1-save-2');
    expect(recovered.ok).toBe(true);
    if (recovered.ok) {
      expect(recovered.data.savedVersion).toBe(2);
      expect(recovered.data.date).toBe('2026.10.23');
    }
  });

  test('maps save conflict into remote error result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        error: {
          code: 'version_conflict',
          message: 'source diary version conflict',
          retryable: false,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.saveDiary({
      id: 'diary-1',
      draftId: 'draft-1',
      sourceDiaryId: 'diary-1',
      sourceDiaryVersion: 1,
      idempotencyKey: 'draft-1-save-2',
      title: '测试标题',
      summary: '测试摘要',
      location: '厦门',
      date: '2026.02.03',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot: {
        type: 'travel',
        subtitle: '测试副标题',
        helperMessage: '',
        characterId: 'character-blue',
        companionName: '自己',
        coverPhotoId: 'photo-1',
        blocks: [{ id: 'block-1', type: 'text', content: '测试正文。', photoIds: ['photo-1'] }],
        posterPhotoIds: ['photo-1', 'photo-2'],
        people: [],
      },
      version: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('version_conflict');
  });

  test('maps diary visibility save result from backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          diaryId: 'diary-1',
          privacy: 'public-comments',
          publicBlockIds: ['block-1'],
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.updateDiaryVisibility?.({
      diaryId: 'diary-1',
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.data).toEqual({
        diaryId: 'diary-1',
        privacy: 'public-comments',
        publicBlockIds: ['block-1'],
      });
    }
  });

  test('maps diary visibility validation failure into remote error result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        ok: false,
        error: {
          code: 'invalid_input',
          message: 'public block ids are required for non-private visibility',
          retryable: false,
        },
      }),
    });

    const repository = new HttpCoreDiaryRepository(
      new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }),
    );

    const result = await repository.updateDiaryVisibility?.({
      diaryId: 'diary-1',
      privacy: 'anonymous',
      publicBlockIds: [],
    });

    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.message).toBe('public block ids are required for non-private visibility');
    }
  });

  test('serializes the persisted diary content snapshot with a save request', async () => {
    const contentSnapshot = {
      type: 'travel' as const,
      subtitle: '台南慢行',
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      coverPhotoId: 'photo-1',
      posterPhotoIds: ['photo-1', 'photo-2'],
      blocks: [
        { id: 'block-1', type: 'text' as const, title: '街巷', content: '沿着老街慢慢走。', photoIds: ['photo-1'] },
        { id: 'photo-block-1', type: 'photo' as const, photoId: 'photo-1', caption: '巷口', relatedBlockId: 'block-1' },
      ],
      people: [],
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: { id: 'diary-1', diaryId: 'diary-1', draftId: 'draft-1', savedVersion: 1 },
      }),
    });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    await repository.saveDiary({
      id: 'diary-1',
      draftId: 'draft-1',
      idempotencyKey: 'draft-1-save-1',
      title: '台南日记',
      summary: '沿着老街慢慢走。',
      location: '台南',
      date: '2026.10.15',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot,
      version: 1,
    });

    const [, requestOptions] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(requestOptions.body)).toEqual(expect.objectContaining({ contentSnapshot }));
  });

  test('maps a persisted diary content snapshot into the full diary result', async () => {
    const contentSnapshot = {
      type: 'travel' as const,
      subtitle: '台南慢行',
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      coverPhotoId: 'photo-1',
      posterPhotoIds: ['photo-1', 'photo-2'],
      blocks: [
        { id: 'block-1', type: 'text' as const, title: '街巷', content: '沿着老街慢慢走。', photoIds: ['photo-1'] },
      ],
      people: [],
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          id: 'diary-1',
          draftId: 'draft-1',
          title: '台南日记',
          summary: '沿着老街慢慢走。',
          location: '台南',
          date: '2026.10.15',
          privacy: 'private',
          photoIds: ['photo-1', 'photo-2', 'photo-3'],
          version: 1,
          contentSnapshot,
        },
      }),
    });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    const result = await repository.getDiary('diary-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.blocks).toEqual(contentSnapshot.blocks);
      expect(result.data.coverPhotoId).toBe('photo-1');
      expect(result.data.subtitle).toBe('台南慢行');
    }
  });

  test('rejects malformed lookup IDs and a valid diary response for another ID', async () => {
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    const malformed = await repository.getDiary(null as never);
    expect(malformed).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(global.fetch).not.toHaveBeenCalled();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          id: 'diary-other',
          draftId: 'draft-other',
          title: '另一篇日记',
          summary: '另一段摘要。',
          location: '厦门',
          date: '2026.10.15',
          privacy: 'private',
          photoIds: ['photo-1', 'photo-2', 'photo-3'],
          version: 1,
          contentSnapshot: {
            type: 'travel',
            subtitle: '',
            helperMessage: '',
            characterId: 'character-blue',
            companionName: '自己',
            coverPhotoId: 'photo-1',
            blocks: [{ id: 'block-other', type: 'text', content: '另一篇正文。' }],
            people: [],
          },
        },
      }),
    });

    const mismatched = await repository.getDiary('diary-requested');
    expect(mismatched).toMatchObject({
      ok: false,
      error: { code: 'provider_failed', retryable: false },
    });
  });

  test('deletes one diary through the device-scoped DELETE endpoint and validates the response ID', async () => {
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      getHeaders: () => ({ 'x-device-id': 'device-test-1' }),
    }));
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { diaryId: 'diary-1' } }),
    });

    await expect(repository.deleteDiary('diary-1')).resolves.toMatchObject({
      ok: true,
      data: { diaryId: 'diary-1' },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/diaries/diary-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'x-device-id': 'device-test-1' }),
      }),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { diaryId: 'diary-other' } }),
    });
    await expect(repository.deleteDiary('diary-1')).resolves.toMatchObject({
      ok: false,
      error: { code: 'provider_failed', retryable: false },
    });
  });

  test('rejects empty diary bodies and photo references outside the saved diary', async () => {
    const validSnapshot = {
      type: 'travel',
      subtitle: '',
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      coverPhotoId: 'photo-1',
      blocks: [{ id: 'block-1', type: 'text', content: '正文。', photoIds: ['photo-1'] }],
      posterPhotoIds: ['photo-1'],
      people: [],
    };
    const invalidSnapshots = [
      { ...validSnapshot, blocks: [] },
      { ...validSnapshot, coverPhotoId: 'photo-outside-diary' },
      {
        ...validSnapshot,
        blocks: [{ id: 'block-1', type: 'text', content: '越界引用。', photoIds: ['photo-outside-diary'] }],
      },
    ];

    for (const contentSnapshot of invalidSnapshots) {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            id: 'diary-1',
            title: '台南日记',
            summary: '正文。',
            location: '台南',
            date: '2026.10.15',
            privacy: 'private',
            photoIds: ['photo-1', 'photo-2', 'photo-3'],
            version: 1,
            contentSnapshot,
          },
        }),
      });
      const repository = new HttpCoreDiaryRepository(new ApiClient({
        baseUrl: 'http://127.0.0.1:3001/api',
      }));

      const result = await repository.getDiary('diary-1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('provider_failed');
    }
  });

  test('rejects a diary response that omits its content snapshot', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          id: 'diary-1',
          title: '台南日记',
          summary: '沿着老街慢慢走。',
          location: '台南',
          date: '2026.10.15',
          privacy: 'private',
          photoIds: ['photo-1', 'photo-2', 'photo-3'],
          version: 1,
        },
      }),
    });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    const result = await repository.getDiary('diary-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('provider_failed');
  });

  test('loads every memories page when the UI requests the complete collection', async () => {
    const firstItems = Array.from({ length: 10 }, (_, index) => ({ id: `diary-${index + 1}` }));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { items: firstItems, page: 1, pageSize: 10, total: 11 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { items: [{ id: 'diary-11' }], page: 2, pageSize: 10, total: 11 },
        }),
      });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    const result = await repository.listAllMemories({ page: 1, pageSize: 10 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(11);
      expect(result.data.items[10].id).toBe('diary-11');
      expect(result.data.total).toBe(11);
    }
  });

  test('rejects inconsistent memories pages instead of returning a truncated collection', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { items: Array.from({ length: 10 }, (_, index) => ({ id: `diary-${index + 1}` })), page: 1, pageSize: 10, total: 11 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { items: [{ id: 'diary-11' }], page: 2, pageSize: 10, total: 12 },
        }),
      });
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    const result = await repository.listAllMemories({ page: 1, pageSize: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('provider_failed');
  });

  test('rejects invalid memories dates before making an HTTP request', async () => {
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    const invalidMonth = await repository.listAllMemories({
      month: '2026-13',
      page: 1,
      pageSize: 20,
    });
    const invalidDay = await repository.listMemories({
      day: '2026-02-30',
      page: 1,
      pageSize: 20,
    });

    expect(invalidMonth).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    });
    expect(invalidDay).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
