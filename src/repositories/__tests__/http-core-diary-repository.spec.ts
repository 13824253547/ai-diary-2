import { HttpCoreDiaryRepository } from '../http-core-diary-repository';
import { ApiClient } from '../../services/api-client';

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
      version: 2,
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.data.diaryId).toBe('diary-1');

    const recovered = await repository.getSaveResult('draft-1-save-2');
    expect(recovered.ok).toBe(true);
    if (recovered.ok) expect(recovered.data.savedVersion).toBe(2);
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
});
