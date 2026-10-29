import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PhotoAssetError } from '../photos/photo-asset.service';
import { PostcardMessageProviderError } from './ark-postcard-message-provider';
import { PostcardMessageController } from './postcard-message.controller';
import { PostcardMessageService } from './postcard-message.service';

describe('PostcardMessageController', () => {
  let app: INestApplication;
  const messages = {
    generate: jest.fn(async () => ({ message: '海风轻吻落日' })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PostcardMessageController],
      providers: [{ provide: PostcardMessageService, useValue: messages }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    messages.generate.mockResolvedValue({ message: '海风轻吻落日' });
  });

  afterAll(async () => {
    await app.close();
  });

  test('generates a versioned phrase for the authenticated device material', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/postcards/message')
      .set('x-device-id', 'device-1')
      .send({ version: 'postcard-message-v1', photoId: 'material-1', location: '苏州' })
      .expect(201);

    expect(response.body).toEqual({
      ok: true,
      version: 'postcard-message-v1',
      data: { message: '海风轻吻落日' },
    });
    expect(messages.generate).toHaveBeenCalledWith('device-1', {
      version: 'postcard-message-v1', photoId: 'material-1', location: '苏州',
    }, expect.any(AbortSignal));
  });

  test('rejects missing identity and malformed inputs before generation', async () => {
    await request(app.getHttpServer())
      .post('/api/postcards/message')
      .send({ version: 'postcard-message-v1', photoId: 'material-1', location: '' })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('device_identity_required'));

    await request(app.getHttpServer())
      .post('/api/postcards/message')
      .set('x-device-id', 'device-1')
      .send({ version: 'postcard-message-v1', photoId: '', location: '' })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('invalid_input'));
    expect(messages.generate).not.toHaveBeenCalled();
  });

  test('returns a generic unavailable-photo error without exposing storage details', async () => {
    messages.generate.mockRejectedValueOnce(new PhotoAssetError('not_found', 'private storage path'));

    await request(app.getHttpServer())
      .post('/api/postcards/message')
      .set('x-device-id', 'device-1')
      .send({ version: 'postcard-message-v1', photoId: 'other-device-photo', location: '' })
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.message).toContain('照片素材');
        expect(body.error.message).not.toContain('private storage path');
      });
  });

  test('does not automatically retry invalid model output', async () => {
    messages.generate.mockRejectedValueOnce(new PostcardMessageProviderError('invalid_response'));

    await request(app.getHttpServer())
      .post('/api/postcards/message')
      .set('x-device-id', 'device-1')
      .send({ version: 'postcard-message-v1', photoId: 'material-1', location: '' })
      .expect(502)
      .expect(({ body }) => {
        expect(body.error.code).toBe('invalid_response');
        expect(body.error.retryable).toBe(false);
      });
  });
});
