import { PrismaService } from '../../common/prisma.service';
import {
  AnchorReadModelError,
  AnchorReadModelService,
} from './anchor-read-model.service';

function createHarness() {
  const diary: Record<string, any> = {
    id: 'diary-1',
    ownerDeviceId: 'device-1',
    version: 3,
    title: 'A saved diary',
    date: new Date('2026-10-16T00:00:00.000Z'),
    contentSnapshot: {
      coverPhotoId: 'photo-1',
      blocks: [
        { id: 'block-1', type: 'text', content: 'Saved paragraph.' },
        { id: 'block-photo', type: 'photo', photoId: 'photo-1' },
      ],
    },
  };
  const runs = new Map<string, Record<string, any>>();
  const anchors = new Map<string, Record<string, any>>();
  let nextId = 1;
  const runKey = (ownerDeviceId: string, diaryId: string, diaryVersion: number) =>
    `${ownerDeviceId}:${diaryId}:${diaryVersion}`;

  const transaction = {
    $queryRaw: jest.fn(async (query: { sql?: string }) => {
      if (query.sql?.includes('FOR UPDATE')) return [{ id: diary.id }];
      if (query.sql?.includes('COUNT(*)')) return [{ total: 1n }];
      return [{
        id: 'anchor-row-1',
        anchorId: 'stable-anchor-1',
        tagId: 'tag-stable',
        sourceBlockId: 'block-1',
        excerpt: 'A source-grounded excerpt.',
        source: 'provider',
        diaryId: diary.id,
        diaryVersion: diary.version,
        title: diary.title,
        diaryDate: diary.date,
        coverPhotoId: 'photo-1',
      }];
    }),
    diary: {
      findUnique: jest.fn(async () => diary),
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.includes(diary.id) ? [diary] : [],
      ),
    },
    diaryAnchorExtraction: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, any> }) => {
        if (where.id) return [...runs.values()].find(run => run.id === where.id) ?? null;
        if (where.ownerDeviceId_diaryId_diaryVersion) {
          const key = where.ownerDeviceId_diaryId_diaryVersion;
          return runs.get(runKey(key.ownerDeviceId, key.diaryId, key.diaryVersion)) ?? null;
        }
        if (where.ownerDeviceId_requestId) {
          const key = where.ownerDeviceId_requestId;
          return [...runs.values()].find(run =>
            run.ownerDeviceId === key.ownerDeviceId && run.requestId === key.requestId,
          ) ?? null;
        }
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const run = {
          id: `run-${nextId++}`,
          resultHash: null,
          failureCode: null,
          source: null,
          anchors: [],
          createdAt: new Date('2026-10-16T00:00:00.000Z'),
          updatedAt: new Date('2026-10-16T00:00:00.000Z'),
          ...data,
        };
        runs.set(runKey(data.ownerDeviceId, data.diaryId, data.diaryVersion), run);
        return run;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const run = [...runs.values()].find(item => item.id === where.id);
        if (!run) throw new Error('run not found');
        Object.assign(run, data, { updatedAt: new Date('2026-10-16T00:01:00.000Z') });
        return run;
      }),
    },
    diaryAnchor: {
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const anchor = {
          id: `anchor-row-${nextId++}`,
          createdAt: new Date('2026-10-16T00:01:00.000Z'),
          ...data,
        };
        anchors.set(anchor.id, anchor);
        const run = [...runs.values()].find(item => item.id === data.extractionId);
        run?.anchors.push(anchor);
        return anchor;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, any> }) =>
        [...anchors.values()]
          .filter(anchor =>
            anchor.ownerDeviceId === where.ownerDeviceId
            && anchor.tagId === where.tagId
            && anchor.source === where.source,
          )
          .map(anchor => ({
            ...anchor,
            diary,
            extraction: { status: 'succeeded', source: 'provider' },
          })),
      ),
    },
  };
  const prisma = {
    ...transaction,
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
  } as unknown as PrismaService;

  return {
    diary,
    runs,
    anchors,
    prisma,
    service: new AnchorReadModelService(prisma),
  };
}

const beginInput = {
  diaryId: 'diary-1',
  diaryVersion: 3,
  requestId: 'request-1',
  attempt: 1,
};

const providerResult = {
  requestId: 'request-1',
  diaryId: 'diary-1',
  diaryVersion: 3,
  source: 'provider' as const,
  anchors: [{
    id: 'stable-anchor-1',
    tagId: 'tag-stable',
    sourceBlockId: 'block-1',
    excerpt: 'A source-grounded excerpt.',
  }],
};

describe('AnchorReadModelService', () => {
  test.each([
    null,
    [],
    { tagId: 'tag-stable', page: '1', pageSize: 20 },
    { tagId: ['tag-a', 'tag-b'], page: 1, pageSize: 20 },
    { tagId: 'tag-stable', page: 1, pageSize: 15 },
  ])('rejects malformed list query before database access (%j)', async input => {
    const harness = createHarness();

    await expect(harness.service.listByTag(input, 'device-1'))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  test('persists provider results idempotently and filters by explicit tag/current source version', async () => {
    const harness = createHarness();
    await harness.service.beginExtraction(beginInput, 'device-1');

    const completed = await harness.service.completeExtraction({
      attempt: 1,
      result: providerResult,
    }, 'device-1');
    const replay = await harness.service.completeExtraction({
      attempt: 1,
      result: providerResult,
    }, 'device-1');
    const page = await harness.service.listByTag({
      tagId: 'tag-stable',
      page: 1,
      pageSize: 20,
    }, 'device-1');

    expect(completed).toMatchObject({ status: 'succeeded', source: 'provider' });
    expect(replay.anchors).toEqual(completed.anchors);
    expect(harness.anchors.size).toBe(1);
    expect(page.items[0]).toMatchObject({
      anchorId: 'stable-anchor-1',
      tagId: 'tag-stable',
      sourceBlockId: 'block-1',
      diary: { id: 'diary-1', version: 3, coverPhotoId: 'photo-1' },
    });
  });

  test('rejects mock persistence, foreign source blocks, and stale source versions', async () => {
    const harness = createHarness();
    await harness.service.beginExtraction(beginInput, 'device-1');

    await expect(harness.service.completeExtraction({
      attempt: 1,
      result: { ...providerResult, source: 'mock' },
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(harness.service.completeExtraction({
      attempt: 1,
      result: {
        ...providerResult,
        anchors: [{ ...providerResult.anchors[0], sourceBlockId: 'block-photo' }],
      },
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });

    harness.diary.version = 4;
    await expect(harness.service.completeExtraction({
      attempt: 1,
      result: providerResult,
    }, 'device-1')).rejects.toMatchObject({ code: 'version_conflict' });
    expect(harness.anchors.size).toBe(0);
  });

  test('keeps extraction failures isolated and only retries the explicit next attempt', async () => {
    const harness = createHarness();
    await harness.service.beginExtraction(beginInput, 'device-1');
    const failed = await harness.service.failExtraction({
      ...beginInput,
      failureCode: 'timeout',
    }, 'device-1');

    expect(failed).toMatchObject({ status: 'failed', failureCode: 'timeout', attempt: 1 });
    const retried = await harness.service.beginExtraction({
      ...beginInput,
      attempt: 2,
    }, 'device-1');
    expect(retried).toMatchObject({ status: 'pending', attempt: 2 });
    await expect(harness.service.completeExtraction({
      attempt: 1,
      result: providerResult,
    }, 'device-1')).rejects.toBeInstanceOf(AnchorReadModelError);
    expect(harness.anchors.size).toBe(0);
  });
});
