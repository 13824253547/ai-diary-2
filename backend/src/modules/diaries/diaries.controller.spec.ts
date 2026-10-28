import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { configureApiBodyParser } from '../../common/api-body-parser';
import { MemoryStoreService } from '../../common/memory-store.service';
import { DiaryAnchorGenerationService } from '../anchors/diary-anchor-generation.service';
import { PhotoAssetService } from '../photos/photo-asset.service';
import { GrowthInsightsService } from '../growth/growth-insights.service';
import { DiariesController } from './diaries.controller';

describe('DiariesController', () => {
  let app: INestApplication;
  const beforeCommit = jest.fn();
  const rollback = jest.fn();
  const savedPhotoIds = ['device-photo-1'];
  const uploadedPhoto = {
    photoId: 'device-photo-1',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
    date: '2026.10.20',
  };
  const photoAssets = {
    createDiaryPhotoSaveHook: jest.fn(() => ({ beforeCommit, rollback })),
    ensureDiaryPhotoCopies: jest.fn(),
  };
  const diaryAnchors = { enqueue: jest.fn() };
  const growthInsights = { enqueueAfterDiarySaved: jest.fn() };
  const store = {
    saveDiaryWithCommand: jest.fn(async (_body, _owner, hook) => {
      await hook.beforeCommit({} as never, 'diary-1');
      return {
        diaryId: 'diary-1',
        draftId: 'draft-1',
        savedVersion: 1,
        date: '2026.10.23',
      };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DiariesController],
      providers: [
        { provide: MemoryStoreService, useValue: store },
        { provide: PhotoAssetService, useValue: photoAssets },
        { provide: DiaryAnchorGenerationService, useValue: diaryAnchors },
        { provide: GrowthInsightsService, useValue: growthInsights },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApiBodyParser(app);
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    photoAssets.createDiaryPhotoSaveHook.mockReturnValue({ beforeCommit, rollback });
    store.saveDiaryWithCommand.mockImplementation(async (_body, _owner, hook) => {
      await hook.beforeCommit({} as never, 'diary-1');
      return {
        diaryId: 'diary-1',
        draftId: 'draft-1',
        savedVersion: 1,
        date: '2026.10.23',
      };
    });
  });

  afterAll(async () => {
    await app.close();
  });

  test('pairs saved diary photo files with their photo IDs and snapshot fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/diaries/save')
      .set('x-device-id', 'device-1')
      .field('id', 'diary-1')
      .field('draftId', 'draft-1')
      .field('idempotencyKey', 'draft-1-save-new')
      .field('title', '测试日记')
      .field('summary', '正文摘要')
      .field('location', '')
      .field('date', '2026.10.23')
      .field('publishedLocalDate', '2026-10-23')
      .field('privacy', 'private')
      .field('photoIds', JSON.stringify(savedPhotoIds))
      .field('version', '1')
      .field('contentSnapshot', JSON.stringify({
        type: 'travel',
        subtitle: '',
        helperMessage: '',
        characterId: 'character-blue',
        companionName: '自己',
        coverPhotoId: 'device-photo-1',
        blocks: [{ id: 'block-1', type: 'text', content: '一路走一路拍。', photoIds: savedPhotoIds }],
        posterPhotoIds: savedPhotoIds,
        people: [],
      }))
      .field('photoMetadata', JSON.stringify([{
        photoId: 'device-photo-1',
        date: '2026.10.20',
      }]))
      .attach('photos', uploadedPhoto.buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(photoAssets.createDiaryPhotoSaveHook).toHaveBeenCalledWith('device-1', savedPhotoIds, [{
      ...uploadedPhoto,
    }]);
    expect(store.saveDiaryWithCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        publishedLocalDate: '2026-10-23',
        photoIds: savedPhotoIds,
        contentSnapshot: expect.objectContaining({ coverPhotoId: 'device-photo-1' }),
      }),
      'device-1',
      expect.objectContaining({ beforeCommit: expect.any(Function) }),
    );
    expect(beforeCommit).toHaveBeenCalled();
    expect(photoAssets.ensureDiaryPhotoCopies).toHaveBeenCalledWith('device-1', 'diary-1', savedPhotoIds);
    expect(growthInsights.enqueueAfterDiarySaved).toHaveBeenCalledWith('device-1', 'diary-1', 1);
  });
});
