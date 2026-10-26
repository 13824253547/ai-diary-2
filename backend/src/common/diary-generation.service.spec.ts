import {
  DiaryGenerationProviderError,
  DiaryGenerationService,
  type GenerationInputSnapshot,
  type GenerationPhotoInput,
  type GenerationProgressReporter,
  type RewriteInputSnapshot,
} from './diary-generation.service';

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
    __fixtureDefaultFields: Object.keys(overrides),
  };
}

function mockOpenAiGenerationResult(result: unknown) {
  global.fetch = jest.fn((_url: unknown, init?: { body?: string }) => {
    let payload = result;
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const raw = result as Record<string, unknown>;
      const explicitFields = Array.isArray(raw.__fixtureDefaultFields)
        ? raw.__fixtureDefaultFields.filter((field): field is string => typeof field === 'string')
        : [];
      const request = init?.body ? JSON.parse(init.body) as Record<string, unknown> : {};
      const messages = Array.isArray(request.messages) ? request.messages : [];
      const userMessage = messages.find(message => (
        message && typeof message === 'object' && (message as Record<string, unknown>).role === 'user'
      )) as Record<string, unknown> | undefined;
      const content = userMessage?.content;
      const userText = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map(part => (
            part && typeof part === 'object' && (part as Record<string, unknown>).type === 'text'
              ? (part as Record<string, unknown>).text
              : ''
          )).filter((text): text is string => typeof text === 'string').join('\n')
          : '';
      const match = /selectedPhotoIds in exact order: ([^\n]*)/.exec(userText);
      const selectedPhotoIds = match?.[1].split(',').map(id => id.trim()).filter(Boolean) ?? [];
      const resultObject = { ...raw };
      delete resultObject.__fixtureDefaultFields;
      if (!explicitFields.includes('coverPhotoId')) resultObject.coverPhotoId = selectedPhotoIds[0];
      if (!explicitFields.includes('posterPhotoIds')) resultObject.posterPhotoIds = selectedPhotoIds.slice(0, 2);
      if (!explicitFields.includes('blocks')) {
        resultObject.blocks = selectedPhotoIds.map((photoId, index) => ({
          id: `provider-block-${index + 1}`,
          type: 'text',
          content: `与 ${photoId} 对应的测试正文。`,
          photoIds: [photoId],
        }));
      }
      payload = resultObject;
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
    });
  }) as unknown as typeof fetch;
}

