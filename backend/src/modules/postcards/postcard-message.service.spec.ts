import { PhotoAssetError } from '../photos/photo-asset.service';
import { ArkPostcardMessageProvider, PostcardMessageProviderError } from './ark-postcard-message-provider';
import { PostcardMessageService } from './postcard-message.service';

describe('PostcardMessageService', () => {
  test('reads the selected photo within its owner device and passes the provided place to AI', async () => {
    const photo = { buffer: Buffer.from('photo'), mimeType: 'image/jpeg' };
    const assets = { readMaterialPhoto: jest.fn(async () => photo) };
    const provider = { generate: jest.fn(async () => '海风轻吻落日') };
    const service = new PostcardMessageService(
      provider as unknown as ArkPostcardMessageProvider,
      assets as never,
    );
    const signal = new AbortController().signal;

    await expect(service.generate('device-1', {
      version: 'postcard-message-v1',
      photoId: 'material-1',
      location: '苏州',
    }, signal)).resolves.toEqual({ message: '海风轻吻落日' });
    expect(assets.readMaterialPhoto).toHaveBeenCalledWith('device-1', 'material-1');
    expect(provider.generate).toHaveBeenCalledWith(photo, '苏州', signal);
  });

  test('does not ask AI to process a photo that is not owned by the requesting device', async () => {
    const assets = {
      readMaterialPhoto: jest.fn(async () => {
        throw new PhotoAssetError('not_found', 'missing');
      }),
    };
    const provider = { generate: jest.fn() };
    const service = new PostcardMessageService(
      provider as unknown as ArkPostcardMessageProvider,
      assets as never,
    );

    await expect(service.generate('device-2', {
      version: 'postcard-message-v1',
      photoId: 'device-1-photo',
      location: '',
    })).rejects.toBeInstanceOf(PhotoAssetError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  test('rejects an invalid provider result at the service boundary', async () => {
    const assets = { readMaterialPhoto: jest.fn(async () => ({ buffer: Buffer.from('photo'), mimeType: 'image/jpeg' })) };
    const provider = { generate: jest.fn(async () => '一二三四五六七八九十一二三') };
    const service = new PostcardMessageService(
      provider as unknown as ArkPostcardMessageProvider,
      assets as never,
    );

    await expect(service.generate('device-1', {
      version: 'postcard-message-v1',
      photoId: 'material-1',
      location: '',
    })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});
