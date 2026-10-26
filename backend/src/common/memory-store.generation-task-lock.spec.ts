import {
  DiaryGenerationService,
  type GenerationProgressReporter,
  type GenerationResultRecord,
} from './diary-generation.service';
import { GenerationJobError, MemoryStoreService, RewriteDraftError } from './memory-store.service';
import type { PrismaService } from './prisma.service';
import type { TemporaryGenerationPhotoStore } from './temporary-generation-photo-store';

function buildDraftRow() {
  return {
    id: 'draft-1',
    ownerDeviceId: 'device-1',
    sourceDiaryId: null,
    type: 'travel',
    characterId: 'character-blue',
    selectedPhotoIds: [],
    privacy: 'private',
    version: 1,
  };
}

function rewriteInput(blockId: string, content = '海风吹过时，旅程慢了下来。') {
  return {
    draftId: 'draft-1',
    blockId,
    draftVersion: 1,
    characterId: 'character-blue',
    blockType: 'text' as const,
    content,
    selectedPhotoIds: [],
    photoIds: [],
  };
}

describe('MemoryStoreService diary generation task guard', () => {
  test('allows only one rewrite task per device and releases the device after completion', async () => {
    const draftRow = {
      ...buildDraftRow(),
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
    };
    const prisma = {
      draft: { findUnique: jest.fn().mockResolvedValue(draftRow) },
      generationJob: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const photoStore = {
      stage: jest.fn().mockResolvedValue(undefined),
      readUploadedPhotos: jest.fn().mockResolvedValue([]),
    } as unknown as TemporaryGenerationPhotoStore;
    let completeFirst: ((value: {
      draftId: string;
      blockId: string;
      draftVersion: number;
      blockType: 'text';
      content: string;
      photoIds: string[];
    }) => void) | undefined;
    const rewriteBlock = jest.fn()
      .mockImplementationOnce(() => new Promise(resolve => {
        completeFirst = resolve;
      }))
      .mockImplementation(async (input: { draftId: string; blockId: string; draftVersion: number; blockType: 'text'; photoIds: string[] }) => ({
        ...input,
        content: '新的日记段落。',
      }));
    const generation = { rewriteBlock } as unknown as DiaryGenerationService;
    const store = new MemoryStoreService(prisma, generation, photoStore);

    const activeRewrite = store.rewriteDraftBlock(rewriteInput('block-1'), 'device-1');
    await Promise.resolve();
    await Promise.resolve();

    await expect(store.rewriteDraftBlock(rewriteInput('block-2'), 'device-1')).rejects.toMatchObject({
      code: 'version_conflict',
      message: '当前设备已有一项日记生成或重写任务正在执行，请等待完成后重试。',
    });
    await expect(store.createGenerationJob({
      draftId: 'draft-1',
      draftVersion: 1,
      idempotencyKey: 'blocked-generation',
    }, 'device-1')).rejects.toMatchObject({
      code: 'version_conflict',
      message: '当前设备已有一项日记生成或重写任务正在执行，请等待完成后重试。',
    } satisfies Partial<GenerationJobError>);
    expect(photoStore.stage).not.toHaveBeenCalled();
    expect(rewriteBlock).toHaveBeenCalledTimes(1);

    completeFirst?.({
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      blockType: 'text',
      content: '重写完成。',
      photoIds: [],
    });
    await expect(activeRewrite).resolves.toMatchObject({ content: '重写完成。' });
    await expect(store.rewriteDraftBlock(rewriteInput('block-2'), 'device-1')).resolves.toMatchObject({
      blockId: 'block-2',
      content: '新的日记段落。',
    });
    expect(rewriteBlock).toHaveBeenCalledTimes(2);
  });

  test('blocks out-of-scope rewrite requests before loading photos or invoking the model', async () => {
    const prisma = {
      draft: { findUnique: jest.fn().mockResolvedValue(buildDraftRow()) },
    } as unknown as PrismaService;
    const photoStore = {
      readUploadedPhotos: jest.fn(),
    } as unknown as TemporaryGenerationPhotoStore;
    const rewriteBlock = jest.fn();
    const generation = { rewriteBlock } as unknown as DiaryGenerationService;
    const store = new MemoryStoreService(prisma, generation, photoStore);

    await expect(store.rewriteDraftBlock(
      rewriteInput('block-1', '请帮我写一个 Python 脚本。'),
      'device-1',
    )).rejects.toMatchObject({
      code: 'invalid_input',
      message: '此功能仅用于整理日记和已选照片，不支持代码、小说或商业推广内容。',
    } satisfies Partial<RewriteDraftError>);
    expect(photoStore.readUploadedPhotos).not.toHaveBeenCalled();
    expect(rewriteBlock).not.toHaveBeenCalled();
  });

  test('prevents a rewrite from running while a full diary generation is active on the same device', async () => {
    const draftRow = {
      ...buildDraftRow(),
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
    };
    let jobRow: Record<string, any> | undefined;
    const prisma = {
      draft: { findUnique: jest.fn().mockResolvedValue(draftRow) },
      generationJob: {
        findUnique: jest.fn(async ({ where }: { where: Record<string, any> }) => {
          if (where.ownerDeviceId_idempotencyKey) {
            return jobRow?.idempotencyKey === where.ownerDeviceId_idempotencyKey.idempotencyKey ? jobRow : null;
          }
          return jobRow?.jobId === where.jobId ? jobRow : null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
          jobRow = {
            jobId: 'job-1',
            ownerDeviceId: 'device-1',
            createdAt: new Date('2026-10-20T00:00:00.000Z'),
            ...data,
          };
          return jobRow;
        }),
        update: jest.fn(async ({ data }: { data: Record<string, any> }) => {
          jobRow = { ...jobRow, ...data };
          return jobRow;
        }),
      },
    } as unknown as PrismaService;
    const photoStore = {
      stage: jest.fn().mockResolvedValue(undefined),
      readForGeneration: jest.fn().mockResolvedValue([
        { photoId: 'photo-1', mimeType: 'image/jpeg', base64: 'a' },
        { photoId: 'photo-2', mimeType: 'image/jpeg', base64: 'b' },
        { photoId: 'photo-3', mimeType: 'image/jpeg', base64: 'c' },
      ]),
      readUploadedPhotos: jest.fn().mockResolvedValue([]),
      cleanupGeneration: jest.fn().mockResolvedValue(undefined),
    } as unknown as TemporaryGenerationPhotoStore;
    let completeGeneration: ((value: GenerationResultRecord) => void) | undefined;
    let reportGenerationProgress: GenerationProgressReporter | undefined;
    let notifyGenerationStarted: (() => void) | undefined;
    const generationStarted = new Promise<void>(resolve => {
      notifyGenerationStarted = resolve;
    });
    const generation = {
      generate: jest.fn(async (_input: unknown, options?: { onProgress?: GenerationProgressReporter }) => {
        reportGenerationProgress = options?.onProgress;
        await reportGenerationProgress?.('provider-submitted');
        notifyGenerationStarted?.();
        return new Promise(resolve => {
          completeGeneration = resolve;
        });
      }),
      rewriteBlock: jest.fn().mockResolvedValue({
        draftId: 'draft-1',
        blockId: 'block-2',
        draftVersion: 1,
        blockType: 'text',
        content: '替换段落',
        photoIds: [],
      }),
    } as unknown as DiaryGenerationService;
    const store = new MemoryStoreService(prisma, generation, photoStore);

    await store.createGenerationJob({
      draftId: 'draft-1',
      draftVersion: 1,
      idempotencyKey: 'generation-1',
    }, 'device-1', [
      { photoId: 'photo-1', mimeType: 'image/jpeg', buffer: Buffer.from('1') },
      { photoId: 'photo-2', mimeType: 'image/jpeg', buffer: Buffer.from('2') },
      { photoId: 'photo-3', mimeType: 'image/jpeg', buffer: Buffer.from('3') },
    ]);

    await generationStarted;
    expect(generation.generate).toHaveBeenCalledTimes(1);
    expect(jobRow).toMatchObject({
      status: 'running',
      stage: 'drafting',
      progressPercent: 25,
    });
    expect(prisma.generationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        stage: 'analyzing-photos',
        progressPercent: 0,
      }),
    }));
    expect(prisma.generationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        stage: 'drafting',
        progressPercent: 25,
      }),
    }));
    await expect(store.rewriteDraftBlock(rewriteInput('block-2'), 'device-1')).rejects.toMatchObject({
      code: 'version_conflict',
    });
    expect(generation.rewriteBlock).not.toHaveBeenCalled();

    await reportGenerationProgress?.('provider-response-received');
    await reportGenerationProgress?.('result-validated');
    completeGeneration?.({
      title: '旅行日记',
      summary: '照片里的旅行片段。',
      location: '未知地点',
      date: '2026.10.20',
      companionName: '自己',
      coverPhotoId: 'photo-1',
      posterPhotoIds: ['photo-1'],
      blocks: [],
    });
    const activeJob = (store as unknown as {
      processingGenerationJobs: Map<string, { promise: Promise<void> }>;
    }).processingGenerationJobs.get('job-1');
    await activeJob?.promise;
    expect(jobRow).toMatchObject({ status: 'succeeded', stage: 'completed', progressPercent: 100 });
    expect((jobRow?.progressMilestones as Array<{ milestoneId: string }>).map(item => item.milestoneId)).toEqual([
      'queued',
      'photo-processing-started',
      'photos-ready',
      'provider-submitted',
      'provider-response-received',
      'result-validated',
      'completed',
    ]);

    await expect(store.rewriteDraftBlock(rewriteInput('block-2'), 'device-1')).resolves.toMatchObject({
      content: '替换段落',
    });
    expect(generation.rewriteBlock).toHaveBeenCalledTimes(1);
  });
});
