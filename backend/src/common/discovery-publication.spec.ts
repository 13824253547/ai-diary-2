import {
  buildDiscoveryPublicationSnapshot,
  DiscoveryPublicationError,
  normalizeDiscoveryCity,
} from './discovery-publication';

function diary(overrides: Record<string, unknown> = {}) {
  return {
    title: '和小林的台南日记',
    location: '台南市',
    date: new Date('2026-10-20T00:00:00.000Z'),
    privacy: 'public-comments',
    photoIds: ['photo-1', 'photo-2'],
    publicBlockIds: ['block-1'],
    contentSnapshot: {
      characterId: 'character-green',
      coverPhotoId: 'photo-1',
      companionName: '小林',
      people: [{ name: '小林', aliases: ['林同学'] }],
      blocks: [
        { id: 'block-1', type: 'text', title: '海边', content: '和小林沿海散步', photoIds: ['photo-1'] },
        { id: 'block-2', type: 'text', content: '这段没有公开', photoIds: ['photo-1'] },
        { id: 'photo-1-block', type: 'photo', photoId: 'photo-1', caption: '小林看海', relatedBlockId: 'block-1' },
        { id: 'private-caption', type: 'photo', photoId: 'photo-1', caption: '未选段说明', relatedBlockId: 'block-2' },
        { id: 'photo-2-block', type: 'photo', photoId: 'photo-2', caption: '未选段照片', relatedBlockId: 'block-2' },
      ],
    },
    ...overrides,
  };
}

describe('discovery publication snapshots', () => {
  test('projects only selected paragraphs and their related photos', () => {
    const snapshot = buildDiscoveryPublicationSnapshot(diary());

    expect(snapshot).toMatchObject({
      title: '和小林的台南日记',
      authorDisplayName: '日记作者',
      location: '台南市',
      cityKey: '台南',
      body: '和小林沿海散步',
      likesEnabled: true,
      coverPhotoId: 'photo-1',
      characterId: 'character-green',
      publicPhotoIds: ['photo-1'],
    });
    expect(snapshot.publicContent).toEqual([{
      id: 'block-1',
      type: 'text',
      title: '海边',
      content: '和小林沿海散步',
      photos: [{ photoId: 'photo-1', caption: '小林看海' }],
    }]);
  });

  test('uses the source cover only when it belongs to the public selection', () => {
    const snapshot = buildDiscoveryPublicationSnapshot(diary({
      contentSnapshot: {
        characterId: 'character-brown',
        coverPhotoId: 'photo-2',
        blocks: [
          { id: 'block-1', type: 'text', content: '公开的海风。', photoIds: ['photo-1'] },
          { id: 'block-2', type: 'text', content: '私密的海风。', photoIds: ['photo-2'] },
        ],
      },
    }));

    expect(snapshot).toMatchObject({ characterId: 'character-brown', coverPhotoId: 'photo-1' });
    expect(snapshot.publicPhotoIds).toEqual(['photo-1']);
  });

  test('keeps the original cover when a different public photo appears first', () => {
    const snapshot = buildDiscoveryPublicationSnapshot(diary({
      publicBlockIds: ['block-1', 'block-2'],
      contentSnapshot: {
        characterId: 'character-green',
        coverPhotoId: 'photo-2',
        blocks: [
          { id: 'block-1', type: 'text', content: '第一段。', photoIds: ['photo-1'] },
          { id: 'block-2', type: 'text', content: '第二段。', photoIds: ['photo-2'] },
        ],
      },
    }));

    expect(snapshot.publicPhotoIds).toEqual(['photo-1', 'photo-2']);
    expect(snapshot.coverPhotoId).toBe('photo-2');
  });

  test('removes person names and location from text-only anonymous snapshots', () => {
    const snapshot = buildDiscoveryPublicationSnapshot(diary({
      privacy: 'anonymous',
      location: '台南市',
      photoIds: ['photo-1', 'photo-2'],
      contentSnapshot: {
        companionName: '小林',
        people: [{ name: '小林', aliases: ['林同学'] }],
        blocks: [{ id: 'block-1', type: 'text', content: '小林在海边散步。' }],
      },
    }));

    expect(snapshot).toMatchObject({
      title: '和同行人的台南日记',
      authorDisplayName: '匿名用户',
      location: '',
      cityKey: '',
      body: '同行人在海边散步。',
      publicPhotoIds: [],
      coverPhotoId: null,
      likesEnabled: false,
    });
  });

  test('blocks anonymous publication when a selected paragraph contains an unmasked photo', () => {
    expect(() => buildDiscoveryPublicationSnapshot(diary({ privacy: 'anonymous' })))
      .toThrow(expect.objectContaining({
        code: 'publication_blocked',
        message: '匿名照片遮挡目前不可用，含照片的匿名日记暂不能发布到发现。',
      }));
  });

  test.each(['', '未知地点', 'Unknown location'])('leaves unknown city unclassified: %s', value => {
    expect(normalizeDiscoveryCity(value)).toBe('');
  });
});
