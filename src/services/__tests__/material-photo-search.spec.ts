import { createTestStore } from '../../test-utils/create-test-store';
import type { DiaryPhoto } from '../../types/diary';
import { filterMaterialPhotosByDiary } from '../material-photo-search';

describe('material photo diary search', () => {
  test('matches diary body and resolves a saved device photo through its material source ID', () => {
    const template = createTestStore().store.getState().diaries[0];
    if (!template) throw new Error('missing diary fixture');
    const diary = {
      ...template,
      id: 'diary-search',
      title: '海边散步',
      location: '厦门',
      photoIds: ['device-asset-1'],
      blocks: [{ id: 'body', type: 'text' as const, content: '傍晚的海风带着咸味。' }],
    };
    const photo: DiaryPhoto = {
      id: 'material-asset-1',
      sourceAssetId: 'device-asset-1',
      title: '素材标题不参与搜索',
      location: '素材地点不参与搜索',
      emoji: '🖼',
      color: '#EFE3D5',
      date: '未知日期',
      uri: 'file:///material-asset-1.jpg',
      source: 'device',
    };

    expect(filterMaterialPhotosByDiary([photo], [diary], '咸味')).toEqual([photo]);
    expect(filterMaterialPhotosByDiary([photo], [diary], '素材标题不参与搜索')).toEqual([]);
    expect(filterMaterialPhotosByDiary([photo], [diary], '')).toEqual([photo]);
  });

  test('searches diary people and returns references from every matching diary', () => {
    const template = createTestStore().store.getState().diaries[0];
    if (!template) throw new Error('missing diary fixture');
    const photos: DiaryPhoto[] = ['photo-1', 'photo-2'].map(id => ({
      id,
      title: id,
      location: '',
      emoji: '🖼',
      color: '#EFE3D5',
      date: '未知日期',
      uri: `file:///${id}.jpg`,
      source: 'device',
    }));
    const diaries = [
      {
        ...template,
        id: 'diary-one',
        title: '作品一',
        subtitle: '',
        location: '',
        date: '',
        summary: '',
        companionName: '',
        photoIds: ['photo-1'],
        blocks: [{ id: 'one', type: 'text' as const, content: '正文一' }],
        people: [{ id: 'person-1', name: '小林', aliases: ['阿林'], photoIds: ['photo-1'], avatarPhotoId: 'photo-1' }],
      },
      {
        ...template,
        id: 'diary-two',
        title: '作品二',
        subtitle: '',
        location: '',
        date: '',
        summary: '',
        companionName: '',
        photoIds: ['photo-2'],
        blocks: [{ id: 'two', type: 'text' as const, content: '正文二' }],
        people: [{ id: 'person-2', name: '小周', photoIds: ['photo-2'], avatarPhotoId: 'photo-2' }],
      },
    ];

    expect(filterMaterialPhotosByDiary(photos, diaries, '阿林')).toEqual([photos[0]]);
  });
});
