import { DiaryGenerationProviderError, DiaryGenerationService } from './diary-generation.service';

describe('DiaryGenerationService', () => {
  const service = new DiaryGenerationService();
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  test('builds a deterministic generation result by default', async () => {
    delete process.env.AI_PROVIDER;

    const result = await service.generate({
      draftId: 'draft-provider-1',
      draftVersion: 1,
      type: 'travel',
      characterId: 'character-green',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
    });

    expect(result.coverPhotoId).toBe('photo-1');
    expect(result.blocks.some(block => block.type === 'text')).toBe(true);
    expect(result.summary).toContain('台南');
  });

  test('does not fabricate people when the selected photos contain no recognized candidates', async () => {
    delete process.env.AI_PROVIDER;

    const result = await service.generate({
      draftId: 'draft-provider-people-empty',
      draftVersion: 3,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
    });

    expect(result.people).toBeUndefined();
    expect(result.companionName).toBe('自己');
  });

  test('builds a deterministic rewrite result from the target block and scoped photos', async () => {
    delete process.env.AI_PROVIDER;

    const result = await service.rewriteBlock({
      draftId: 'draft-rewrite-1',
      blockId: 'block-1',
      draftVersion: 4,
      characterId: 'character-brown',
      blockType: 'text',
      content: '傍晚的时候我们在海边慢慢散步，风吹得很轻。',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      photoIds: ['photo-8', 'photo-9'],
    });

    expect(result.blockId).toBe('block-1');
    expect(result.draftVersion).toBe(4);
    expect(result.photoIds).toEqual(['photo-8', 'photo-9']);
    expect(result.content).toContain('渔光岛');
    expect(result.content).toContain('这段话');
  });

  test('parses openai-compatible generation responses from fenced JSON content arrays', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'text',
                  text: [
                    '```json',
                    '{',
                    '  "title": "海风把旅程写成一页",',
                    '  "summary": "把沿海散步的片段整理成可继续编辑的结果。",',
                    '  "location": "台南",',
                    '  "date": "2026.10.13",',
                    '  "companionName": "自己",',
                    '  "coverPhotoId": "photo-8",',
                    '  "posterPhotoIds": ["photo-8", "photo-9"],',
                    '  "blocks": [',
                    '    {',
                    '      "id": "provider-block-1",',
                    '      "type": "text",',
                    '      "content": "海风从傍晚一路吹到夜灯亮起。",',
                    '      "photoIds": ["photo-8", "photo-9"]',
                    '    }',
                    '  ]',
                    '}',
                    '```',
                  ].join('\n'),
                },
              ],
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await service.generate({
      draftId: 'draft-provider-array-content',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      privacy: 'private',
    });

    expect(result.title).toBe('海风把旅程写成一页');
    expect(result.coverPhotoId).toBe('photo-8');
    expect(result.posterPhotoIds).toEqual(['photo-8', 'photo-9']);
    expect(result.blocks).toEqual([
      {
        id: 'provider-block-1',
        type: 'text',
        content: '海风从傍晚一路吹到夜灯亮起。',
        photoIds: ['photo-8', 'photo-9'],
        title: undefined,
      },
    ]);
  });

  test('parses openai-compatible rewrite responses as JSON content', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"content":"把海风和晚灯重新写成一句更顺的回忆。","photoIds":["photo-8"]}',
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await service.rewriteBlock({
      draftId: 'draft-rewrite-openai',
      blockId: 'block-2',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'quote',
      content: '风吹过来的时候，晚灯刚刚亮起。',
      selectedPhotoIds: ['photo-8', 'photo-9'],
      photoIds: ['photo-8'],
    });

    expect(result.content).toBe('把海风和晚灯重新写成一句更顺的回忆。');
    expect(result.photoIds).toEqual(['photo-8']);
  });

  test('rejects malformed openai-compatible generation responses that reference photos outside the selected set', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: '不合法的结果',
                summary: '引用了未选中的照片。',
                location: '台南',
                date: '2026.10.13',
                companionName: '自己',
                coverPhotoId: 'photo-8',
                posterPhotoIds: ['photo-8'],
                blocks: [
                  {
                    id: 'provider-block-invalid-photo',
                    type: 'photo',
                    photoId: 'photo-999',
                    caption: '不应该通过的照片引用',
                  },
                ],
              }),
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-invalid-photo',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'photo block references a photo outside the selected set',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test('fails fast when openai-compatible provider credentials are incomplete', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = '';
    process.env.AI_PROVIDER_API_KEY = '';

    await expect(service.generate({
      draftId: 'draft-provider-2',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'AI provider credentials are incomplete',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test('marks 503 provider responses as retryable provider failures', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-503',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: true,
      message: 'AI provider request failed with status 503',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test('marks 400 provider responses as non-retryable provider failures', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
    }) as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-400',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'AI provider request failed with status 400',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test('marks aborted provider requests as retryable timeouts', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_TIMEOUT_MS = '1';
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-timeout',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'timeout',
      retryable: true,
      message: 'AI provider request timed out after 1ms',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test('marks 503 rewrite responses as retryable provider failures', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    await expect(service.rewriteBlock({
      draftId: 'draft-rewrite-503',
      blockId: 'block-503',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '海风把傍晚吹得很安静。',
      selectedPhotoIds: ['photo-8', 'photo-9'],
      photoIds: ['photo-8'],
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: true,
      message: 'AI provider request failed with status 503',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test('marks aborted rewrite requests as retryable timeouts', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_TIMEOUT_MS = '1';
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch;

    await expect(service.rewriteBlock({
      draftId: 'draft-rewrite-timeout',
      blockId: 'block-timeout',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '海风把傍晚吹得很安静。',
      selectedPhotoIds: ['photo-8', 'photo-9'],
      photoIds: ['photo-8'],
    })).rejects.toMatchObject({
      code: 'timeout',
      retryable: true,
      message: 'AI provider request timed out after 1ms',
    } satisfies Partial<DiaryGenerationProviderError>);
  });
});
