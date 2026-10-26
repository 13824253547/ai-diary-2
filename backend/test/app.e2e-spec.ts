import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiBodyParser } from '../src/common/api-body-parser';
import { MemoryStoreService, type DiaryContentSnapshotRecord } from '../src/common/memory-store.service';
import { PrismaService } from '../src/common/prisma.service';

describe('Backend foundation (e2e)', () => {
  let app: INestApplication;
  let store: MemoryStoreService;
  let prisma: PrismaService;
  const deviceA = 'device-a';
  const deviceB = 'device-b';
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  function createDiaryContentSnapshot(title: string, photoIds: string[]): DiaryContentSnapshotRecord {
    return {
      type: 'travel',
      subtitle: title,
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      coverPhotoId: photoIds[0] ?? '',
      posterPhotoIds: photoIds.slice(0, 2),
      blocks: [{
        id: 'block-1',
        type: 'text',
        title,
        content: title,
        photoIds: photoIds.slice(0, 2),
      }],
      people: [],
    };
  }

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

  async function postGenerationJob(
    input: { draftId: string; draftVersion: number; idempotencyKey: string },
    deviceId: string,
    server: ReturnType<INestApplication['getHttpServer']> = app.getHttpServer(),
    expectedStatus = 201,
  ) {
    const draft = await store.getDraft(input.draftId, deviceId);
    const selectedPhotoIds = draft?.selectedPhotoIds ?? [];
    let upload = request(server)
      .post('/api/generation/jobs')
      .set('x-device-id', deviceId)
      .field('draftId', input.draftId)
      .field('draftVersion', String(input.draftVersion))
      .field('idempotencyKey', input.idempotencyKey)
      .field('photoMetadata', JSON.stringify(selectedPhotoIds.map((photoId, index) => ({
        photoId,
        date: '2026.10.20',
      }))));
    selectedPhotoIds.forEach((photoId, index) => {
      upload = upload.attach('photos', Buffer.from([0xff, 0xd8, 0xff, index, 0xff, 0xd9]), {
        filename: `${photoId}.jpg`,
        contentType: 'image/jpeg',
      });
    });
    return upload.expect(expectedStatus);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApiBodyParser(app);
    store = moduleRef.get(MemoryStoreService);
    prisma = moduleRef.get(PrismaService);
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
      .set('x-device-id', 'device-health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });
  });

  it('requires device identity for health requests', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(400);
    expect(response.body.error.code).toBe('device_identity_required');
  });

  it('rejects missing device identity instead of reading the shared anonymous namespace', async () => {
    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', 'device-anonymous')
      .send({
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const missingIdentityDrafts = await request(app.getHttpServer())
      .get('/api/drafts')
      .expect(400);

    expect(missingIdentityDrafts.body.error.code).toBe('device_identity_required');

    const missingIdentityResponse = await request(app.getHttpServer())
      .get('/api/identity/me')
      .expect(400);

    expect(missingIdentityResponse.body.error.code).toBe('device_identity_required');

    const blankIdentityDrafts = await request(app.getHttpServer())
      .get('/api/drafts')
      .set('x-device-id', '   ')
      .expect(400);

    expect(blankIdentityDrafts.body.error.code).toBe('device_identity_required');
  });

  it('supports draft create/save/memories flow', async () => {
    const contentSnapshot = {
      type: 'travel',
      subtitle: '海边散步',
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      coverPhotoId: 'photo-1',
      posterPhotoIds: ['photo-1', 'photo-2'],
      blocks: [
        { id: 'block-1', type: 'text', title: '沿海慢行', content: '沿着厦门海边散步。', photoIds: ['photo-1'] },
        { id: 'quote-1', type: 'quote', content: '把时间留给海风。', relatedBlockId: 'block-1' },
        { id: 'photo-block-1', type: 'photo', photoId: 'photo-1', caption: '海边的午后', relatedBlockId: 'block-1' },
      ],
      people: [],
    };
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
        contentSnapshot,
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
        expect(body.data.contentSnapshot).toEqual(contentSnapshot);
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].id).toBe(saved.body.data.id);
        expect(body.data.items[0].location).toBe('厦门海边');
        expect(body.data.items[0].contentSnapshot.blocks).toEqual(contentSnapshot.blocks);
      });

    await request(app.getHttpServer())
      .get('/api/memories?month=2026-10&day=2026-10-13&keyword=厦门')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].title).toBe('测试日记');
      });
  });

  it('marks a scalar-corrupted database snapshot without hiding the diary metadata', async () => {
    const saved = await store.saveDiary({
      draftId: 'draft-corrupt-content-snapshot',
      title: '正文快照损坏',
      summary: '数据库中的正文快照已损坏。',
      location: '厦门',
      date: '2026-10-13',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot: createDiaryContentSnapshot('有效初始正文', ['photo-1', 'photo-2', 'photo-3']),
      version: 1,
    }, deviceA);
    await prisma.diary.update({
      where: { id: saved.id },
      data: { contentSnapshot: 'corrupt-snapshot-scalar' },
    });

    await request(app.getHttpServer())
      .get(`/api/diaries/${saved.id}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(saved.id);
        expect(body.data.contentSnapshot).toBeUndefined();
        expect(body.data.contentSnapshotStatus).toBe('invalid');
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].id).toBe(saved.id);
        expect(body.data.items[0].contentSnapshotStatus).toBe('invalid');
      });
  });

  it('rejects saves that omit a valid content snapshot', async () => {
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

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        idempotencyKey: 'missing-content-snapshot',
        title: '缺少正文的日记',
        summary: '不应被假保存',
        location: '厦门',
        date: '2026-10-15',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        version: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
      });

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        idempotencyKey: 'invalid-content-photo-reference',
        title: '越界照片正文',
        summary: '引用不属于日记的照片',
        location: '厦门',
        date: '2026-10-15',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        contentSnapshot: {
          ...createDiaryContentSnapshot('越界照片正文', ['photo-1', 'photo-2', 'photo-3']),
          blocks: [{
            id: 'block-1',
            type: 'text',
            content: '不应引用未选择的照片。',
            photoIds: ['photo-outside-selection'],
          }],
        },
        version: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
      });

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        draftId: draft.body.data.id,
        idempotencyKey: 'duplicate-person-ids',
        title: '人物标识重复',
        summary: '两个候选不能共享一个标识。',
        location: '厦门',
        date: '2026-10-15',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        contentSnapshot: {
          ...createDiaryContentSnapshot('人物标识重复', ['photo-1', 'photo-2', 'photo-3']),
          people: [
            { id: 'person-duplicate', name: '同行者甲', photoIds: ['photo-1'], avatarPhotoId: 'photo-1' },
            { id: 'person-duplicate', name: '同行者乙', photoIds: ['photo-2'], avatarPhotoId: 'photo-2' },
          ],
        },
        version: 1,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_input');
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(0);
      });
  });

  it('rolls back a diary when its save command write fails and retries atomically', async () => {
    const idempotencyKey = 'transaction-failure-retry';
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
    const saveInput = {
      draftId: draft.body.data.id,
      idempotencyKey,
      title: '事务回滚后重试',
      summary: '保留可重试草稿',
      location: '厦门',
      date: '2026-10-15',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot: createDiaryContentSnapshot('事务回滚后重试', ['photo-1', 'photo-2', 'photo-3']),
      version: 1,
    };

    const mutablePrisma = prisma as unknown as {
      $transaction: (...args: any[]) => Promise<unknown>;
    };
    const originalTransaction = mutablePrisma.$transaction;
    let failureInjected = false;
    mutablePrisma.$transaction = (callback: (transaction: any) => Promise<unknown>, options?: unknown) => originalTransaction.call(
      prisma,
      (transaction: any) => callback(new Proxy(transaction, {
        get(target, property, receiver) {
          const delegate = Reflect.get(target, property, receiver);
          if (property !== 'saveCommand' || !delegate) return delegate;
          return new Proxy(delegate, {
            get(delegateTarget, method, delegateReceiver) {
              if (method === 'create') {
                return async () => {
                  failureInjected = true;
                  throw new Error('injected save command write failure');
                };
              }
              const value = Reflect.get(delegateTarget, method, delegateReceiver);
              return typeof value === 'function' ? value.bind(delegateTarget) : value;
            },
          });
        },
      })),
      options,
    );
    try {
      await request(app.getHttpServer())
        .post('/api/diaries/save')
        .set('x-device-id', deviceA)
        .send(saveInput)
        .expect(500);
      expect(failureInjected).toBe(true);

      await request(app.getHttpServer())
        .get('/api/memories')
        .set('x-device-id', deviceA)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.total).toBe(0);
        });

      await request(app.getHttpServer())
        .get(`/api/diaries/save-results/${idempotencyKey}`)
        .set('x-device-id', deviceA)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/drafts/${draft.body.data.id}`)
        .set('x-device-id', deviceA)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe(draft.body.data.id);
          expect(body.data.selectedPhotoIds).toEqual(saveInput.photoIds);
        });
    } finally {
      mutablePrisma.$transaction = originalTransaction;
    }

    const retry = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send(saveInput)
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(1);
        expect(body.data.items[0].id).toBe(retry.body.data.diaryId);
        expect(body.data.items[0].contentSnapshot.blocks).toEqual(saveInput.contentSnapshot.blocks);
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
        contentSnapshot: createDiaryContentSnapshot('幂等测试日记', ['photo-1', 'photo-2', 'photo-3']),
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
        contentSnapshot: createDiaryContentSnapshot('幂等测试日记', ['photo-1', 'photo-2', 'photo-3']),
        version: 1,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(first.body.data.diaryId);
      });
  });

  it('rejects a save idempotency key reused for a different draft or source revision', async () => {
    const photos = ['photo-1', 'photo-2', 'photo-3'];
    const newSave = {
      draftId: 'draft-idempotency-new-a',
      idempotencyKey: 'save-idempotency-shared-key',
      title: '首次保存',
      summary: '初始摘要',
      location: '泉州',
      date: '2026-10-12',
      privacy: 'private',
      photoIds: photos,
      contentSnapshot: createDiaryContentSnapshot('首次保存', photos),
      version: 1,
    };
    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send(newSave)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({ ...newSave, draftId: 'draft-idempotency-new-b' })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('version_conflict');
        expect(body.error.retryable).toBe(false);
      });

    const source = await store.saveDiary({
      draftId: 'draft-idempotency-source',
      title: '待编辑作品',
      summary: '原始摘要',
      location: '杭州',
      date: '2026-10-10',
      privacy: 'private',
      photoIds: photos,
      contentSnapshot: createDiaryContentSnapshot('待编辑作品', photos),
      version: 1,
    }, deviceA);
    const editSave = {
      id: source.id,
      draftId: 'draft-idempotency-edit',
      sourceDiaryId: source.id,
      sourceDiaryVersion: 1,
      idempotencyKey: 'save-idempotency-edit-key',
      title: '编辑后作品',
      summary: '更新摘要',
      location: '杭州',
      date: '2026-10-11',
      privacy: 'private',
      photoIds: photos,
      contentSnapshot: createDiaryContentSnapshot('编辑后作品', photos),
      version: 1,
    };
    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send(editSave)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({ ...editSave, sourceDiaryVersion: 2 })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('version_conflict');
        expect(body.error.retryable).toBe(false);
      });
  });

  it('returns the original save result after the diary has a later edit', async () => {
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
    const originalSave = {
      draftId: draft.body.data.id,
      idempotencyKey: `${draft.body.data.id}-save-1`,
      title: '首次保存',
      summary: '初始内容',
      location: '泉州',
      date: '2026-10-12',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot: createDiaryContentSnapshot('首次保存', ['photo-1', 'photo-2', 'photo-3']),
      version: 1,
    };
    const first = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send(originalSave)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        id: first.body.data.diaryId,
        draftId: 'later-edit-draft',
        sourceDiaryId: first.body.data.diaryId,
        sourceDiaryVersion: 1,
        idempotencyKey: 'later-edit-save',
        title: '后续编辑',
        summary: '更新后的内容',
        location: '厦门',
        date: '2026-10-13',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        contentSnapshot: createDiaryContentSnapshot('后续编辑', ['photo-1', 'photo-2', 'photo-3']),
        version: 1,
      })
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send(originalSave)
      .expect(201);
    const result = await request(app.getHttpServer())
      .get(`/api/diaries/save-results/${originalSave.idempotencyKey}`)
      .set('x-device-id', deviceA)
      .expect(200);

    expect(replay.body.data).toEqual({
      diaryId: first.body.data.diaryId,
      draftId: originalSave.draftId,
      savedVersion: 1,
      id: first.body.data.diaryId,
    });
    expect(replay.body.data).toEqual(result.body.data);
    await request(app.getHttpServer())
      .get(`/api/diaries/${first.body.data.diaryId}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.title).toBe('后续编辑');
        expect(body.data.version).toBe(2);
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
        contentSnapshot: createDiaryContentSnapshot('冲突版本', ['photo-1', 'photo-2', 'photo-3']),
        version: 2,
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('version_conflict');
      });
  });

  it('allows only one concurrent edit from the same source diary version', async () => {
    const original = await store.saveDiary({
      draftId: 'draft-concurrent-source',
      title: '并发编辑前',
      summary: '原始摘要',
      location: '杭州',
      date: '2026.10.01',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      version: 1,
    }, deviceA);

    const save = (suffix: string) => request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        id: original.id,
        draftId: `draft-concurrent-${suffix}`,
        sourceDiaryId: original.id,
        sourceDiaryVersion: original.version,
        idempotencyKey: `concurrent-save-${suffix}`,
        title: `并发版本 ${suffix}`,
        summary: `摘要 ${suffix}`,
        location: '杭州',
        date: '2026-10-02',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3'],
        contentSnapshot: createDiaryContentSnapshot(`并发版本 ${suffix}`, ['photo-1', 'photo-2', 'photo-3']),
        version: 1,
      });

    const responses = await Promise.all([save('a'), save('b')]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409)?.body.error.code).toBe('version_conflict');

    await request(app.getHttpServer())
      .get(`/api/diaries/${original.id}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.version).toBe(2);
        expect(['并发版本 a', '并发版本 b']).toContain(body.data.title);
      });
  });

  it('returns the same result for concurrent retries of one edit command', async () => {
    const original = await store.saveDiary({
      draftId: 'draft-concurrent-idempotent-source',
      title: '幂等并发编辑前',
      summary: '原始摘要',
      location: '杭州',
      date: '2026.10.01',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot: createDiaryContentSnapshot('幂等并发编辑后', ['photo-1', 'photo-2', 'photo-3']),
      version: 1,
    }, deviceA);
    const body = {
      id: original.id,
      draftId: 'draft-concurrent-idempotent',
      sourceDiaryId: original.id,
      sourceDiaryVersion: original.version,
      idempotencyKey: 'concurrent-idempotent-edit',
      title: '幂等并发编辑后',
      summary: '同一命令重复提交',
      location: '杭州',
      date: '2026-10-02',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
        contentSnapshot: createDiaryContentSnapshot('幂等并发编辑后', ['photo-1', 'photo-2', 'photo-3']),
      version: 1,
    };
    const submit = () => request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send(body);

    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    expect(responses[0].body.data.diaryId).toBe(original.id);
    expect(responses[1].body.data.diaryId).toBe(original.id);
    expect(responses[0].body.data.savedVersion).toBe(2);
    expect(responses[1].body.data.savedVersion).toBe(2);

    await request(app.getHttpServer())
      .get(`/api/diaries/${original.id}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body: responseBody }) => {
        expect(responseBody.data.version).toBe(2);
        expect(responseBody.data.title).toBe('幂等并发编辑后');
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
    const contentSnapshot = {
      type: 'travel',
      subtitle: '修改后的副标题',
      helperMessage: '',
      characterId: 'character-green',
      companionName: '同行人',
      coverPhotoId: 'photo-2',
      posterPhotoIds: ['photo-2', 'photo-3'],
      blocks: [
        { id: 'edited-block-1', type: 'text', title: '新段落', content: '修改后的真实正文。', photoIds: ['photo-2'] },
      ],
      people: [],
    };

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
        contentSnapshot,
        version: original.version,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(original.id);
        expect(body.data.savedVersion).toBe(2);
      });

    await request(app.getHttpServer())
      .get(`/api/diaries/${original.id}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.version).toBe(2);
        expect(body.data.contentSnapshot).toEqual(contentSnapshot);
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
        expect(body.data.items[0].contentSnapshot).toEqual(contentSnapshot);
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

  it('persists an applied material photo on the existing diary without changing another diary', async () => {
    const source = await store.saveDiary({
      draftId: 'draft-material-source',
      title: '素材追加前',
      summary: '原有段落',
      location: '苏州',
      date: '2026-10-10',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      contentSnapshot: createDiaryContentSnapshot('原有段落', ['photo-1', 'photo-2', 'photo-3']),
      version: 1,
    }, deviceA);
    const other = await store.saveDiary({
      draftId: 'draft-material-other',
      title: '另一篇日记',
      summary: '保持原样',
      location: '杭州',
      date: '2026-10-11',
      privacy: 'private',
      photoIds: ['photo-5', 'photo-6', 'photo-7'],
      contentSnapshot: createDiaryContentSnapshot('保持原样', ['photo-5', 'photo-6', 'photo-7']),
      version: 1,
    }, deviceA);
    const contentSnapshot: DiaryContentSnapshotRecord = {
      type: 'travel',
      subtitle: '素材追加后的副标题',
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      coverPhotoId: 'photo-1',
      posterPhotoIds: ['photo-1', 'photo-2'],
      blocks: [{
        id: 'material-block-1',
        type: 'text',
        title: '同一段落',
        content: '原有正文继续保留。',
        photoIds: ['photo-1', 'photo-4'],
      }],
      people: [],
    };

    await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', deviceA)
      .send({
        id: source.id,
        draftId: 'draft-material-edit',
        sourceDiaryId: source.id,
        sourceDiaryVersion: source.version,
        idempotencyKey: 'mat002-material-apply-save',
        title: '素材追加后',
        summary: '原有段落',
        location: '苏州',
        date: '2026-10-10',
        privacy: 'private',
        photoIds: ['photo-1', 'photo-2', 'photo-3', 'photo-4'],
        contentSnapshot,
        version: source.version,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.diaryId).toBe(source.id);
        expect(body.data.savedVersion).toBe(2);
      });

    await request(app.getHttpServer())
      .get(`/api/diaries/${source.id}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(source.id);
        expect(body.data.version).toBe(2);
        expect(body.data.photoIds).toEqual(['photo-1', 'photo-2', 'photo-3', 'photo-4']);
        expect(body.data.contentSnapshot).toEqual(contentSnapshot);
      });

    await request(app.getHttpServer())
      .get(`/api/diaries/${other.id}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(other.id);
        expect(body.data.version).toBe(1);
        expect(body.data.photoIds).toEqual(['photo-5', 'photo-6', 'photo-7']);
        expect(body.data.contentSnapshot).toEqual(other.contentSnapshot);
      });

    await request(app.getHttpServer())
      .get('/api/memories')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.total).toBe(2);
        expect(body.data.items.filter((item: { id: string }) => item.id === source.id)).toHaveLength(1);
        expect(body.data.items.find((item: { id: string }) => item.id === source.id).photoIds).toContain('photo-4');
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
      contentSnapshot: {
        type: 'travel',
        subtitle: '台南慢行',
        helperMessage: '',
        characterId: 'character-blue',
        companionName: '自己',
        coverPhotoId: 'photo-1',
        posterPhotoIds: ['photo-1', 'photo-2'],
        blocks: [
          { id: 'block-1', type: 'text', title: '台南', content: '准备公开一段内容', photoIds: ['photo-1'] },
          { id: 'photo-block-1', type: 'photo', photoId: 'photo-1', caption: '台南街景', relatedBlockId: 'block-1' },
        ],
        people: [],
      },
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

    const invalidVisibilityCases = [
      { privacy: 'anonymous' },
      { privacy: 'public-likes', publicBlockIds: [] },
      { privacy: 'public-comments', publicBlockIds: ['   '] },
      { privacy: 'anonymous', publicBlockIds: ['unknown-block'] },
      { privacy: 'public-likes', publicBlockIds: ['photo-block-1'] },
      { privacy: 'unknown-visibility', publicBlockIds: ['block-1'] },
    ];
    for (const invalidVisibility of invalidVisibilityCases) {
      await request(app.getHttpServer())
        .post('/api/sharing/project')
        .set('x-device-id', deviceA)
        .send({ diaryId: diary.id, ...invalidVisibility })
        .expect(400)
        .expect(({ body }) => {
          expect(body.error.code).toBe('invalid_input');
        });
    }

    await request(app.getHttpServer())
      .post('/api/sharing/project')
      .set('x-device-id', deviceB)
      .send({
        diaryId: diary.id,
        privacy: 'private',
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe('permission_denied');
      });

    await request(app.getHttpServer())
      .get(`/api/diaries/${diary.id}`)
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.privacy).toBe('public-comments');
        expect(body.data.publicBlockIds).toEqual(['block-1']);
      });

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

  it('rejects malformed draft fields before persistence and checks identity first', async () => {
    const validDraft = {
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
      version: 1,
    };
    const malformedBodies = [
      { ...validDraft, id: 'draft-invalid-photo-list', selectedPhotoIds: 'photo-1' },
      { ...validDraft, id: 'draft-invalid-photo-entry', selectedPhotoIds: ['photo-1', 2] },
      { ...validDraft, id: 'draft-invalid-privacy', privacy: 'public' },
      { ...validDraft, id: 'draft-invalid-version', version: 1.5 },
      null,
    ];

    for (const body of malformedBodies) {
      await request(app.getHttpServer())
        .post('/api/drafts')
        .set('x-device-id', deviceA)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(400)
        .expect(({ body: responseBody }) => {
          expect(responseBody.error.code).toBe('invalid_input');
        });
    }

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('device_identity_required');
      });

    await request(app.getHttpServer())
      .get('/api/drafts')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([]);
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

  it('reads published discovery snapshots and persists device-scoped idempotent likes', async () => {
    const publishedAt = new Date('2026-10-16T10:00:00.000Z');
    const stories = [
      {
        id: 'story-latest-new',
        ownerDeviceId: deviceA,
        publicationStatus: 'published',
        title: '海港的傍晚',
        authorDisplayName: '小林',
        coverUri: 'file:///tmp/story-latest-new.png',
        date: new Date('2026-10-15T10:00:00.000Z'),
        location: '台南海港',
        body: '沿着海港慢慢散步。',
        likesEnabled: true,
        publishedAt,
        withdrawnAt: null,
      },
      {
        id: 'story-latest-old',
        ownerDeviceId: deviceA,
        publicationStatus: 'published',
        title: '海港的清晨',
        authorDisplayName: '小周',
        coverUri: 'file:///tmp/story-latest-old.png',
        date: new Date('2026-10-14T10:00:00.000Z'),
        location: '台南海港',
        body: '清晨在海边看船只出发。',
        likesEnabled: true,
        publishedAt,
        withdrawnAt: null,
      },
      {
        id: 'story-unpublished',
        ownerDeviceId: deviceA,
        publicationStatus: 'draft',
        title: '海港草稿',
        authorDisplayName: '小林',
        coverUri: 'file:///tmp/story-unpublished.png',
        date: new Date('2026-10-17T10:00:00.000Z'),
        location: '台南海港',
        body: '尚未发布。',
        likesEnabled: true,
        publishedAt: null,
        withdrawnAt: null,
      },
      {
        id: 'story-withdrawn',
        ownerDeviceId: deviceA,
        publicationStatus: 'published',
        title: '海港已撤回',
        authorDisplayName: '小林',
        coverUri: 'file:///tmp/story-withdrawn.png',
        date: new Date('2026-10-18T10:00:00.000Z'),
        location: '台南海港',
        body: '已撤回。',
        likesEnabled: true,
        publishedAt,
        withdrawnAt: new Date('2026-10-16T11:00:00.000Z'),
      },
      {
        id: 'story-likes-disabled',
        ownerDeviceId: deviceA,
        publicationStatus: 'published',
        title: '海港禁用互动',
        authorDisplayName: '小林',
        coverUri: 'file:///tmp/story-likes-disabled.png',
        date: new Date('2026-10-13T10:00:00.000Z'),
        location: '台南海港',
        body: '当前不可点赞。',
        likesEnabled: false,
        publishedAt,
        withdrawnAt: null,
      },
    ];
    for (const story of stories) {
      await prisma.discoveryStory.create({ data: story });
    }
    await prisma.discoveryLike.create({
      data: { storyId: 'story-latest-new', ownerDeviceId: deviceB },
    });

    const listing = await request(app.getHttpServer())
      .get('/api/discovery/stories')
      .query({ category: 'latest', keyword: '海港', page: '1', pageSize: '10' })
      .set('x-device-id', deviceA)
      .expect(200);
    expect(listing.body.data.items.map((item: { id: string }) => item.id))
      .toEqual(['story-latest-new', 'story-latest-old', 'story-likes-disabled']);
    expect(listing.body.data.items[0]).toMatchObject({ likeCount: 1, liked: false });
    expect(listing.body.data.total).toBe(3);

    await request(app.getHttpServer())
      .get('/api/discovery/stories/story-latest-new')
      .set('x-device-id', deviceA)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: 'story-latest-new',
          title: '海港的傍晚',
          author: '小林',
          body: '沿着海港慢慢散步。',
        });
      });
    await request(app.getHttpServer())
      .get('/api/discovery/stories/story-withdrawn')
      .set('x-device-id', deviceA)
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe('not_found'));
    await request(app.getHttpServer())
      .get('/api/discovery/stories/story-unpublished')
      .set('x-device-id', deviceA)
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe('not_found'));
    await request(app.getHttpServer())
      .get('/api/discovery/stories')
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('device_identity_required'));

    for (let replay = 0; replay < 2; replay += 1) {
      await request(app.getHttpServer())
        .put('/api/discovery/stories/story-latest-new/like')
        .set('x-device-id', deviceA)
        .send({ liked: true })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toMatchObject({
            storyId: 'story-latest-new',
            liked: true,
            likeCount: 2,
          });
        });
    }
    await request(app.getHttpServer())
      .put('/api/discovery/stories/story-latest-new/like')
      .set('x-device-id', deviceA)
      .send({ liked: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          storyId: 'story-latest-new',
          liked: false,
          likeCount: 1,
        });
      });
    await request(app.getHttpServer())
      .put('/api/discovery/stories/story-likes-disabled/like')
      .set('x-device-id', deviceA)
      .send({ liked: true })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('interaction_not_available'));

    const otherDeviceDetail = await request(app.getHttpServer())
      .get('/api/discovery/stories/story-latest-new')
      .set('x-device-id', deviceB)
      .expect(200);
    expect(otherDeviceDetail.body.data).toMatchObject({ liked: true, likeCount: 1 });

    await store.reset();
    expect(await prisma.discoveryStory.count()).toBe(0);
    expect(await prisma.discoveryLike.count()).toBe(0);
  });

  it('persists chat turns, explicit retries and device-scoped conversation history', async () => {
    const conversationId = 'chat-e2e-conversation-1';
    const requestId = 'chat-e2e-request-1';
    const beginBody = {
      requestId,
      userMessageId: 'chat-e2e-user-message-1',
      text: '今天沿着海边散步。',
    };

    const begun = await request(app.getHttpServer())
      .post(`/api/chat/conversations/${conversationId}/turns`)
      .set('x-device-id', deviceA)
      .send(beginBody)
      .expect(201);
    expect(begun.body.data).toMatchObject({
      id: conversationId,
      messages: [{ id: beginBody.userMessageId, role: 'user', text: beginBody.text }],
      turns: [{ requestId, sequence: 1, attempt: 1, status: 'pending' }],
    });

    const replayedBegin = await request(app.getHttpServer())
      .post(`/api/chat/conversations/${conversationId}/turns`)
      .set('x-device-id', deviceA)
      .send(beginBody)
      .expect(201);
    expect(replayedBegin.body.data.messages).toHaveLength(1);
    expect(replayedBegin.body.data.turns).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/chat/conversations/${conversationId}/turns/${requestId}/failure`)
      .set('x-device-id', deviceA)
      .send({ attempt: 1, failureCode: 'provider_failed' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.turns[0]).toMatchObject({
          requestId,
          attempt: 1,
          status: 'failed',
          failureCode: 'provider_failed',
        });
      });

    await request(app.getHttpServer())
      .post(`/api/chat/conversations/${conversationId}/turns/${requestId}/retry`)
      .set('x-device-id', deviceA)
      .send({ nextAttempt: 2 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.turns[0]).toMatchObject({
          requestId,
          attempt: 2,
          status: 'pending',
        });
      });

    await request(app.getHttpServer())
      .post(`/api/chat/conversations/${conversationId}/turns/${requestId}/reply`)
      .set('x-device-id', deviceA)
      .send({
        attempt: 2,
        assistantMessageId: 'chat-e2e-assistant-message-1',
        text: '海边的风景听起来很惬意。',
        source: 'mock',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.turns[0]).toMatchObject({
          requestId,
          attempt: 2,
          status: 'completed',
          source: 'mock',
        });
        expect(body.data.messages.map((message: { role: string }) => message.role))
          .toEqual(['user', 'assistant']);
      });

    const history = await request(app.getHttpServer())
      .get(`/api/chat/conversations/${conversationId}`)
      .set('x-device-id', deviceA)
      .expect(200);
    expect(history.body.data.messages).toHaveLength(2);
    const ownerList = await request(app.getHttpServer())
      .get('/api/chat/conversations?page=1&pageSize=10')
      .set('x-device-id', deviceA)
      .expect(200);
    expect(ownerList.body.data).toMatchObject({
      total: 1,
      items: [{ id: conversationId, messageCount: 2 }],
    });
    const otherDeviceList = await request(app.getHttpServer())
      .get('/api/chat/conversations?page=1&pageSize=10')
      .set('x-device-id', deviceB)
      .expect(200);
    expect(otherDeviceList.body.data).toMatchObject({ total: 0, items: [] });
    await request(app.getHttpServer())
      .get(`/api/chat/conversations/${conversationId}`)
      .set('x-device-id', deviceB)
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('permission_denied'));

    await store.reset();
    expect(await prisma.chatConversation.count()).toBe(0);
    expect(await prisma.chatTurn.count()).toBe(0);
    expect(await prisma.chatMessage.count()).toBe(0);
  });

  it('persists provider anchor results and versioned corrections against a saved diary', async () => {
    const diaryId = 'anchor-e2e-diary-1';
    const sourceBlockId = 'anchor-e2e-text-1';
    const requestId = 'anchor-e2e-request-1';
    await prisma.diary.create({
      data: {
        id: diaryId,
        ownerDeviceId: deviceA,
        draftId: 'anchor-e2e-draft-1',
        title: '海边散步',
        summary: '傍晚沿海边慢慢走。',
        location: '台南海港',
        date: new Date('2026-10-15T10:00:00.000Z'),
        privacy: 'private',
        photoIds: ['photo-1'],
        publicBlockIds: [],
        contentSnapshot: {
          type: 'travel',
          subtitle: '傍晚沿海边慢慢走。',
          helperMessage: '',
          characterId: 'character-blue',
          companionName: '自己',
          coverPhotoId: 'photo-1',
          posterPhotoIds: ['photo-1'],
          blocks: [
            { id: sourceBlockId, type: 'text', content: '沿着海港慢慢散步。' },
            { id: 'anchor-e2e-quote-1', type: 'quote', content: '把时间留给海风。' },
          ],
          people: [],
        },
        version: 1,
      },
    });

    const begin = await request(app.getHttpServer())
      .post('/api/anchors/extractions/begin')
      .set('x-device-id', deviceA)
      .send({ diaryId, diaryVersion: 1, requestId, attempt: 1 })
      .expect(201);
    expect(begin.body.data).toMatchObject({ diaryId, diaryVersion: 1, requestId, attempt: 1, status: 'pending' });

    const providerResult = {
      requestId,
      diaryId,
      diaryVersion: 1,
      source: 'provider',
      anchors: [{
        id: 'anchor-e2e-anchor-1',
        tagId: 'tag-seaside',
        sourceBlockId,
        excerpt: '沿着海港散步',
      }],
    };
    const completed = await request(app.getHttpServer())
      .post('/api/anchors/extractions/complete')
      .set('x-device-id', deviceA)
      .send({ attempt: 1, result: providerResult })
      .expect(201);
    expect(completed.body.data).toMatchObject({
      diaryId,
      requestId,
      status: 'succeeded',
      source: 'provider',
      anchors: [{ anchorId: 'anchor-e2e-anchor-1', sourceBlockId }],
    });

    await request(app.getHttpServer())
      .post('/api/anchors/extractions/complete')
      .set('x-device-id', deviceA)
      .send({ attempt: 1, result: providerResult })
      .expect(201);
    const anchors = await request(app.getHttpServer())
      .get('/api/anchors')
      .query({ tagId: 'tag-seaside', page: '1', pageSize: '10' })
      .set('x-device-id', deviceA)
      .expect(200);
    expect(anchors.body.data).toMatchObject({
      tagId: 'tag-seaside',
      total: 1,
      items: [{
        anchorId: 'anchor-e2e-anchor-1',
        sourceBlockId,
        diary: { id: diaryId, version: 1, title: '海边散步', coverPhotoId: 'photo-1' },
      }],
    });
    const otherDeviceAnchors = await request(app.getHttpServer())
      .get('/api/anchors')
      .query({ tagId: 'tag-seaside', page: '1', pageSize: '10' })
      .set('x-device-id', deviceB)
      .expect(200);
    expect(otherDeviceAnchors.body.data).toMatchObject({ total: 0, items: [] });

    const correctionInput = {
      diaryId,
      diaryVersion: 1,
      sourceBlockId,
      correction: '  海边散步让我放慢了脚步。  ',
      expectedVersion: 0,
      idempotencyKey: 'anchor-e2e-correction-command-1',
    };
    await request(app.getHttpServer())
      .put('/api/anchors/anchor-e2e-anchor-1/correction')
      .set('x-device-id', deviceA)
      .send(correctionInput)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          diaryId,
          diaryVersion: 1,
          anchorId: 'anchor-e2e-anchor-1',
          sourceBlockId,
          correction: '海边散步让我放慢了脚步。',
          version: 1,
        });
      });
    const correction = await request(app.getHttpServer())
      .get('/api/anchors/anchor-e2e-anchor-1/correction')
      .query({ diaryId, diaryVersion: '1' })
      .set('x-device-id', deviceA)
      .expect(200);
    expect(correction.body.data).toMatchObject({
      diaryId,
      diaryVersion: 1,
      anchorId: 'anchor-e2e-anchor-1',
      sourceBlockId,
      correction: '海边散步让我放慢了脚步。',
      version: 1,
    });
    await request(app.getHttpServer())
      .get('/api/anchors/anchor-e2e-anchor-1/correction')
      .query({ diaryId, diaryVersion: '1' })
      .set('x-device-id', deviceB)
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('permission_denied'));

    await store.reset();
    expect(await prisma.diaryAnchor.count()).toBe(0);
    expect(await prisma.diaryAnchorExtraction.count()).toBe(0);
    expect(await prisma.anchorCorrection.count()).toBe(0);
    expect(await prisma.anchorCorrectionCommand.count()).toBe(0);
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

    const created = await postGenerationJob({
      draftId: 'draft-remote-1',
      draftVersion: 2,
      idempotencyKey: 'draft-remote-1-round-2',
    }, deviceA);

    expect(created.body.data.jobId).toBeTruthy();

    const completed = await waitForGenerationCompletion(app.getHttpServer(), created.body.data.jobId, deviceA);
    expect(completed.body.data.draftId).toBe('draft-remote-1');
    expect(completed.body.data.idempotencyKey).toBe('draft-remote-1-round-2');
    expect(completed.body.data.status).toBe('succeeded');
    expect(completed.body.data.stage).toBe('completed');
    expect(completed.body.data.result.title).toContain('把旅程写成一页');
    expect(completed.body.data.result.coverPhotoId).toBe('photo-1');
    const textBlocks = completed.body.data.result.blocks.filter((block: { type: string }) => block.type === 'text');
    expect(textBlocks).toHaveLength(3);
    expect(textBlocks.map((block: { photoIds: string[] }) => block.photoIds)).toEqual([
      ['photo-1'],
      ['photo-2'],
      ['photo-3'],
    ]);
    expect(completed.body.data.result.blocks.some((block: { type: string }) => block.type === 'quote')).toBe(false);
  });

  it('reuses generation jobs only when an idempotency key matches the original draft and version', async () => {
    for (const id of ['draft-idempotency-a', 'draft-idempotency-b']) {
      await request(app.getHttpServer())
        .post('/api/drafts')
        .set('x-device-id', deviceA)
        .send({
          id,
          type: 'travel',
          characterId: 'character-blue',
          selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
          privacy: 'private',
          version: 1,
        })
        .expect(201);
    }

    const input = {
      draftId: 'draft-idempotency-a',
      draftVersion: 1,
      idempotencyKey: 'generation-idempotency-key',
    };
    const [first, concurrentRetry] = await Promise.all([
      postGenerationJob(input, deviceA),
      postGenerationJob(input, deviceA),
    ]);

    expect(first.status).toBe(201);
    expect(concurrentRetry.status).toBe(201);
    expect(concurrentRetry.body.data.jobId).toBe(first.body.data.jobId);

    const sameRequest = await postGenerationJob(input, deviceA);
    expect(sameRequest.body.data.jobId).toBe(first.body.data.jobId);

    for (const conflictingInput of [
      { ...input, draftId: 'draft-idempotency-b' },
      { ...input, draftVersion: 2 },
    ]) {
      const conflict = await postGenerationJob(conflictingInput, deviceA, undefined, 409);
      expect(conflict.body.error.code).toBe('version_conflict');
      expect(conflict.body.error.retryable).toBe(false);
    }
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
                    '      "photoIds": ["photo-8"]',
                    '    },',
                    '    {',
                    '      "id": "provider-block-2",',
                    '      "type": "text",',
                    '      "content": "沿着照片里的线索继续向前。",',
                    '      "photoIds": ["photo-9"]',
                    '    },',
                    '    {',
                    '      "id": "provider-block-3",',
                    '      "type": "text",',
                    '      "content": "最后一张照片为旅程收好尾声。",',
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

    const created = await postGenerationJob({
      draftId: 'draft-provider-content-array',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-content-array-round-1',
    }, deviceA);

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
        photoIds: ['photo-8'],
      },
      {
        id: 'provider-block-2',
        type: 'text',
        content: '沿着照片里的线索继续向前。',
        photoIds: ['photo-9'],
      },
      {
        id: 'provider-block-3',
        type: 'text',
        content: '最后一张照片为旅程收好尾声。',
        photoIds: ['photo-10'],
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
                        photoIds: ['photo-1'],
                      },
                      {
                        id: 'provider-block-2',
                        type: 'text',
                        content: '第二张照片延续着同一趟旅程。',
                        photoIds: ['photo-2'],
                      },
                      {
                        id: 'provider-block-3',
                        type: 'text',
                        content: '第三张照片为这段行程自然收尾。',
                        photoIds: ['photo-3'],
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

    const created = await postGenerationJob({
      draftId: 'draft-provider-retry',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-retry-round-1',
    }, deviceA);

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
                        photoIds: ['photo-1'],
                      },
                      {
                        id: 'provider-block-timeout-retry-2',
                        type: 'text',
                        content: '第二张照片延续着同一趟旅程。',
                        photoIds: ['photo-2'],
                      },
                      {
                        id: 'provider-block-timeout-retry-3',
                        type: 'text',
                        content: '第三张照片为这段行程自然收尾。',
                        photoIds: ['photo-3'],
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

    const created = await postGenerationJob({
      draftId: 'draft-provider-timeout-retry',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-timeout-retry-round-1',
    }, deviceA);

    const completed = await waitForGenerationCompletion(app.getHttpServer(), created.body.data.jobId, deviceA);
    expect(requestCount).toBe(2);
    expect(completed.body.data.status).toBe('succeeded');
    expect(completed.body.data.attemptCount).toBe(2);
    expect(completed.body.data.maxAttempts).toBe(2);
    expect(completed.body.data.errorCode).toBeUndefined();
    expect(completed.body.data.errorMessage).toBeUndefined();
  });

  it('retries retryable provider network failures once before succeeding on the same generation job', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_MAX_ATTEMPTS = '2';
    let requestCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: { code: 'ECONNRESET' },
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: '网络重试后的成功结果',
                  summary: '第一次连接抖动后，第二次尝试返回结构化结果。',
                  location: '台南',
                  date: '2026.10.13',
                  companionName: '自己',
                  coverPhotoId: 'photo-1',
                  posterPhotoIds: ['photo-1', 'photo-2'],
                  blocks: [
                    {
                      id: 'provider-block-network-retry',
                      type: 'text',
                      content: '连接恢复后，生成任务继续在同一 job 上成功完成。',
                        photoIds: ['photo-1'],
                      },
                      {
                        id: 'provider-block-network-retry-2',
                        type: 'text',
                        content: '第二张照片延续着同一趟旅程。',
                        photoIds: ['photo-2'],
                      },
                      {
                        id: 'provider-block-network-retry-3',
                        type: 'text',
                        content: '第三张照片为这段行程自然收尾。',
                        photoIds: ['photo-3'],
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
        id: 'draft-provider-network-retry',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-network-retry',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-network-retry-round-1',
    }, deviceA);

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

    const created = await postGenerationJob({
      draftId: 'draft-provider-malformed-success',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-malformed-success-round-1',
    }, deviceA);

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

  it('records duplicate provider person IDs as a non-retryable generation failure', async () => {
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
                title: '旅途中的同行者',
                summary: '人物候选具备不同照片关系。',
                location: '台南',
                date: '2026.10.13',
                companionName: '同行人',
                coverPhotoId: 'photo-8',
                posterPhotoIds: ['photo-8', 'photo-9'],
                blocks: [
                  {
                    id: 'provider-block-duplicate-person',
                    type: 'text',
                    content: '我们一起走过了海边。',
                    photoIds: ['photo-8'],
                  },
                  {
                    id: 'provider-block-duplicate-person-2',
                    type: 'text',
                    content: '第二张照片延续旅途。',
                    photoIds: ['photo-9'],
                  },
                  {
                    id: 'provider-block-duplicate-person-3',
                    type: 'text',
                    content: '第三张照片收住旅途。',
                    photoIds: ['photo-10'],
                  },
                ],
                people: [
                  { id: 'person-duplicate', name: '同行者甲', photoIds: ['photo-8'], avatarPhotoId: 'photo-8' },
                  { id: 'person-duplicate', name: '同行者乙', photoIds: ['photo-9'], avatarPhotoId: 'photo-9' },
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
        id: 'draft-provider-duplicate-person-ids',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-duplicate-person-ids',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-duplicate-person-ids-round-1',
    }, deviceA);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (response.body.data.status === 'failed') {
        expect(response.body.data.attemptCount).toBe(1);
        expect(response.body.data.maxAttempts).toBe(2);
        expect(response.body.data.errorCode).toBe('provider_failed');
        expect(response.body.data.errorMessage).toBe('provider people contain duplicate person IDs');
        expect(response.body.data.retryable).toBe(false);
        expect(response.body.data.result).toBeUndefined();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with duplicate provider person IDs did not fail in time');
  });

  it('rejects unselected text block photo references on the generation job', async () => {
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
                title: '引用范围错误',
                summary: '普通段落引用了未选择的照片。',
                location: '台南',
                date: '2026.10.13',
                companionName: '自己',
                coverPhotoId: 'photo-8',
                posterPhotoIds: ['photo-8'],
                blocks: [
                  {
                    id: 'provider-block-invalid-text-photo',
                    type: 'text',
                    content: '这段内容不应关联未选择的照片。',
                    photoIds: ['photo-999'],
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
        id: 'draft-provider-invalid-text-photo',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-invalid-text-photo',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-invalid-text-photo-round-1',
    }, deviceA);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(2);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe(
          'text block photoIds references a photo outside the selected set',
        );
        expect(failed.body.data.retryable).toBe(false);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with unselected text photo reference did not fail in time');
  });

  it('rejects unselected photo references in malformed people on the generation job', async () => {
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
                title: '人物引用范围错误',
                summary: '无效人物候选引用了未选择的照片。',
                location: '台南',
                date: '2026.10.13',
                companionName: '自己',
                coverPhotoId: 'photo-8',
                posterPhotoIds: ['photo-8'],
                blocks: [
                  {
                    id: 'provider-block-valid',
                    type: 'text',
                    content: '海风把散步的片段留在傍晚。',
                    photoIds: ['photo-8'],
                  },
                  {
                    id: 'provider-block-valid-2',
                    type: 'text',
                    content: '下一张照片继续着相同的行程。',
                    photoIds: ['photo-9'],
                  },
                  {
                    id: 'provider-block-valid-3',
                    type: 'text',
                    content: '最后一张照片为旅程收尾。',
                    photoIds: ['photo-10'],
                  },
                ],
                people: [{
                  name: '同行者',
                  photoIds: ['photo-999'],
                  avatarPhotoId: 'photo-8',
                }],
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
        id: 'draft-provider-invalid-malformed-person-photo',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-invalid-malformed-person-photo',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-invalid-malformed-person-photo-round-1',
    }, deviceA);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(2);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe(
          'person photoIds references a photo outside the selected set',
        );
        expect(failed.body.data.retryable).toBe(false);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with malformed person photo reference did not fail in time');
  });

  it('rejects malformed generation block entries on the generation job', async () => {
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
                title: '结构错误的结果',
                summary: '正文数组包含无效元素。',
                location: '台南',
                date: '2026.10.13',
                companionName: '自己',
                coverPhotoId: 'photo-8',
                posterPhotoIds: ['photo-8'],
                blocks: [
                  null,
                  {
                    id: 'provider-block-valid',
                    type: 'text',
                    content: '有效段落不能掩盖同一结果中的结构错误。',
                    photoIds: ['photo-8'],
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
        id: 'draft-provider-invalid-block-entry',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-invalid-block-entry',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-invalid-block-entry-round-1',
    }, deviceA);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(2);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe('provider blocks contain invalid entries');
        expect(failed.body.data.retryable).toBe(false);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with malformed block entries did not fail in time');
  });

  it('rejects provider results missing required diary fields on the generation job', async () => {
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
                summary: '返回了摘要，但缺少必需的标题字段。',
                location: '台南',
                date: '2026.10.13',
                companionName: '自己',
                coverPhotoId: 'photo-8',
                posterPhotoIds: ['photo-8'],
                blocks: [{
                  id: 'provider-block-valid',
                  type: 'text',
                  content: '有效正文不能替代缺失的日记字段。',
                  photoIds: ['photo-8'],
                }],
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
        id: 'draft-provider-missing-title',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-missing-title',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-missing-title-round-1',
    }, deviceA);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(2);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe('provider result is missing title');
        expect(failed.body.data.retryable).toBe(false);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with missing required provider title did not fail in time');
  });

  it('rejects empty generated block content on the generation job', async () => {
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
                title: '正文缺失的结果',
                summary: '标题等字段齐全，但正文只有空白。',
                location: '台南',
                date: '2026.10.13',
                companionName: '自己',
                coverPhotoId: 'photo-8',
                posterPhotoIds: ['photo-8'],
                blocks: [{
                  id: 'provider-block-empty-content',
                  type: 'text',
                  content: '   ',
                  photoIds: ['photo-8'],
                }],
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
        id: 'draft-provider-empty-block-content',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-8', 'photo-9', 'photo-10'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-empty-block-content',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-empty-block-content-round-1',
    }, deviceA);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(2);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe('text block content is missing');
        expect(failed.body.data.retryable).toBe(false);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with empty block content did not fail in time');
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

    const created = await postGenerationJob({
      draftId: 'draft-provider-timeout-failed',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-timeout-failed-round-1',
    }, deviceA);

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

  it('records retryable provider network failure details on the generation job when the request cannot connect', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_PROVIDER_BASE_URL = 'https://api.openai.com/v1';
    process.env.AI_PROVIDER_MODEL = 'gpt-test';
    process.env.AI_PROVIDER_API_KEY = 'test-key';
    process.env.AI_PROVIDER_MAX_ATTEMPTS = '1';
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      }),
    ) as unknown as typeof fetch;

    await request(app.getHttpServer())
      .post('/api/drafts')
      .set('x-device-id', deviceA)
      .send({
        id: 'draft-provider-network-failed',
        type: 'travel',
        characterId: 'character-blue',
        selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
        privacy: 'private',
        version: 1,
      })
      .expect(201);

    const created = await postGenerationJob({
      draftId: 'draft-provider-network-failed',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-network-failed-round-1',
    }, deviceA);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const failed = await request(app.getHttpServer())
        .get(`/api/generation/jobs/${created.body.data.jobId}`)
        .set('x-device-id', deviceA)
        .expect(200);
      if (failed.body.data.status === 'failed') {
        expect(failed.body.data.attemptCount).toBe(1);
        expect(failed.body.data.maxAttempts).toBe(1);
        expect(failed.body.data.errorCode).toBe('provider_failed');
        expect(failed.body.data.errorMessage).toBe('AI provider network request failed (ECONNREFUSED)');
        expect(failed.body.data.retryable).toBe(true);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error('generation job with provider network failure did not fail in time');
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

    const created = await postGenerationJob({
      draftId: 'draft-provider-failed',
      draftVersion: 1,
      idempotencyKey: 'draft-provider-failed-round-1',
    }, deviceA);

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
    const missingDraft = await postGenerationJob({
      draftId: 'draft-missing',
      draftVersion: 1,
      idempotencyKey: 'draft-missing-round-1',
    }, deviceA, undefined, 404);
    expect(missingDraft.body.error.code).toBe('not_found');
    expect(missingDraft.body.error.message).toBe('draft not found');
    expect(missingDraft.body.error.retryable).toBe(false);
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

    const created = await postGenerationJob({
      draftId: 'draft-restart-1',
      draftVersion: 3,
      idempotencyKey: 'draft-restart-1-round-3',
    }, deviceA);

    const restartedModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const restartedApp = restartedModuleRef.createNestApplication({ bodyParser: false });
    configureApiBodyParser(restartedApp);
    restartedApp.setGlobalPrefix('api');
    await restartedApp.init();

    try {
      const completed = await waitForGenerationCompletion(restartedApp.getHttpServer(), created.body.data.jobId, deviceA);
      expect(completed.body.data.jobId).toBe(created.body.data.jobId);
      expect(completed.body.data.status).toBe('succeeded');
      expect(completed.body.data.stage).toBe('completed');
      expect(completed.body.data.result.coverPhotoId).toBe('photo-4');
      expect(completed.body.data.result.blocks.length).toBeGreaterThan(0);

      await postGenerationJob({
        draftId: 'draft-restart-1',
        draftVersion: 3,
        idempotencyKey: 'draft-restart-1-round-3',
      }, deviceA, restartedApp.getHttpServer());
    } finally {
      await restartedApp.close();
    }
  });

  it('supports generation job cancellation and aborts the active provider request', async () => {
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

    const created = await postGenerationJob({
      draftId: 'draft-remote-2',
      draftVersion: 1,
      idempotencyKey: 'draft-remote-2-round-1',
    }, deviceA);

    await providerStarted;
    await request(app.getHttpServer())
      .post(`/api/generation/jobs/${created.body.data.jobId}/cancel`)
      .set('x-device-id', deviceA)
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.status).toBe('cancelled');
        expect(body.data.stage).toBe('cancelled');
      });
    expect(providerSignal?.aborted).toBe(true);

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

    const generation = await postGenerationJob({
      draftId: draft.body.data.id,
      draftVersion: 1,
      idempotencyKey: 'shared-round-1',
    }, deviceA);

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
        contentSnapshot: createDiaryContentSnapshot('仅设备 A 可见', ['photo-1', 'photo-2', 'photo-3']),
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
        contentSnapshot: createDiaryContentSnapshot('不应成功', ['photo-1', 'photo-2', 'photo-3']),
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
      contentSnapshot: createDiaryContentSnapshot('设备 A 的日记', ['photo-1', 'photo-2', 'photo-3']),
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
      contentSnapshot: createDiaryContentSnapshot('设备 B 的日记', ['photo-4', 'photo-5', 'photo-6']),
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
