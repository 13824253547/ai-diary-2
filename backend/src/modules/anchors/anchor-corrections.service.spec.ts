import { PrismaService } from '../../common/prisma.service';
import {
  AnchorCorrectionError,
  AnchorCorrectionsService,
  type SaveAnchorCorrectionInput,
} from './anchor-corrections.service';

function createHarness() {
  const diary = {
    id: 'diary-1',
    ownerDeviceId: 'device-1',
    version: 3,
    contentSnapshot: {
      blocks: [
        { id: 'block-text', type: 'text', content: 'Source text' },
        { id: 'block-photo', type: 'photo', photoId: 'photo-1' },
      ],
    },
  };
  const corrections = new Map<string, Record<string, any>>();
  const commands = new Map<string, Record<string, any>>();
  const anchors = [{
    ownerDeviceId: 'device-1',
    diaryId: 'diary-1',
    diaryVersion: 3,
    anchorId: 'anchor-1',
    sourceBlockId: 'block-text',
    source: 'provider',
  }];
  let nextId = 1;

  const findCorrection = (where: Record<string, any>) => {
    if (where.id) {
      return [...corrections.values()].find(record => record.id === where.id) ?? null;
    }
    const key = where.ownerDeviceId_diaryId_anchorId_sourceDiaryVersion;
    return corrections.get([
      key.ownerDeviceId,
      key.diaryId,
      key.anchorId,
      key.sourceDiaryVersion,
    ].join(':')) ?? null;
  };
  const correctionKey = (record: Record<string, any>) => [
    record.ownerDeviceId,
    record.diaryId,
    record.anchorId,
    record.sourceDiaryVersion,
  ].join(':');
  const findCommand = (where: Record<string, any>) => {
    const key = where.ownerDeviceId_idempotencyKey;
    return commands.get(`${key.ownerDeviceId}:${key.idempotencyKey}`) ?? null;
  };

  const transaction = {
    $queryRaw: jest.fn(async () => [{ id: diary.id }]),
    diary: {
      findUnique: jest.fn(async () => diary),
    },
    diaryAnchor: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, any> }) =>
        anchors.find(anchor =>
          anchor.ownerDeviceId === where.ownerDeviceId
          && anchor.diaryId === where.diaryId
          && anchor.diaryVersion === where.diaryVersion
          && anchor.anchorId === where.anchorId
          && (where.sourceBlockId === undefined || anchor.sourceBlockId === where.sourceBlockId)
          && anchor.source === where.source,
        ) ?? null,
      ),
    },
    anchorCorrection: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, any> }) => findCorrection(where)),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: Record<string, any> }) => {
        const record = findCorrection(where);
        if (!record) throw new Error('record not found');
        return record;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const record = {
          id: `correction-${nextId++}`,
          ...data,
          createdAt: new Date('2026-10-16T00:00:00.000Z'),
          updatedAt: new Date('2026-10-16T00:00:00.000Z'),
        };
        corrections.set(correctionKey(record), record);
        return record;
      }),
      updateMany: jest.fn(async ({ where, data }: {
        where: { id: string; version: number };
        data: { correction: string; version: number };
      }) => {
        const record = [...corrections.values()].find(item =>
          item.id === where.id && item.version === where.version,
        );
        if (!record) return { count: 0 };
        Object.assign(record, data, { updatedAt: new Date('2026-10-16T00:01:00.000Z') });
        return { count: 1 };
      }),
    },
    anchorCorrectionCommand: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, any> }) => findCommand(where)),
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const command = { id: `command-${nextId++}`, ...data };
        commands.set(`${data.ownerDeviceId}:${data.idempotencyKey}`, command);
        return command;
      }),
    },
  };
  const prisma = {
    ...transaction,
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;

  return {
    diary,
    corrections,
    commands,
    anchors,
    transaction,
    prisma,
    service: new AnchorCorrectionsService(prisma),
  };
}

const saveInput: SaveAnchorCorrectionInput = {
  diaryId: 'diary-1',
  diaryVersion: 3,
  anchorId: 'anchor-1',
  sourceBlockId: 'block-text',
  correction: '  More accurate meaning  ',
  expectedVersion: 0,
  idempotencyKey: 'command-1',
};

