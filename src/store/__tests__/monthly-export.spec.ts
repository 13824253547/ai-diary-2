import { createTestStore } from '../../test-utils/create-test-store';
import { MonthlyExportAbortedError, type MonthlyExportResult, type MonthlyExportSnapshot } from '../../services/monthly-export';
import type { DiaryItem } from '../../types/diary';

function buildDiary(overrides: Partial<DiaryItem>): DiaryItem {
  return {
    id: overrides.id ?? 'diary-test',
    type: overrides.type ?? 'travel',
    status: 'ready',
    title: overrides.title ?? '测试回忆',
    subtitle: overrides.subtitle ?? '测试副标题',
    location: overrides.location ?? '厦门',
    date: overrides.date ?? '2026.01.10',
    summary: overrides.summary ?? '测试摘要',
    helperMessage: overrides.helperMessage ?? '测试提示',
    characterId: overrides.characterId ?? 'character-blue',
    companionName: overrides.companionName ?? '自己',
    privacy: overrides.privacy ?? 'private',
    photoIds: overrides.photoIds ?? ['photo-1', 'photo-2', 'photo-3'],
    coverPhotoId: overrides.coverPhotoId ?? 'photo-1',
    blocks: overrides.blocks ?? [
      {
        id: 'block-1',
        type: 'text',
        title: '测试段落',
        content: '测试内容',
        photoIds: ['photo-1'],
      },
    ],
    exportedImage: overrides.exportedImage ?? false,
    exportedPdf: overrides.exportedPdf ?? false,
    shareModes: overrides.shareModes ?? [],
    exportModes: overrides.exportModes ?? [],
    version: overrides.version ?? 1,
    createdInSession: overrides.createdInSession,
    people: overrides.people,
    posterPhotoIds: overrides.posterPhotoIds,
    publicBlockIds: overrides.publicBlockIds,
    anonymous: overrides.anonymous,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createAbortableExport(deferred: ReturnType<typeof createDeferred<MonthlyExportResult>>) {
  return (_snapshot: MonthlyExportSnapshot, options?: { signal?: AbortSignal }) => new Promise<MonthlyExportResult>((resolve, reject) => {
    const handleAbort = () => reject(new MonthlyExportAbortedError());
    if (options?.signal?.aborted) {
      handleAbort();
      return;
    }
    options?.signal?.addEventListener('abort', handleAbort, { once: true });
    deferred.promise.then(
      value => {
        options?.signal?.removeEventListener('abort', handleAbort);
        resolve(value);
      },
      error => {
        options?.signal?.removeEventListener('abort', handleAbort);
        reject(error);
      },
    );
  });
}

describe('monthly export store flow', () => {
  test('marks the export as failed without mutating diaries when the exporter throws', async () => {
    const diaries = [
      buildDiary({ id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10', version: 3 }),
      buildDiary({ id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11', version: 4 }),
    ];
    const monthlyExporter = jest.fn().mockRejectedValue(new Error('disk full'));
    const { store } = createTestStore({ diaries, monthlyExporter });

    const before = store.getState().diaries.map(diary => ({ id: diary.id, title: diary.title, version: diary.version }));
    const result = await store.getState().startMonthlyExport('history-2026-01');

    expect(result).toEqual({
      ok: false,
      requestId: 1,
      reason: 'failed',
      message: '月度导出失败，请稍后重试。',
    });
    expect(store.getState().monthlyExport).toMatchObject({
      requestId: 1,
      status: 'failed',
      groupId: 'history-2026-01',
      monthLabel: '2026年1月',
      error: '月度导出失败，请稍后重试。',
    });
    expect(store.getState().diaries.map(diary => ({ id: diary.id, title: diary.title, version: diary.version }))).toEqual(before);
    expect(monthlyExporter).toHaveBeenCalledWith(
      {
        groupId: 'history-2026-01',
        monthLabel: '2026年1月',
        diaryIds: ['diary-jan-2', 'diary-jan-1'],
        diaries: [
          { id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11', version: 4 },
          { id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10', version: 3 },
        ],
      },
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });

  test('keeps the export cancelled after aborting and ignores the late completion', async () => {
    const deferred = createDeferred<MonthlyExportResult>();
    const { store } = createTestStore({
      diaries: [
        buildDiary({ id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10' }),
        buildDiary({ id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11' }),
      ],
      monthlyExporter: jest.fn().mockImplementation(createAbortableExport(deferred)),
    });

    const exportPromise = store.getState().startMonthlyExport('history-2026-01');

    expect(store.getState().monthlyExport).toMatchObject({
      requestId: 1,
      status: 'running',
      groupId: 'history-2026-01',
      monthLabel: '2026年1月',
    });

    store.getState().cancelMonthlyExport();
    const result = await exportPromise;

    expect(result).toEqual({
      ok: false,
      requestId: 1,
      reason: 'cancelled',
      message: '本次月度导出已取消。',
    });
    expect(store.getState().monthlyExport).toMatchObject({
      requestId: 1,
      status: 'cancelled',
      groupId: 'history-2026-01',
      monthLabel: '2026年1月',
      error: '本次月度导出已取消。',
    });

    deferred.resolve({
      monthLabel: '2026年1月',
      diaryCount: 2,
      previewMessage: '这条迟到成功不应该复活已取消的导出。',
    });
    await Promise.resolve();

    expect(store.getState().monthlyExport.status).toBe('cancelled');
    expect(store.getState().monthlyExport.result).toBeUndefined();
  });

  test('switching to another month replaces the running export and keeps the result isolated', async () => {
    const janDeferred = createDeferred<MonthlyExportResult>();
    const febDeferred = createDeferred<MonthlyExportResult>();
    const monthlyExporter = jest.fn()
      .mockImplementationOnce(createAbortableExport(janDeferred))
      .mockImplementationOnce(createAbortableExport(febDeferred));
    const { store } = createTestStore({
      diaries: [
        buildDiary({ id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10', version: 1 }),
        buildDiary({ id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11', version: 2 }),
        buildDiary({ id: 'diary-feb-1', title: '二月回忆', date: '2026.02.03', version: 5 }),
      ],
      monthlyExporter,
    });

    const janPromise = store.getState().startMonthlyExport('history-2026-01');
    expect(store.getState().monthlyExport).toMatchObject({
      requestId: 1,
      status: 'running',
      groupId: 'history-2026-01',
    });

    const febPromise = store.getState().startMonthlyExport('history-2026-02');
    febDeferred.resolve({
      monthLabel: '2026年2月',
      diaryCount: 1,
      previewMessage: '2026年2月 的 1 篇日记已整理为合集预览。本次为本地演示，没有写入文件。',
    });

    const febResult = await febPromise;
    expect(febResult).toEqual({
      ok: true,
      requestId: 2,
      result: {
        monthLabel: '2026年2月',
        diaryCount: 1,
        previewMessage: '2026年2月 的 1 篇日记已整理为合集预览。本次为本地演示，没有写入文件。',
      },
    });

    const janResult = await janPromise;
    expect(janResult).toEqual({
      ok: false,
      requestId: 1,
      reason: 'superseded',
      message: 'stale monthly export ignored',
    });

    janDeferred.resolve({
      monthLabel: '2026年1月',
      diaryCount: 2,
      previewMessage: '2026年1月 的 2 篇日记已整理为合集预览。本次为本地演示，没有写入文件。',
    });
    await Promise.resolve();

    expect(store.getState().monthlyExport).toMatchObject({
      requestId: 2,
      status: 'succeeded',
      groupId: 'history-2026-02',
      monthLabel: '2026年2月',
      result: {
        monthLabel: '2026年2月',
        diaryCount: 1,
        previewMessage: '2026年2月 的 1 篇日记已整理为合集预览。本次为本地演示，没有写入文件。',
      },
    });
    expect(store.getState().monthlyExport.snapshot?.diaries).toEqual([
      { id: 'diary-feb-1', title: '二月回忆', date: '2026.02.03', version: 5 },
    ]);
    expect(monthlyExporter).toHaveBeenNthCalledWith(
      1,
      {
        groupId: 'history-2026-01',
        monthLabel: '2026年1月',
        diaryIds: ['diary-jan-2', 'diary-jan-1'],
        diaries: [
          { id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11', version: 2 },
          { id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10', version: 1 },
        ],
      },
      expect.objectContaining({ signal: expect.any(Object) }),
    );
    expect(monthlyExporter).toHaveBeenNthCalledWith(
      2,
      {
        groupId: 'history-2026-02',
        monthLabel: '2026年2月',
        diaryIds: ['diary-feb-1'],
        diaries: [
          { id: 'diary-feb-1', title: '二月回忆', date: '2026.02.03', version: 5 },
        ],
      },
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });
});
