import { DiaryGenerationProviderError, DiaryGenerationService } from './diary-generation.service';

function buildValidProviderResult(overrides: Record<string, unknown> = {}) {
  return {
    title: '海风把旅程写成一页',
    summary: '把沿海散步的片段整理成可继续编辑的结果。',
    location: '台南',
    date: '2026.10.13',
    companionName: '自己',
    coverPhotoId: 'photo-8',
    posterPhotoIds: ['photo-8'],
    blocks: [
      {
        id: 'provider-block-valid',
        type: 'text',
        content: '海风从傍晚一路吹到夜灯亮起。',
        photoIds: ['photo-8'],
      },
    ],
    ...overrides,
  };
}

function mockOpenAiGenerationResult(result: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(result) } }],
    }),
  }) as unknown as typeof fetch;
}

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

  test('fails closed in production when no real provider is configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AI_PROVIDER;

    await expect(service.generate({
      draftId: 'draft-production-provider-missing',
      draftVersion: 1,
      type: 'travel',
      characterId: 'character-green',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'AI provider is not configured for production',
    });

    await expect(service.rewriteBlock({
      draftId: 'draft-production-rewrite-provider-missing',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-green',
      blockType: 'text',
      content: '原段落',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'AI provider is not configured for production',
    });
  });

  test('rejects the deterministic provider in production instead of returning mock success', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_PROVIDER = 'deterministic';

    await expect(service.generate({
      draftId: 'draft-production-deterministic',
      draftVersion: 1,
      type: 'travel',
      characterId: 'character-green',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'AI provider is not configured for production',
    });
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

  test.each([
    [
      'text block photoIds',
      buildValidProviderResult({
        blocks: [{ id: 'text-block', type: 'text', content: '正文', photoIds: ['photo-999'] }],
      }),
      'text block photoIds references a photo outside the selected set',
    ],
    [
      'quote block photoIds',
      buildValidProviderResult({
        blocks: [{ id: 'quote-block', type: 'quote', content: '引言', photoIds: ['photo-999'] }],
      }),
      'quote block photoIds references a photo outside the selected set',
    ],
    [
      'posterPhotoIds',
      buildValidProviderResult({ posterPhotoIds: ['photo-999'] }),
      'posterPhotoIds references a photo outside the selected set',
    ],
    [
      'coverPhotoId',
      buildValidProviderResult({ coverPhotoId: 'photo-999' }),
      'coverPhotoId references a photo outside the selected set',
    ],
    [
      'person photoIds',
      buildValidProviderResult({
        people: [{ id: 'person-1', name: '同行者', photoIds: ['photo-999'], avatarPhotoId: 'photo-8' }],
      }),
      'person photoIds references a photo outside the selected set',
    ],
    [
      'person avatarPhotoId',
      buildValidProviderResult({
        people: [{ id: 'person-1', name: '同行者', photoIds: ['photo-8'], avatarPhotoId: 'photo-999' }],
      }),
      'person avatarPhotoId references a photo outside the selected set',
    ],
    [
      'malformed person photoIds',
      buildValidProviderResult({
        people: [{ name: '同行者', photoIds: ['photo-999'], avatarPhotoId: 'photo-8' }],
      }),
      'person photoIds references a photo outside the selected set',
    ],
    [
      'malformed person avatarPhotoId',
      buildValidProviderResult({
        people: [{ id: 'person-1', photoIds: ['photo-8'], avatarPhotoId: 'photo-999' }],
      }),
      'person avatarPhotoId references a photo outside the selected set',
    ],
  ] as Array<[string, Record<string, unknown>, string]>)(
    'rejects out-of-set references in %s',
    async (_field, payload, message) => {
      process.env.AI_PROVIDER = 'openai-compatible';
      process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
      process.env.AI_PROVIDER_MODEL = 'gpt-test';
      process.env.AI_PROVIDER_API_KEY = 'test-key';
      mockOpenAiGenerationResult(payload);

      await expect(service.generate({
        draftId: 'draft-provider-invalid-photo-reference',
        draftVersion: 2,
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
      })).rejects.toMatchObject({
        code: 'provider_failed',
        retryable: false,
        message,
      } satisfies Partial<DiaryGenerationProviderError>);
    },
  );

  test('rejects rewrite photo references outside the selected set', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ content: '改写后的内容', photoIds: ['photo-999'] }),
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    await expect(service.rewriteBlock({
      draftId: 'draft-rewrite-invalid-photo-reference',
      blockId: 'block-1',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '原始段落',
      selectedPhotoIds: ['photo-8', 'photo-9'],
      photoIds: ['photo-8'],
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'rewrite photoIds references a photo outside the selected set',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test.each([null, 'not-a-block'])(
    'rejects non-object generation block entries (%p)',
    async entry => {
      process.env.AI_PROVIDER = 'openai-compatible';
      process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
      process.env.AI_PROVIDER_MODEL = 'gpt-test';
      process.env.AI_PROVIDER_API_KEY = 'test-key';
      mockOpenAiGenerationResult(buildValidProviderResult({
        blocks: [
          entry,
          { id: 'valid-text', type: 'text', content: '合法正文', photoIds: ['photo-8'] },
        ],
      }));

      await expect(service.generate({
        draftId: 'draft-provider-invalid-block-entry',
        draftVersion: 2,
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
      })).rejects.toMatchObject({
        code: 'provider_failed',
        retryable: false,
        message: 'provider blocks contain invalid entries',
      } satisfies Partial<DiaryGenerationProviderError>);
    },
  );

  test.each([
    [
      'empty text content',
      { id: 'empty-text', type: 'text', content: '   ', photoIds: ['photo-8'] },
      'text block content is missing',
    ],
    [
      'empty quote content',
      { id: 'empty-quote', type: 'quote', content: '', photoIds: ['photo-8'] },
      'quote block content is missing',
    ],
    [
      'empty photo caption',
      { id: 'empty-photo', type: 'photo', photoId: 'photo-8', caption: '  ' },
      'photo block is missing required fields',
    ],
    [
      'empty text title',
      { id: 'empty-title', type: 'text', content: '正文', title: '' },
      'provider result is missing text block title',
    ],
    [
      'empty quote relation',
      { id: 'empty-relation', type: 'quote', content: '引言', relatedBlockId: '' },
      'provider result is missing quote block relatedBlockId',
    ],
    [
      'empty photo reference',
      { id: 'empty-photo-reference', type: 'text', content: '正文', photoIds: ['  '] },
      'text block photoIds contains an invalid photo ID',
    ],
  ] as Array<[string, Record<string, unknown>, string]>)(
    'rejects generation blocks with %s',
    async (_field, block, message) => {
      process.env.AI_PROVIDER = 'openai-compatible';
      process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
      process.env.AI_PROVIDER_MODEL = 'gpt-test';
      process.env.AI_PROVIDER_API_KEY = 'test-key';
      mockOpenAiGenerationResult(buildValidProviderResult({ blocks: [block] }));

      await expect(service.generate({
        draftId: 'draft-provider-empty-block-field',
        draftVersion: 2,
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
      })).rejects.toMatchObject({
        code: 'provider_failed',
        retryable: false,
        message,
      } satisfies Partial<DiaryGenerationProviderError>);
    },
  );

  test.each([
    ['id', { id: '   ', name: '同行者', photoIds: ['photo-8'], avatarPhotoId: 'photo-8' }],
    ['name', { id: 'person-1', name: '  ', photoIds: ['photo-8'], avatarPhotoId: 'photo-8' }],
  ] as Array<[string, Record<string, unknown>]>)(
    'omits provider people candidates with an empty %s',
    async (_field, person) => {
      process.env.AI_PROVIDER = 'openai-compatible';
      process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
      process.env.AI_PROVIDER_MODEL = 'gpt-test';
      process.env.AI_PROVIDER_API_KEY = 'test-key';
      mockOpenAiGenerationResult(buildValidProviderResult({ people: [person] }));

      const result = await service.generate({
        draftId: 'draft-provider-empty-person-field',
        draftVersion: 2,
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
      });

      expect(result.people).toBeUndefined();
    },
  );

  test('rejects openai-compatible results with duplicate person IDs as non-retryable provider failures', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult({
      people: [
        { id: 'person-duplicate', name: '同行者甲', photoIds: ['photo-8'], avatarPhotoId: 'photo-8' },
        { id: 'person-duplicate', name: '同行者乙', photoIds: ['photo-9'], avatarPhotoId: 'photo-9' },
      ],
    }));

    await expect(service.generate({
      draftId: 'draft-provider-duplicate-person-ids',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'provider people contain duplicate person IDs',
    } satisfies Partial<DiaryGenerationProviderError>);
  });

  test.each([
    ['title', { title: '' }, 'provider result is missing title'],
    ['summary', { summary: undefined }, 'provider result is missing summary'],
    ['location', { location: null }, 'provider result is missing location'],
    ['date', { date: 4 }, 'provider result is missing date'],
    ['companionName', { companionName: '   ' }, 'provider result is missing companionName'],
    ['coverPhotoId', { coverPhotoId: undefined }, 'provider result is missing coverPhotoId'],
    ['posterPhotoIds', { posterPhotoIds: null }, 'posterPhotoIds must be an array'],
    ['people', { people: { id: 'person-1' } }, 'provider people must be an array'],
  ] as Array<[string, Record<string, unknown>, string]>)(
    'rejects provider results with invalid required field %s',
    async (_field, overrides, message) => {
      process.env.AI_PROVIDER = 'openai-compatible';
      process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
      process.env.AI_PROVIDER_MODEL = 'gpt-test';
      process.env.AI_PROVIDER_API_KEY = 'test-key';
      mockOpenAiGenerationResult(buildValidProviderResult(overrides));

      await expect(service.generate({
        draftId: 'draft-provider-missing-required-field',
        draftVersion: 2,
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
      })).rejects.toMatchObject({
        code: 'provider_failed',
        retryable: false,
        message,
      } satisfies Partial<DiaryGenerationProviderError>);
    },
  );

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
    global.fetch = jest.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      })) as unknown as typeof fetch;

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

  test('propagates generation cancellation to the provider without classifying it as a timeout', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_TIMEOUT_MS = '10000';
    let markProviderStarted!: () => void;
    let providerSignal: AbortSignal | undefined;
    const providerStarted = new Promise<void>(resolve => {
      markProviderStarted = resolve;
    });
    global.fetch = jest.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        providerSignal = init?.signal;
        providerSignal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
        markProviderStarted();
      })) as unknown as typeof fetch;
    const controller = new AbortController();
    const pending = service.generate({
      draftId: 'draft-provider-cancelled',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    }, { signal: controller.signal });

    await providerStarted;
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'cancelled',
      retryable: false,
    } satisfies Partial<DiaryGenerationProviderError>);
    expect(providerSignal?.aborted).toBe(true);
  });

  test('uses the default response format and falls back for an invalid generation temperature', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_GENERATION_TEMPERATURE = '0.2invalid';
    delete process.env.AI_PROVIDER_RESPONSE_FORMAT;
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-config-defaults',
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

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.temperature).toBe(0.7);
    expect(requestBody.response_format).toEqual({ type: 'json_object' });
  });

  test('supports disabled response format and separate generation and rewrite temperatures', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_GENERATION_TEMPERATURE = '0.2';
    process.env.AI_PROVIDER_REWRITE_TEMPERATURE = '1.3';
    process.env.AI_PROVIDER_RESPONSE_FORMAT = 'off';
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-config-generation',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    })).rejects.toMatchObject({ message: 'AI provider request failed with status 400' });
    await expect(service.rewriteBlock({
      draftId: 'draft-provider-config-rewrite',
      blockId: 'block-config',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '海风把傍晚吹得很安静。',
      selectedPhotoIds: ['photo-8', 'photo-9'],
      photoIds: ['photo-8'],
    })).rejects.toMatchObject({ message: 'AI provider request failed with status 400' });

    const generationBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const rewriteBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(generationBody.temperature).toBe(0.2);
    expect(rewriteBody.temperature).toBe(1.3);
    expect(generationBody).not.toHaveProperty('response_format');
    expect(rewriteBody).not.toHaveProperty('response_format');
  });

  test('rejects unsupported provider response formats before making a request', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_RESPONSE_FORMAT = 'json_schema';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-config-unsupported',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'unsupported AI provider response format: json_schema',
    } satisfies Partial<DiaryGenerationProviderError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('marks retryable provider network failures as retryable provider errors', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNRESET' },
      }),
    ) as unknown as typeof fetch;

    await expect(service.generate({
      draftId: 'draft-provider-network-error',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: true,
      message: 'AI provider network request failed (ECONNRESET)',
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