describe('AnchorCorrectionsService', () => {
  test.each([null, [], {}])('rejects malformed correction inputs before database access (%j)', async input => {
    const harness = createHarness();

    await expect(harness.service.getCorrection(input, 'device-1'))
      .rejects.toMatchObject({ code: 'invalid_input' });
    await expect(harness.service.saveCorrection(input, 'device-1'))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  test('stores trimmed correction against the owned source version and replays idempotently', async () => {
    const harness = createHarness();

    const first = await harness.service.saveCorrection(saveInput, 'device-1');
    const replay = await harness.service.saveCorrection(saveInput, 'device-1');
    const keyReuse = harness.service.saveCorrection({
      ...saveInput,
      correction: 'A different value',
    }, 'device-1');

    expect(first).toMatchObject({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor-1',
      sourceBlockId: 'block-text',
      correction: 'More accurate meaning',
      version: 1,
      source: 'user',
    });
    expect(replay).toEqual(first);
    await expect(keyReuse).rejects.toMatchObject({ code: 'invalid_input' });
    expect(harness.corrections.size).toBe(1);
    expect(harness.commands.size).toBe(1);
    expect(harness.diary.version).toBe(3);
    expect(harness.diary.contentSnapshot.blocks[0]).toMatchObject({
      id: 'block-text',
      content: 'Source text',
    });
  });

  test('does not report a superseding correction as the replay result of an older command', async () => {
    const harness = createHarness();
    const first = await harness.service.saveCorrection(saveInput, 'device-1');
    const second = await harness.service.saveCorrection({
      ...saveInput,
      correction: 'A newer understanding',
      expectedVersion: 1,
      idempotencyKey: 'command-2',
    }, 'device-1');

    expect(first).toMatchObject({ correction: 'More accurate meaning', version: 1 });
    expect(second).toMatchObject({ correction: 'A newer understanding', version: 2 });
    await expect(harness.service.saveCorrection(saveInput, 'device-1'))
      .rejects.toMatchObject({ code: 'version_conflict' });
    expect([...harness.corrections.values()][0]).toMatchObject({
      correction: 'A newer understanding',
      version: 2,
    });
    expect(harness.commands.size).toBe(2);
  });

  test('rejects blank text, stale diary versions, and photo source blocks', async () => {
    const harness = createHarness();

    await expect(harness.service.saveCorrection({
      ...saveInput,
      correction: ' \n ',
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });

    await expect(harness.service.saveCorrection({
      ...saveInput,
      diaryVersion: 2,
    }, 'device-1')).rejects.toMatchObject({ code: 'version_conflict' });

    await expect(harness.service.saveCorrection({
      ...saveInput,
      sourceBlockId: 'block-photo',
    }, 'device-1')).rejects.toMatchObject({ code: 'not_found' });

    expect(harness.corrections.size).toBe(0);
  });

  test('rejects corrections for anchor IDs absent from the persisted extraction', async () => {
    const harness = createHarness();

    await expect(harness.service.saveCorrection({
      ...saveInput,
      anchorId: 'unpersisted-anchor',
    }, 'device-1')).rejects.toMatchObject({ code: 'not_found' });

    expect(harness.corrections.size).toBe(0);
    expect(harness.commands.size).toBe(0);
  });

  test('rejects diary correction text longer than the confirmed 240 characters', async () => {
    const harness = createHarness();

    await expect(harness.service.saveCorrection({
      ...saveInput,
      correction: '字'.repeat(241),
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  test('rejects another device and stale correction versions without overwriting', async () => {
    const harness = createHarness();
    await harness.service.saveCorrection(saveInput, 'device-1');

    await expect(harness.service.saveCorrection({
      ...saveInput,
      correction: 'New value',
      expectedVersion: 0,
      idempotencyKey: 'command-2',
    }, 'device-1')).rejects.toMatchObject({ code: 'version_conflict' });

    await expect(harness.service.getCorrection({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor-1',
    }, 'device-2')).rejects.toMatchObject({ code: 'permission_denied' });

    expect([...harness.corrections.values()][0].correction).toBe('More accurate meaning');
  });
});
