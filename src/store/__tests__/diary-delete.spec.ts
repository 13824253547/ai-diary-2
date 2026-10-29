import { createTestStore } from '../../test-utils/create-test-store';
import type { CoreDiaryRepository } from '../../repositories/core-diary-repository';
import { mockDiaries } from '../../mocks/diaries';

describe('single diary deletion', () => {
  test('removes the selected diary, its edit draft and only its cached photo copies', async () => {
    const target = { ...mockDiaries[0], id: 'diary-delete-target' };
    const other = { ...mockDiaries[1], id: 'diary-delete-other' };
    const { store } = createTestStore({ diaries: [target, other] });
    const editDraftId = store.getState().beginEdit(target.id)!;
    const sourcePhoto = store.getState().photos[0];
    store.setState(state => ({
      diaries: [target, other],
      memoriesSourceItems: [target, other],
      memoriesItems: [target, other],
      memoriesTotal: 2,
      currentDiaryId: target.id,
      photos: [
        { ...sourcePhoto, id: 'material-original' },
        { ...sourcePhoto, id: 'target-diary-copy', diaryId: target.id },
        { ...sourcePhoto, id: 'other-diary-copy', diaryId: other.id },
      ],
    }));

    await expect(store.getState().deleteDiary(target.id)).resolves.toEqual({
      ok: true,
      diaryId: target.id,
    });

    expect(store.getState().diaries.map(diary => diary.id)).toEqual([other.id]);
    expect(store.getState().memoriesSourceItems.map(diary => diary.id)).toEqual([other.id]);
    expect(store.getState().memoriesItems.map(diary => diary.id)).toEqual([other.id]);
    expect(store.getState().memoriesTotal).toBe(1);
    expect(store.getState().currentDiaryId).toBe('');
    expect(store.getState().drafts[editDraftId]).toBeUndefined();
    expect(store.getState().photos.map(photo => photo.id)).toEqual(['material-original', 'other-diary-copy']);
    expect(store.getState().growthInsights).toBeUndefined();
  });

  test('keeps local data when the device-scoped backend deletion fails', async () => {
    const target = { ...mockDiaries[0], id: 'diary-delete-target' };
    const repository = {
      deleteDiary: jest.fn(async () => ({
        ok: false as const,
        version: 'core-diary-v1' as const,
        error: { code: 'provider_failed' as const, message: 'failed', retryable: true },
      })),
    } as unknown as CoreDiaryRepository;
    const { store } = createTestStore({
      diaries: [target],
      adapters: { diaryRepository: repository },
    });

    await expect(store.getState().deleteDiary(target.id)).resolves.toMatchObject({
      ok: false,
      reason: 'delete_failed',
    });
    expect(repository.deleteDiary).toHaveBeenCalledWith(target.id);
    expect(store.getState().diaries.map(diary => diary.id)).toEqual([target.id]);
  });

  test('does not restore a diary from a read request that completes after deletion', async () => {
    const target = { ...mockDiaries[0], id: 'diary-delete-target' };
    let resolveRead!: (result: {
      ok: true;
      version: 'core-diary-v1';
      data: typeof target;
    }) => void;
    const readResult = new Promise<{
      ok: true;
      version: 'core-diary-v1';
      data: typeof target;
    }>(resolve => { resolveRead = resolve; });
    const repository = {
      getDiary: jest.fn(() => readResult),
      deleteDiary: jest.fn(async (diaryId: string) => ({
        ok: true as const,
        version: 'core-diary-v1' as const,
        data: { diaryId },
      })),
    } as unknown as CoreDiaryRepository;
    const { store } = createTestStore({
      diaries: [target],
      adapters: { diaryRepository: repository },
    });

    const pendingRead = store.getState().readDiaryById(target.id);
    await expect(store.getState().deleteDiary(target.id)).resolves.toMatchObject({ ok: true });
    resolveRead({ ok: true, version: 'core-diary-v1', data: target });

    await expect(pendingRead).resolves.toMatchObject({ ok: false, reason: 'not_found' });
    expect(store.getState().diaries).toEqual([]);
  });
});