describe('DiaryGenerationService', () => {
  const service = new DiaryGenerationService();
  const generate = service.generate.bind(service);
  const rewriteBlock = service.rewriteBlock.bind(service);
  service.generate = (
    input: GenerationInputSnapshot,
    options: {
      signal?: AbortSignal;
      photos?: GenerationPhotoInput[];
      onProgress?: GenerationProgressReporter;
    } = {},
  ) => generate(input, {
    ...options,
    photos: options.photos ?? input.selectedPhotoIds.map(photoId => ({
      photoId,
      mimeType: 'image/jpeg',
      base64: 'AQID',
    })),
  });
  service.rewriteBlock = (
    input: RewriteInputSnapshot,
    options: { photos?: GenerationPhotoInput[] } = {},
  ) => rewriteBlock(input, {
    ...options,
    photos: options.photos ?? (input.photoIds ?? []).map(photoId => ({
      photoId,
      mimeType: 'image/jpeg',
      base64: 'AQID',
    })),
  });
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.useRealTimers();
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
                    '      "photoIds": ["photo-8"]',
                    '    },',
                    '    {',
                    '      "id": "provider-block-2",',
                    '      "type": "text",',
                    '      "content": "照片里的风景把旅程继续向前推。",',
                    '      "photoIds": ["photo-9"]',
                    '    },',
                    '    {',
                    '      "id": "provider-block-3",',
                    '      "type": "text",',
                    '      "content": "最后一站为这段路留下温柔的收尾。",',
                    '      "photoIds": ["photo-10"]',
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
        photoIds: ['photo-8'],
        title: undefined,
      },
      {
        id: 'provider-block-2',
        type: 'text',
        content: '照片里的风景把旅程继续向前推。',
        photoIds: ['photo-9'],
        title: undefined,
      },
      {
        id: 'provider-block-3',
        type: 'text',
        content: '最后一站为这段路留下温柔的收尾。',
        photoIds: ['photo-10'],
        title: undefined,
      },
    ]);
  });

  test('reports generation milestones at provider submission, response, and validation boundaries', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult());
    const onProgress = jest.fn();

    await service.generate({
      draftId: 'draft-provider-progress-boundaries',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      privacy: 'private',
    }, { onProgress });

    expect(onProgress.mock.calls).toEqual([
      ['provider-submitted'],
      ['provider-response-received'],
      ['result-validated'],
    ]);
  });

  test('assigns a stable identifier when a provider omits the block id', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult({
      blocks: [{ type: 'text', content: '与照片相对应的正文。', photoIds: ['photo-8'] }],
    }));

    const result = await service.generate({
      draftId: 'draft-provider-missing-block-id',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8'],
      privacy: 'private',
    });

    expect(result.blocks[0].id).toBe('draft-provider-missing-block-id-provider-block-1');
  });

  test('does not use photo capture dates as the diary date', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 22, 12));
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult({ date: '2020.01.01' }));

    const result = await service.generate({
      draftId: 'draft-provider-latest-photo-date',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      privacy: 'private',
    }, {
      photos: [
        { photoId: 'photo-8', mimeType: 'image/jpeg', base64: 'one', date: '2026.10.19' },
        { photoId: 'photo-9', mimeType: 'image/jpeg', base64: 'two', date: '2026.10.21' },
        { photoId: 'photo-10', mimeType: 'image/jpeg', base64: 'three', date: '未知日期' },
      ],
    });

    expect(result.date).toBe('2026.10.22');
  });

  test('uses local today when selected photo dates are missing, invalid, or in the future', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 22, 12));
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult({ date: undefined }));

    const result = await service.generate({
      draftId: 'draft-provider-today-fallback',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      privacy: 'private',
    }, {
      photos: [
        { photoId: 'photo-8', mimeType: 'image/jpeg', base64: 'one', date: '未知日期' },
        { photoId: 'photo-9', mimeType: 'image/jpeg', base64: 'two', date: '2026.02.30' },
        { photoId: 'photo-10', mimeType: 'image/jpeg', base64: 'three', date: '2026.10.23' },
      ],
    });

    expect(result.date).toBe('2026.10.22');
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

  test('rejects an out-of-scope rewrite request before calling the provider', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.rewriteBlock({
      draftId: 'draft-rewrite-out-of-scope',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'text',
      content: '请帮我写一个 Python 脚本',
      selectedPhotoIds: [],
      photoIds: [],
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: '此功能仅用于整理日记和已选照片，不支持代码、小说或商业推广内容。',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['code block', '```python\nprint("hello")\n```'],
    ['commercial copy', '限时优惠，立即下单，买一送一！'],
  ])('rejects out-of-scope rewrite output: %s', async (_label, content) => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ content }) } }],
      }),
    }) as unknown as typeof fetch;

    await expect(service.rewriteBlock({
      draftId: 'draft-rewrite-output-policy',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'text',
      content: '沿着海边散步。',
      selectedPhotoIds: [],
      photoIds: [],
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: '生成结果超出日记内容范围，未予采用；请检查照片或原文后重试。',
    });
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
      'provider result must not contain standalone quote blocks',
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

  test('ignores provider rewrite photo changes and preserves the target block references', async () => {
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

    const result = await service.rewriteBlock({
      draftId: 'draft-rewrite-invalid-photo-reference',
      blockId: 'block-1',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '原始段落',
      selectedPhotoIds: ['photo-8', 'photo-9'],
      photoIds: ['photo-8'],
    });
    expect(result.content).toBe('改写后的内容');
    expect(result.photoIds).toEqual(['photo-8']);
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

  test('normalizes an omitted block type to text when the photo binding matches the request', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult({
      blocks: [{
        id: 'missing-type',
        content: '海风吹过来时，远处的灯刚亮起。',
        photoIds: ['photo-8'],
      }],
    }));

    const result = await service.generate({
      draftId: 'draft-provider-missing-type',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8'],
      privacy: 'private',
    });

    expect(result.blocks).toEqual([
      expect.objectContaining({
        id: 'missing-type',
        type: 'text',
        content: '海风吹过来时，远处的灯刚亮起。',
        photoIds: ['photo-8'],
      }),
    ]);
  });

  test.each([
    [
      'empty text content',
      { id: 'empty-text', type: 'text', content: '   ', photoIds: ['photo-8'] },
      'text block content is missing',
    ],
    [
      'unsupported explicit block type',
      { id: 'unsupported-type', type: 'image', content: '正文', photoIds: ['photo-8'] },
      'unsupported generation block type: image',
    ],
    [
      'non-string explicit block type',
      { id: 'null-type', type: null, content: '正文', photoIds: ['photo-8'] },
      'provider block type is invalid',
    ],
    [
      'empty quote content',
      { id: 'empty-quote', type: 'quote', content: '', photoIds: ['photo-8'] },
      'provider result must not contain standalone quote blocks',
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
      'provider result must not contain standalone quote blocks',
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

  test.each([
    ['missing name without detected people', { companionName: undefined }, '自己'],
    ['blank name without detected people', { companionName: '   ' }, '自己'],
    [
      'missing name with a detected non-self person',
      {
        companionName: undefined,
        people: [{ id: 'person-1', name: '同行者', photoIds: ['photo-8'], avatarPhotoId: 'photo-8' }],
      },
      '同行人',
    ],
  ])('fills companionName from normalized people when provider returns %s', async (_label, overrides, expected) => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult(overrides));

    const result = await service.generate({
      draftId: 'draft-provider-companion-fallback',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8'],
      privacy: 'private',
    });

    expect(result.companionName).toBe(expected);
  });

  test.each([
    ['code output', '```python\nprint("hello")\n```'],
    ['commercial output', '限时优惠，立即下单，买一送一！'],
  ])('rejects out-of-scope full-generation output: %s', async (_label, content) => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult({
      blocks: [{ id: 'provider-block', type: 'text', content, photoIds: ['photo-8'] }],
    }));

    await expect(service.generate({
      draftId: 'draft-provider-output-policy',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8'],
      privacy: 'private',
    }, {
      photos: [{
        photoId: 'photo-8',
        mimeType: 'image/jpeg',
        base64: 'synthetic-image',
      }],
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: '生成结果超出日记内容范围，未予采用；请检查照片或原文后重试。',
    });
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

  test('uses a four-minute default timeout for a submitted generation request', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER_TIMEOUT_MS;
    const timeoutSpy = jest.spyOn(global, 'setTimeout');
    const stringifySpy = jest.spyOn(JSON, 'stringify');
    mockOpenAiGenerationResult(buildValidProviderResult());

    try {
      for (const draftId of ['draft-provider-default-timeout-a', 'draft-provider-default-timeout-b']) {
        await service.generate({
          draftId,
          draftVersion: 2,
          type: 'travel',
          characterId: 'character-blue',
          selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
          privacy: 'private',
        });
      }

      const timerOrders = timeoutSpy.mock.calls
        .map((call, index) => call[1] === 240000 ? timeoutSpy.mock.invocationCallOrder[index] : undefined)
        .filter((order): order is number => order !== undefined);
      const requestBodyOrders = stringifySpy.mock.results
        .map((result, index) => (
          typeof result.value === 'string' && result.value.includes('"model":"gpt-test"')
            ? stringifySpy.mock.invocationCallOrder[index]
            : undefined
        ))
        .filter((order): order is number => order !== undefined);

      expect(timerOrders).toHaveLength(2);
      expect(requestBodyOrders).toHaveLength(2);
      expect(requestBodyOrders.every((order, index) => order < timerOrders[index])).toBe(true);
    } finally {
      timeoutSpy.mockRestore();
      stringifySpy.mockRestore();
    }
  });

  test('uses a fresh four-minute default timeout for a submitted rewrite request', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER_TIMEOUT_MS;
    const timeoutSpy = jest.spyOn(global, 'setTimeout');
    const stringifySpy = jest.spyOn(JSON, 'stringify');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ content: '改写后仍与前文衔接。' }) } }],
      }),
    }) as unknown as typeof fetch;

    try {
      await service.rewriteBlock({
        draftId: 'draft-rewrite-default-timeout',
        blockId: 'block-1',
        draftVersion: 2,
        characterId: 'character-blue',
        blockType: 'text',
        content: '原始段落内容。',
        selectedPhotoIds: [],
        photoIds: [],
      });

      const timerOrders = timeoutSpy.mock.calls
        .map((call, index) => call[1] === 240000 ? timeoutSpy.mock.invocationCallOrder[index] : undefined)
        .filter((order): order is number => order !== undefined);
      const requestBodyOrder = stringifySpy.mock.results.findIndex(result => (
        typeof result.value === 'string' && result.value.includes('"model":"gpt-test"')
      ));

      expect(timerOrders).toHaveLength(1);
      expect(requestBodyOrder).toBeGreaterThanOrEqual(0);
      expect(stringifySpy.mock.invocationCallOrder[requestBodyOrder]).toBeLessThan(timerOrders[0]);
    } finally {
      timeoutSpy.mockRestore();
      stringifySpy.mockRestore();
    }
  });

  test.each(['generation', 'rewrite'] as const)(
    'does not allow the configured %s provider timeout to exceed four minutes',
    async operation => {
      process.env.AI_PROVIDER = 'openai-compatible';
      process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
      process.env.AI_PROVIDER_MODEL = 'gpt-test';
      process.env.AI_PROVIDER_API_KEY = 'test-key';
      process.env.AI_PROVIDER_TIMEOUT_MS = '300000';
      const timeoutSpy = jest.spyOn(global, 'setTimeout');
      if (operation === 'generation') {
        mockOpenAiGenerationResult(buildValidProviderResult());
      } else {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ content: '改写后的正文。' }) } }],
          }),
        }) as unknown as typeof fetch;
      }

      try {
        if (operation === 'generation') {
          await service.generate({
            draftId: 'draft-provider-timeout-cap',
            draftVersion: 2,
            type: 'travel',
            characterId: 'character-blue',
            selectedPhotoIds: ['photo-8'],
            privacy: 'private',
          });
        } else {
          await service.rewriteBlock({
            draftId: 'draft-rewrite-timeout-cap',
            blockId: 'block-1',
            draftVersion: 2,
            characterId: 'character-blue',
            blockType: 'text',
            content: '原始段落内容。',
            selectedPhotoIds: [],
            photoIds: [],
          });
        }

        expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 240000);
      } finally {
        timeoutSpy.mockRestore();
      }
    },
  );

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

  test('reuses the configured Ark model and sends every selected image in one ordered multimodal request', async () => {
    delete process.env.DIARY_GENERATION_PROVIDER;
    process.env.AI_PROVIDER = 'deterministic';
    process.env.PET_CHAT_PROVIDER = 'ark-openai-compatible';
    process.env.PET_CHAT_BASE_URL = 'https://ark.example/api/v3';
    process.env.PET_CHAT_MODEL = 'doubao-seed-character-260628';
    process.env.PET_CHAT_API_KEY = 'test-key';
    process.env.PET_CHAT_TEMPERATURE = '0.6';
    process.env.AI_PROVIDER_RESPONSE_FORMAT = 'off';
    mockOpenAiGenerationResult(buildValidProviderResult());
    const fetchMock = global.fetch as jest.Mock;
    const selectedPhotoIds = ['photo-8', 'photo-9', 'photo-10'];

    await service.generate({
      draftId: 'draft-ark-multimodal',
      draftVersion: 5,
      type: 'travel',
      characterId: 'character-green',
      selectedPhotoIds,
      privacy: 'private',
    }, {
      photos: selectedPhotoIds.map((photoId, index) => ({
        photoId,
        mimeType: 'image/jpeg',
        base64: `base64-${index}`,
        date: '2026.10.20',
        title: `IMG_${index + 1}.jpg`,
        location: '家庭相册',
      } as GenerationPhotoInput & { title: string; location: string })),
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    const content = request.messages[1].content;
    const imageParts = content.filter((part: { type?: string }) => part.type === 'image_url');
    const textParts = content.filter((part: { type?: string }) => part.type === 'text');
    expect(request.model).toBe('doubao-seed-character-260628');
    expect(request.temperature).toBe(0.6);
    expect(request.messages[0].content).toContain('复古明信片 · 风景来信');
    expect(request.messages[0].content).toContain('不生成 quote 块或 photo 独立块');
    expect(imageParts.map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual([
      'data:image/jpeg;base64,base64-0',
      'data:image/jpeg;base64,base64-1',
      'data:image/jpeg;base64,base64-2',
    ]);
    expect(textParts.map((part: { text: string }) => part.text).join('\n')).toContain('照片 2/3，photoId=photo-9');
    const serializedText = textParts.map((part: { text: string }) => part.text).join('\n');
    expect(serializedText).toContain('拍摄日期元数据（不得照抄到正文）：2026.10.20');
    expect(serializedText).not.toContain('IMG_');
    expect(serializedText).not.toContain('家庭相册');
    expect(content).toHaveLength(7);
  });

  test('single-block rewrite receives read-only full-text context and cannot replace its photo references', async () => {
    delete process.env.DIARY_GENERATION_PROVIDER;
    process.env.PET_CHAT_PROVIDER = 'ark-openai-compatible';
    process.env.PET_CHAT_BASE_URL = 'https://ark.example/api/v3';
    process.env.PET_CHAT_MODEL = 'doubao-seed-character-260628';
    process.env.PET_CHAT_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"content":"改写后仍与前后文衔接。","photoIds":["photo-999"]}' } }],
      }),
    }) as unknown as typeof fetch;

    const result = await service.rewriteBlock({
      draftId: 'draft-rewrite-context',
      blockId: 'block-2',
      draftVersion: 4,
      characterId: 'character-brown',
      blockType: 'text',
      content: '这是需要改写的目标段。',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      photoIds: ['photo-2'],
      contextBlocks: [
        { id: 'block-1', type: 'text', content: '前文地点与行程。' },
        { id: 'block-3', type: 'quote', content: '后文引用句。' },
      ],
    }, {
      photos: [{
        photoId: 'photo-2',
        mimeType: 'image/jpeg',
        base64: 'target-image',
        date: '2026.10.20',
        title: 'IMG_1234.jpg',
        location: '家庭相册',
      } as GenerationPhotoInput & { title: string; location: string }],
    });

    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const messageContent = request.messages[1].content;
    expect(request.messages[0].content).toContain('只读上下文');
    expect(request.messages[0].content).toContain('北欧简约');
    expect(messageContent[0].text).toContain('前文地点与行程。');
    expect(messageContent[0].text).toContain('后文引用句。');
    expect(messageContent[0].text).toContain('这是需要改写的目标段。');
    expect(messageContent[0].text).toContain('辅助拍摄信息=2026.10.20');
    expect(messageContent[0].text).not.toContain('IMG_1234.jpg');
    expect(messageContent[0].text).not.toContain('家庭相册');
    expect(messageContent.filter((part: { type?: string }) => part.type === 'image_url')).toHaveLength(1);
    expect(result.content).toBe('改写后仍与前后文衔接。');
    expect(result.photoIds).toEqual(['photo-2']);
  });

  test('rejects provider output unless each selected image has exactly one ordered text block', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    mockOpenAiGenerationResult(buildValidProviderResult({
      blocks: [{ id: 'only-one', type: 'text', content: '只生成了一段', photoIds: ['photo-8'] }],
    }));

    await expect(service.generate({
      draftId: 'draft-cardinality-failure',
      draftVersion: 1,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
      privacy: 'private',
    })).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
      message: 'provider result must contain exactly one text block per selected photo',
    });
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
