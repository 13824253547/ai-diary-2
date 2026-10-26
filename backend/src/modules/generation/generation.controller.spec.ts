import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { configureApiBodyParser } from '../../common/api-body-parser';
import { GenerationJobError, MemoryStoreService } from '../../common/memory-store.service';
import { GenerationController, GenerationIdentityGuard } from './generation.controller';

describe('GenerationController', () => {
  const store = {
    createGenerationJob: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
    rewriteDraftBlock: jest.fn().mockResolvedValue({ draftId: 'draft-1', blockId: 'block-1' }),
  } as unknown as MemoryStoreService;
  const controller = new GenerationController(store);
  let httpApp: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GenerationController],
      providers: [
        GenerationIdentityGuard,
        { provide: MemoryStoreService, useValue: store },
      ],
    }).compile();
    httpApp = moduleRef.createNestApplication({ bodyParser: false });
    configureApiBodyParser(httpApp);
    httpApp.setGlobalPrefix('api');
    await httpApp.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await httpApp.close();
  });

  test.each([
    null,
    {},
    { draftId: 'draft-1', draftVersion: 0, idempotencyKey: 'draft-1-round-1' },
    { draftId: 'draft-1', draftVersion: 1.5, idempotencyKey: 'draft-1-round-1' },
    { draftId: 'draft-1', draftVersion: Number.MAX_SAFE_INTEGER + 1, idempotencyKey: 'draft-1-round-1' },
    { draftId: 'draft-1', draftVersion: 1, idempotencyKey: ' ' },
  ])('rejects malformed generation requests before touching the store', async body => {
    await expect(controller.createJob(body)).rejects.toBeInstanceOf(BadRequestException);
    expect(store.createGenerationJob).not.toHaveBeenCalled();
  });

  test('requires device identity before reporting malformed generation input', async () => {
    try {
      await controller.createJob(null);
      fail('expected missing device identity to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        error: { code: 'device_identity_required' },
      });
    }
    expect(store.createGenerationJob).not.toHaveBeenCalled();
  });

  test('passes a valid versioned request to the device-scoped store', async () => {
    const uploads = [{
      mimetype: 'image/jpeg',
      buffer: Buffer.from('synthetic-image'),
    }];
    const pairedUploads = [{
      photoId: 'photo-1',
      mimeType: 'image/jpeg',
      buffer: uploads[0].buffer,
      date: '2026.10.20',
    }];
    await expect(controller.createJob({
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-round-2',
      photoMetadata: [{ photoId: 'photo-1', title: '河边散步', location: '台南', date: '2026.10.20' }],
    }, ' device ', uploads)).resolves.toEqual({
      ok: true,
      data: { jobId: 'job-1' },
    });

    expect(store.createGenerationJob).toHaveBeenCalledWith({
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-round-2',
    }, 'device', pairedUploads);
  });

  test('rejects generation requests that omit the ordered photo upload set', async () => {
    await expect(controller.createJob({
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-round-2',
    }, 'device-1', [])).rejects.toMatchObject({
      response: { error: { code: 'asset_unreadable' } },
    });
    expect(store.createGenerationJob).not.toHaveBeenCalled();
  });

  test('maps idempotency payload conflicts to a non-retryable version conflict', async () => {
    (store.createGenerationJob as jest.Mock).mockRejectedValueOnce(
      new GenerationJobError('version_conflict', '生成任务幂等键已绑定到其他草稿版本。'),
    );
    const file = {
      mimetype: 'image/jpeg',
      buffer: Buffer.from('synthetic-image'),
    };

    try {
      await controller.createJob({
        draftId: 'draft-1',
        draftVersion: 2,
        idempotencyKey: 'draft-1-round-2',
        photoMetadata: [{ photoId: 'photo-1' }],
      }, 'device-1', [file]);
      fail('expected idempotency payload conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        error: { code: 'version_conflict', retryable: false },
      });
    }
  });

  test.each([
    null,
    {},
    { draftId: 'draft-1', blockId: 'block-1', draftVersion: 0 },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'photo',
      content: 'paragraph',
      selectedPhotoIds: [],
    },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'text',
      content: ' ',
      selectedPhotoIds: [],
    },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'quote',
      content: 'paragraph',
      selectedPhotoIds: 'photo-1',
    },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'text',
      content: 'paragraph',
      selectedPhotoIds: ['photo-1'],
      photoIds: [' '],
    },
  ])('rejects malformed rewrite requests before touching the store', async body => {
    await expect(controller.rewriteBlock(body, 'device-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(store.rewriteDraftBlock).not.toHaveBeenCalled();
  });

  test('requires device identity before reporting malformed rewrite input', async () => {
    await expect(controller.rewriteBlock(null)).rejects.toMatchObject({
      response: { error: { code: 'device_identity_required' } },
    });
    expect(store.rewriteDraftBlock).not.toHaveBeenCalled();
  });

  test('passes read-only rewrite context and only the target image to the store', async () => {
    const input = {
      draftId: 'draft-1',
      blockId: 'block-2',
      draftVersion: 2,
      characterId: 'character-blue',
      blockType: 'text',
      content: '当前目标段落',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      photoIds: ['photo-2'],
      contextBlocks: [{ id: 'block-1', type: 'text', content: '前一段只读上下文' }],
      photoMetadata: [{ photoId: 'photo-2', title: '街巷', location: '台南', date: '2026.10.20' }],
    };
    const files = [{
      mimetype: 'image/jpeg',
      buffer: Buffer.from('synthetic-target-image'),
    }];
    const pairedFiles = [{
      photoId: 'photo-2',
      mimeType: 'image/jpeg',
      buffer: files[0].buffer,
      date: '2026.10.20',
    }];

    await controller.rewriteBlock(input, 'device-1', files);

    const { photoMetadata: _metadata, ...request } = input;
    expect(store.rewriteDraftBlock).toHaveBeenCalledWith(request, 'device-1', pairedFiles);
  });

  test('accepts ordered photo files over the real multipart HTTP endpoint', async () => {
    const photos = [
      { photoId: 'photo-2', title: '第二张', location: '台南', date: '2026.10.20' },
      { photoId: 'photo-1', title: '第一张', location: '台南', date: '2026.10.20' },
    ];
    await request(httpApp.getHttpServer())
      .post('/api/generation/jobs')
      .set('x-device-id', 'device-http')
      .field('draftId', 'draft-http')
      .field('draftVersion', '4')
      .field('idempotencyKey', 'draft-http-round-4')
      .field('photoMetadata', JSON.stringify(photos))
      .attach('photos', Buffer.from('jpeg-2'), { filename: 'photo-2.jpg', contentType: 'image/jpeg' })
      .attach('photos', Buffer.from('jpeg-1'), { filename: 'photo-1.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(store.createGenerationJob).toHaveBeenCalledWith({
      draftId: 'draft-http',
      draftVersion: 4,
      idempotencyKey: 'draft-http-round-4',
    }, 'device-http', [
      expect.objectContaining({ photoId: 'photo-2', date: '2026.10.20', mimeType: 'image/jpeg' }),
      expect.objectContaining({ photoId: 'photo-1', date: '2026.10.20', mimeType: 'image/jpeg' }),
    ]);
    const receivedUploads = (store.createGenerationJob as jest.Mock).mock.calls[0][2];
    expect(receivedUploads[0]).not.toHaveProperty('title');
    expect(receivedUploads[0]).not.toHaveProperty('location');
  });

  test('checks device identity before parsing multipart photo uploads', async () => {
    await request(httpApp.getHttpServer())
      .post('/api/generation/jobs')
      .field('draftId', 'draft-http')
      .field('draftVersion', '4')
      .field('idempotencyKey', 'draft-http-round-4')
      .field('photoMetadata', '[]')
      .attach('photos', Buffer.from('jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe('device_identity_required');
      });

    expect(store.createGenerationJob).not.toHaveBeenCalled();
  });

  test('accepts multipart rewrite with read-only paragraph context and one scoped photo', async () => {
    const targetPhoto = { photoId: 'photo-2', title: 'IMG_1234.jpg', location: '家庭相册', date: '2026.10.20' };
    await request(httpApp.getHttpServer())
      .post('/api/generation/rewrite')
      .set('x-device-id', 'device-http')
      .field('draftId', 'draft-http')
      .field('blockId', 'block-2')
      .field('draftVersion', '4')
      .field('characterId', 'character-blue')
      .field('blockType', 'text')
      .field('content', '目标段落')
      .field('selectedPhotoIds', JSON.stringify(['photo-1', 'photo-2', 'photo-3']))
      .field('photoIds', JSON.stringify(['photo-2']))
      .field('contextBlocks', JSON.stringify([{ id: 'block-1', type: 'text', content: '只读前文' }]))
      .field('photoMetadata', JSON.stringify([targetPhoto]))
      .attach('photos', Buffer.from('target-jpeg'), { filename: 'target.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(store.rewriteDraftBlock).toHaveBeenCalledWith(expect.objectContaining({
      blockId: 'block-2',
      content: '目标段落',
      photoIds: ['photo-2'],
      contextBlocks: [{ id: 'block-1', type: 'text', content: '只读前文' }],
    }), 'device-http', [
      expect.objectContaining({ photoId: 'photo-2', mimeType: 'image/jpeg' }),
    ]);
    const receivedUploads = (store.rewriteDraftBlock as jest.Mock).mock.calls[0][2];
    expect(receivedUploads[0]).not.toHaveProperty('title');
    expect(receivedUploads[0]).not.toHaveProperty('location');
  });
});
