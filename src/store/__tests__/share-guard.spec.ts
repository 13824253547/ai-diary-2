import { createTestStore } from '../../test-utils/create-test-store';

type ShareGuard = (privacy: 'private' | 'anonymous' | 'public-likes' | 'public-comments', mode: string) => boolean;

function assertPrivatePlatformShareBlocked(guard: ShareGuard) {
  if (guard('private', 'wechat')) {
    throw new Error('private diary must not be shareable to external platform');
  }
  if (guard('private', 'x')) {
    throw new Error('private diary must not be shareable to external platform');
  }
  if (!guard('private', 'save')) {
    throw new Error('private diary should still support local export');
  }
}

describe('share privacy guard', () => {
  test('blocks external platform share when diary is private', () => {
    const { store } = createTestStore();
    const guard: ShareGuard = (privacy, mode) => {
      const diaryId = 'diary-1';
      store.getState().savePrivacy(diaryId, privacy);
      const diary = store.getState().diaries.find(item => item.id === diaryId);
      if (!diary) return false;
      return store.getState().confirmShareDelivery({
        diaryId,
        mode: mode as 'wechat' | 'x' | 'save',
        version: diary.version ?? 0,
        operationId: `${mode}-${privacy}`,
      });
    };

    expect(() => assertPrivatePlatformShareBlocked(guard)).not.toThrow();
  });

  test('mutation-style broken guard would be detected by the same assertion', () => {
    const brokenGuard: ShareGuard = (_privacy, mode) => mode !== 'save' || true;
    expect(() => assertPrivatePlatformShareBlocked(brokenGuard)).toThrow(
      'private diary must not be shareable to external platform',
    );
  });

  test('SHR-001 saves the selected privacy scope only on the target diary and clears public blocks when switched back to private', () => {
    const { store, selectors } = createTestStore();
    const otherBefore = selectors.getDiaryById('diary-2');

    expect(store.getState().savePrivacy('diary-1', 'public-comments', ['block-1'])).toBe(true);
    expect(selectors.getDiaryById('diary-1')).toMatchObject({
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    expect(selectors.getDiaryById('diary-2')).toEqual(otherBefore);

    expect(store.getState().savePrivacy('diary-1', 'private', ['block-1'])).toBe(true);
    expect(selectors.getDiaryById('diary-1')).toMatchObject({
      privacy: 'private',
      publicBlockIds: undefined,
    });
    expect(selectors.getDiaryById('diary-2')).toEqual(otherBefore);
  });

  test('SHR-001 rejects empty public selections and missing diaries without mutating saved content', () => {
    const { store, selectors } = createTestStore();
    const beforeDiary = selectors.getDiaryById('diary-1');
    const beforeOther = selectors.getDiaryById('diary-2');

    expect(store.getState().savePrivacy('diary-1', 'anonymous', [])).toBe(false);
    expect(store.getState().savePrivacy('missing', 'private')).toBe(false);

    expect(selectors.getDiaryById('diary-1')).toEqual(beforeDiary);
    expect(selectors.getDiaryById('diary-2')).toEqual(beforeOther);
  });
});
