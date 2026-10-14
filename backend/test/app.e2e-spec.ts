import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MemoryStoreService } from '../src/common/memory-store.service';

describe('Backend foundation (e2e)', () => {
  let app: INestApplication;
  let store: MemoryStoreService;
  const deviceA = 'device-a';
  const deviceB = 'device-b';
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  async function waitForGenerationCompletion(server: ReturnType<INestApplication['getHttpServer']>, jobId: string, deviceId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(server)
        .get(`/api/generation/jobs/${jobId}`)
        .set('x-device-id', deviceId)
        .expect(200);
      if (response.body.data.status === 'succeeded') {
        return response;
      }
      if (response.body.data.status === 'failed' || response.body.data.status === 'cancelled') {
        throw new Error(`generation job ended unexpectedly with status ${response.body.data.status}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`generation job ${jobId} did not complete in time`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    store = moduleRef.get(MemoryStoreService);
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(async () => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    await store.reset();
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    await app.close();
  });

  it('GET /api/health', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });
  });

  it('supports draft create/save/memories flow', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const saved = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        idempotencyKey: `${draft.body.data.id}-save-1`,
        title: '测试日记',
        summary: '海边散步',
        location: '厦门海边',
        date: '2026-10-13',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/diaries/${saved.body.data.diaryId}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(saved.body.data.diaryId);
        expect(body.data.privacy).toBe('private');
        expect(body.data.publicBlockIds).toBeUndefined();
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].id).toBe(saved.body.data.id);
        expect(body.data.items[0].location).toBe('厦门海边');
      });

    await request(app.getHttpServer())
      .get('/api/memories?month=2026.10&day=2026.10.13&keyword=厦门')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].title).toBe('测试日记');
      });
  });

  it('supports save result lookup and idempotent retry', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        idempotencyKey: `${draft.body.data.id}-save-1`,
        title: '幂等测试日记',
        summary: '第一次保存',
        location: '泉州',
        date: '2026-10-12',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/diaries/save-results/${draft.body.data.id}-save-1`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(first.body.data.diaryId);
        expect(body.data.savedVersion).toBe(1);
      });

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        idempotencyKey: `${draft.body.data.id}-save-1`,
        title: '幂等测试日记',
        summary: '第二次保存',
        location: '泉州',
        date: '2026-10-12',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: 1,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(first.body.data.diaryId);
      });
  });

  it('rejects save when source diary version conflicts', async () => {
    const original = await store.saveDiary({
      draftId: 'draft-source-1',
      title: '原始版本',
      summary: '旧内容',
      location: '杭州',
      date: '2026.10.01',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      version: 2,
    }, deviceA);

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        id: original.id,
        draftId: 'draft-edit-1',
        sourceDiaryId: original.id,
        sourceDiaryVersion: 1,
        idempotencyKey: 'draft-edit-1-save-2',
        title: '冲突版本',
        summary: '新内容',
        location: '杭州',
        date: '2026-10-13',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: 2,
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('version_conflict');
      });
  });

  it('updates the existing diary in memories after edit save without creating a second record', async () => {
    const original = await store.saveDiary({
      draftId: 'draft-source-2',
      title: '编辑前标题',
      summary: '编辑前摘要',
      location: '苏州',
      date: '2026.10.02',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      version: 1,
    }, deviceA);

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        id: original.id,
        draftId: 'draft-edit-2',
        sourceDiaryId: original.id,
        sourceDiaryVersion: original.version,
        idempotencyKey: 'draft-edit-2-save-1',
        title: '编辑后标题',
        summary: '编辑后摘要',
        location: '苏州平江路',
        date: '2026-10-14',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: original.version,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(original.id);
      });

    await request(app.getHttpServer())
      .get('/api/memories?keyword=编辑后标题')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].id).toBe(original.id);
        expect(body.data.items[0].title).toBe('编辑后标题');
        expect(body.data.items[0].summary).toBe('编辑后摘要');
        expect(body.data.items[0].location).toBe('苏州平江路');
        expect(body.data.items[0].date).toBe('2026.10.14');
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].id).toBe(original.id);
      });
  });

  it('persists diary visibility and selected public blocks through the sharing endpoint', async () => {
    const diary = await store.saveDiary({
      draftId: 'draft-share-1',
      title: '公开范围测试',
      summary: '准备公开一段内容',
      location: '台南',
      date: '2026.10.03',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      version: 1,
    }, deviceA);

    const otherDiary = await store.saveDiary({
      draftId: 'draft-share-2',
      title: '不应被串写的日记',
      summary: '保持原始可见性',
      location: '高雄',
      date: '2026.10.04',
      privacy: 'private',
      photoIds: ['photo-4', 'photo-5', 'photo-6'],
      version: 1,
    }, deviceA);

    const visibilityCases = [
      { privacy: 'private', publicBlockIds: undefined },
      { privacy: 'anonymous', publicBlockIds: ['block-1'] },
      { privacy: 'public-likes', publicBlockIds: ['block-1'] },
      { privacy: 'public-comments', publicBlockIds: ['block-1'] },
    ] as const;

    for (const visibilityCase of visibilityCases) {
      await request(app.getHttpServer())
        .post('/api/sharing/project')
        .set('x-device-id', deviceA)
        .send({
          diaryId: diary.id,
          privacy: visibilityCase.privacy,
          publicBlockIds: visibilityCase.publicBlockIds,
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body.data.diaryId).toBe(diary.id);
          expect(body.data.privacy).toBe(visibilityCase.privacy);
          expect(body.data.publicBlockIds).toEqual(visibilityCase.publicBlockIds);
        });

      await request(app.getHttpServer())
        .get(`/api/diaries/${diary.id}`)
        .set('x-device-id', deviceA)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.privacy).toBe(visibilityCase.privacy);
          expect(body.data.publicBlockIds).toEqual(visibilityCase.publicBlockIds);
        });

      await request(app.getHttpServer())
        .get(`/api/diaries/${otherDiary.id}`)
        .set('x-device-id', deviceA)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe(otherDiary.id);
          expect(body.data.privacy).toBe('private');
          expect(body.data.publicBlockIds).toBeUndefined();
        });
    }

    await request(app.getHttpServer())
      .get(`/api/diaries/${diary.id}`)
      .set('x-device-id', deviceB)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('permission_denied');
      });
  });

  it('rejects unavailable and unknown diary types for new draft creation', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-work-creation',
        type: 'work',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
        expect(body.error.message).toBe('diary type is not available for creation');
      });

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-unknown-creation',
        type: 'unknown',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
        expect(body.error.message).toBe('unsupported diary type');
      });
  });

  it('rejects unavailable and unknown characters for new draft creation', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-hidden-character',
        type: 'travel',
        characterId: 'character-red',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
        expect(body.error.message).toBe('character is not available for creation');
      });

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-unknown-character',
        type: 'travel',
        characterId: 'character-missing',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
        expect(body.error.message).toBe('unsupported character id');
      });
  });

  it('preserves an existing travel draft when an invalid type overwrite is submitted', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-type-guard',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-type-guard',
        type: 'emotion',
        characterId: 'character-brown',
        selectedPhotoIds: ['photo-5', 'photo-6'],
        privacy: 'private',
        version: 2,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
        expect(body.error.message).toBe('diary type is not available for creation');
      });

    await request(app.getHttpServer())
      .get('/api/drafts/draft-type-guard')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.type).toBe('travel');
        expect(body.data.characterId).toBe('character-blue');
        expect(body.data.selectedPhotoIds).toEqual(['photo-1', 'photo-2', 'photo-3']);
      });
  });

  it('preserves an existing travel draft when an unavailable character overwrite is submitted', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-character-guard',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-character-guard',
        type: 'travel',
        characterId: 'character-red',
        selectedPhotoIds: ['photo-3', 'photo-4', 'photo-5'],
        privacy: 'private',
        version: 2,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
        expect(body.error.message).toBe('character is not available for creation');
      });

    await request(app.getHttpServer())
      .get('/api/drafts/draft-character-guard')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.characterId).toBe('character-blue');
        expect(body.data.selectedPhotoIds).toEqual(['photo-1', 'photo-2', 'photo-3']);
      });
  });

  it('allows legacy diary types when syncing an edit draft with source diary id', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-legacy-emotion',
        sourceDiaryId: 'diary-legacy-emotion',
        type: 'emotion',
        characterId: 'character-brown',
        selectedPhotoIds: ['photo-5', 'photo-6'],
        privacy: 'private',
        version: 1,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.type).toBe('emotion');
        expect(body.data.sourceDiaryId).toBe('diary-legacy-emotion');
      });
  });

  it('allows legacy hidden characters when syncing an edit draft with source diary id', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-legacy-character',
        sourceDiaryId: 'diary-legacy-character',
        type: 'travel',
        characterId: 'character-red',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.characterId).toBe('character-red');
        expect(body.data.sourceDiaryId).toBe('diary-legacy-character');
      });
  });

  it('reuses the same travel draft when the same draft id is submitted twice', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-travel-reuse',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-travel-reuse',
        type: 'travel',
        characterId: 'character-green',
        selectedPhotoIds: ['photo-3', 'photo-4', 'photo-5'],
        privacy: 'private',
        version: 2,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.id).toBe('draft-travel-reuse');
        expect(body.data.characterId).toBe('character-green');
        expect(body.data.selectedPhotoIds).toEqual(['photo-3', 'photo-4', 'photo-5']);
        expect(body.data.version).toBe(2);
      });

    await request(app.getHttpServer())
      .get('/api/drafts')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe('draft-travel-reuse');
      });
  });

  it('supports generation job create and polling', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-remote-1',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 2,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-remote-1',
        draftVersion: 2,
        idempotencyKey: 'draft-remote-1-round-2',
      })
      .expect(201);

    expect(created.body.data.jobId).toBeTruthy();

    const completed = await waitForGenerationCompletion(app.getHttpServer(), created.body.data.jobId, deviceA);
    expect(completed.body.data.draftId).toBe('draft-remote-1');
    expect(completed.body.data.idempotencyKey).toBe('draft-remote-1-round-2');
    expect(completed.body.data.status).toBe('succeeded');
    expect(completed.body.data.stage).toBe('completed');
    expect(completed.body.data.result.title).toContain('把旅程写成一页');
    expect(completed.body.data.result.coverPhotoId).toBe('photo-1');
    expect(completed.body.data.result.blocks.length).toBeGreaterThan(0);
  });

  it('parses openai-compatible provider content arrays with fenced JSON through the generation job flow', async () => {
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

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-provider-content-array',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-provider-content-array',
        draftVersion: 1,
        idempotencyKey: 'draft-provider-content-array-round-1',
      })
      .expect(201);

    const completed = await waitForGenerationCompletion(app.getHttpServer(), created.body.data.jobId, deviceA);
    expect(completed.body.data.status).toBe('succeeded');
    expect(completed.body.data.result.title).toBe('海风把旅程写成一页');
    expect(completed.body.data.result.coverPhotoId).toBe('photo-8');
    expect(completed.body.data.result.posterPhotoIds).toEqual(['photo-8', 'photo-9']);
    expect(completed.body.data.result.blocks).toEqual([
      {
        id: 'provider-block-1',
        type: 'text',
        content: '海风从傍晚一路吹到夜灯亮起。',
        photoIds: ['photo-8', 'photo-9'],
      },
    ]);
  });

  it('retries retryable provider failures once before succeeding', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_MAX_ATTEMPTS = '2';
    let requestCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return {
          ok: false,
          status: 503,
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: '真实 provider 成功结果',
                  summary: '第二次尝试后返回结构化结果。',
                  location: '台南',
                  date: '2026.10.13',
                  companionName: '自己',
                  coverPhotoId: 'photo-1',
                  posterPhotoIds: ['photo-1', 'photo-2'],
                  blocks: [
                    {
                      id: 'provider-block-1',
                      type: 'text',
                      content: '这是一段来自 provider 的正文。',
                      photoIds: ['photo-1', 'photo-2'],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      };
    }) as unknown as typeof fetch;

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-provider-retry',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-provider-retry',
        draftVersion: 1,
        idempotencyKey: 'draft-provider-retry-round-1',
      })
      .expect(201);

    const completed = await waitForGenerationCompletion(app.getHttpServer(), created.body.data.jobId, deviceA);
    expect(requestCount).toBe(2);
    expect(completed.body.data.status).toBe('succeeded');
    expect(completed.body.data.attemptCount).toBe(2);
    expect(completed.body.data.maxAttempts).toBe(2);
    expect(completed.body.data.errorCode).toBeUndefined();
    expect(completed.body.data.errorMessage).toBeUndefined();
  });

  it('retries retryable provider timeouts once before succeeding on the same generation job', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_MAX_ATTEMPTS = '2';
    process.env.AI_PROVIDER_TIMEOUT_MS = '1';
    let requestCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: '超时重试后的成功结果',
                  summary: '第一次超时后，第二次尝试返回结构化结果。',
                  location: '台南',
                  date: '2026.10.13',
                  companionName: '自己',
                  coverPhotoId: 'photo-1',
                  posterPhotoIds: ['photo-1', 'photo-2'],
                  blocks: [
                    {
                      id: 'provider-block-timeout-retry',
                      type: 'text',
                      content: '第二次尝试后生成成功。',
                      photoIds: ['photo-1', 'photo-2'],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      };
    }) as unknown as typeof fetch;

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-provider-timeout-retry',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-provider-timeout-retry',
        draftVersion: 1,
        idempotencyKey: 'draft-provider-timeout-retry-round-1',
      })
      .expect(201);

    const completed = await waitForGenerationCompletion(app.getHttpServer(), created.body.data.jobId, deviceA);
    expect(requestCount).toBe(2);
    expect(completed.body.data.status).toBe('succeeded');
    expect(completed.body.data.attemptCount).toBe(2);
    expect(completed.body.data.maxAttempts).toBe(2);
    expect(completed.body.data.errorCode).toBeUndefined();
    expect(completed.body.data.errorMessage).toBeUndefined();
  });

  it('records malformed provider success payloads as non-retryable generation failures', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_MAX_ATTEMPTS = '2';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
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

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-provider-malformed-success',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-provider-malformed-success',
        draftVersion: 1,
        idempotencyKey: 'draft-provider-malformed-success-round-1',
      })
      .expect(201);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(2);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe('photo block references a photo outside the selected set');
        expect(failed.body.data.retryable).toBe(false);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with malformed provider payload did not fail in time');
  });

  it('records retryable timeout details on the generation job when the provider aborts', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_MAX_ATTEMPTS = '1';
    process.env.AI_PROVIDER_TIMEOUT_MS = '1';
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch;

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-provider-timeout-failed',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-provider-timeout-failed',
        draftVersion: 1,
        idempotencyKey: 'draft-provider-timeout-failed-round-1',
      })
      .expect(201);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(1);
        expect(failed.body.data.errorCode).toBe('timeout');
        expect(failed.body.data.errorMessage).toBe('AI provider request timed out after 1ms');
        expect(failed.body.data.retryable).toBe(true);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with provider timeout did not fail in time');
  });

  it('records non-retryable provider failure details on the generation job', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_MAX_ATTEMPTS = '2';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
    }) as unknown as typeof fetch;

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-provider-failed',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-provider-failed',
        draftVersion: 1,
        idempotencyKey: 'draft-provider-failed-round-1',
      })
      .expect(201);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(2);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe('AI provider request failed with status 400');
        expect(failed.body.data.retryable).toBe(false);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job did not fail in time');
  });

  it('rejects generation job creation when draft is missing', async () => {
    await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-missing',
        draftVersion: 1,
        idempotencyKey: 'draft-missing-round-1',
      })
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('not_found');
        expect(body.error.message).toBe('draft not found');
        expect(body.error.retryable).toBe(false);
      });
  });

  it('restores persisted generation jobs after app reinitialization', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-restart-1',
        type: 'travel',
        characterId: 'character-green',
        selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
        privacy: 'private',
        version: 3,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-restart-1',
        draftVersion: 3,
        idempotencyKey: 'draft-restart-1-round-3',
      })
      .expect(201);

    const restartedModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const restartedApp = restartedModuleRef.createNestApplication();
    restartedApp.setGlobalPrefix('api');
    await restartedApp.init();

    try {
      const completed = await waitForGenerationCompletion(restartedApp.getHttpServer(), created.body.data.jobId, deviceA);
      expect(completed.body.data.jobId).toBe(created.body.data.jobId);
      expect(completed.body.data.status).toBe('succeeded');
      expect(completed.body.data.stage).toBe('completed');
      expect(completed.body.data.result.coverPhotoId).toBe('photo-4');
      expect(completed.body.data.result.blocks.length).toBeGreaterThan(0);

      await request(restartedApp.getHttpServer())
        .post('/api/generation/jobs')
        .set('x-device-id', deviceA)
        .send({
          draftId: 'draft-restart-1',
          draftVersion: 3,
          idempotencyKey: 'draft-restart-1-round-3',
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body.data.jobId).toBe(created.body.data.jobId);
        });
    } finally {
      await restartedApp.close();
    }
  });

  it('supports generation job cancellation', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-remote-2',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: 'draft-remote-2',
        draftVersion: 1,
        idempotencyKey: 'draft-remote-2-round-1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/generation/jobs/${created.body.data.jobId}/cancel`)
      .set('x-device-id', deviceA)
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.status).toBe('cancelled');
        expect(body.data.stage).toBe('cancelled');
      });

    await request(app.getHttpServer())
      .get(`/api/generation/jobs/${created.body.data.jobId}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.status).toBe('cancelled');
      });
  });

  it('returns structured not_found error when generation job is missing', async () => {
    await request(app.getHttpServer())
      .get('/api/generation/jobs/job-missing')
      .set('x-device-id', deviceA)
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('not_found');
        expect(body.error.message).toBe('generation job not found');
        expect(body.error.retryable).toBe(false);
      });

    await request(app.getHttpServer())
      .post('/api/generation/jobs/job-missing/cancel')
      .set('x-device-id', deviceA)
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('not_found');
        expect(body.error.message).toBe('generation job not found');
        expect(body.error.retryable).toBe(false);
      });
  });

  it('isolates private drafts, diaries and generation jobs by device identity', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-owned-by-a',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/drafts/${draft.body.data.id}`)
      .set('x-device-id', deviceB)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('permission_denied');
      });

    const generation = await request(app.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        draftVersion: 1,
        idempotencyKey: 'shared-round-1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/generation/jobs/${generation.body.data.jobId}`)
      .set('x-device-id', deviceB)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('permission_denied');
      });

    const saved = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        idempotencyKey: 'device-a-save-1',
        title: '仅设备 A 可见',
        summary: '设备归属隔离',
        location: '台南',
        date: '2026-10-13',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/diaries/${saved.body.data.diaryId}`)
      .set('x-device-id', deviceB)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('permission_denied');
      });

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceB)
      .send({
        id: saved.body.data.diaryId,
        draftId: 'draft-b-edit',
        sourceDiaryId: saved.body.data.diaryId,
        sourceDiaryVersion: 1,
        idempotencyKey: 'device-b-illegal-edit',
        title: '不应成功',
        summary: '不应成功',
        location: '高雄',
        date: '2026-10-14',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: 2,
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('permission_denied');
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceB)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(0);
      });
  });

  it('scopes identical save idempotency keys to the current device', async () => {
    const draftA = await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-device-a-same-key',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const draftB = await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceB)
      .send({
        id: 'draft-device-b-same-key',
        type: 'travel',
        characterId: 'character-green',
        selectedPhotoIds: ['photo-4', 'photo-5', 'photo-6'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const requestBodyA = {
      draftId: draftA.body.data.id,
      idempotencyKey: 'shared-save-key',
      title: '设备 A 的日记',
      summary: '同键不同设备',
      location: '台南',
      date: '2026-10-11',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      version: 1,
    };

    const requestBodyB = {
      draftId: draftB.body.data.id,
      idempotencyKey: 'shared-save-key',
      title: '设备 B 的日记',
      summary: '同键不同设备',
      location: '高雄',
      date: '2026-10-12',
      privacy: 'private',
      photoIds: ['photo-4', 'photo-5', 'photo-6'],
      version: 1,
    };

    const savedA = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send(requestBodyA)
      .expect(201);

    const savedB = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceB)
      .send(requestBodyB)
      .expect(201);

    expect(savedA.body.data.diaryId).not.toBe(savedB.body.data.diaryId);

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].title).toBe('设备 A 的日记');
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceB)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].title).toBe('设备 B 的日记');
      });

    await request(app.getHttpServer())
      .get('/api/diaries/save-results/shared-save-key')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(savedA.body.data.diaryId);
      });

    await request(app.getHttpServer())
      .get('/api/diaries/save-results/shared-save-key')
      .set('x-device-id', deviceB)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(savedB.body.data.diaryId);
      });
  });
});
