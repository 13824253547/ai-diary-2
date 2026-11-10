import { PhotosController } from './photos.controller';

describe('PhotosController', () => {
  const controller = new PhotosController({} as never);

  test('returns capabilities for an authenticated request', () => {
    expect(controller.getCapabilities()).toEqual({
      ok: true,
      data: {
        source: 'device-client',
        permissions: ['full', 'limited', 'denied', 'revoked'],
      },
    });
  });

  test('reads slash-containing photo IDs from a query parameter', async () => {
    const assets = {
      readDiaryPhotoCopy: jest.fn().mockResolvedValue({
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        mimeType: 'image/jpeg',
      }),
    };
    const scopedController = new PhotosController(assets as never);

    await scopedController.readDiaryPhotoByQuery('user-1', 'diary-1', 'asset/L0/001');

    expect(assets.readDiaryPhotoCopy).toHaveBeenCalledWith(
      'user-1',
      'diary-1',
      'asset/L0/001',
    );
  });

  test('reads a public discovery photo only through its published story reference', async () => {
    const assets = {
      readDiscoveryPhotoCopy: jest.fn().mockResolvedValue({
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        mimeType: 'image/jpeg',
      }),
    };
    const scopedController = new PhotosController(assets as never);

    await scopedController.readDiscoveryPhotoByQuery('story-1', 'asset/L0/001');

    expect(assets.readDiscoveryPhotoCopy).toHaveBeenCalledWith('story-1', 'asset/L0/001');
  });

  test('validates photo query parameters after the auth guard supplies an account', async () => {
    await expect(controller.readDiaryPhotoByQuery('user-1', 'diary-1', undefined))
      .rejects.toMatchObject({ response: { error: { code: 'invalid_input' } } });
  });
});
