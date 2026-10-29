import { appConfig } from '../../config/app-config';
import { createDiscoveryMediaSource, resolveDiscoveryMediaUri } from '../discovery-media';
import { getDeviceIdentityHeaders } from '../device-identity';

jest.mock('../device-identity', () => ({
  getDeviceIdentityHeaders: jest.fn(async () => ({
    'x-device-id': 'device-discovery-test',
    Authorization: 'Bearer discovery-test-token',
  })),
}));

describe('resolveDiscoveryMediaUri', () => {
  beforeEach(() => jest.clearAllMocks());

  test('adds the backend API origin to a public photo route', () => {
    const baseUrl = appConfig.backendBaseUrl.replace(/\/+$/u, '');
    expect(resolveDiscoveryMediaUri('/photos/discovery/story-1/photo-content?photoId=photo-1'))
      .toBe(`${baseUrl}/photos/discovery/story-1/photo-content?photoId=photo-1`);
  });

  test('preserves absolute media URLs and empty cover values', () => {
    expect(resolveDiscoveryMediaUri('https://assets.example/story.jpg'))
      .toBe('https://assets.example/story.jpg');
    expect(resolveDiscoveryMediaUri('')).toBe('');
  });

  test('adds current device credentials only to protected backend discovery media', async () => {
    const source = await createDiscoveryMediaSource('/photos/discovery/story-1/photo-content?photoId=photo-1');

    expect(source).toEqual({
      uri: `${appConfig.backendBaseUrl.replace(/\/+$/u, '')}/photos/discovery/story-1/photo-content?photoId=photo-1`,
      headers: {
        'x-device-id': 'device-discovery-test',
        Authorization: 'Bearer discovery-test-token',
      },
    });
    expect(getDeviceIdentityHeaders).toHaveBeenCalledTimes(1);
  });

  test('does not send device credentials to externally hosted story media', async () => {
    await expect(createDiscoveryMediaSource('https://media.example/story.png')).resolves.toEqual({
      uri: 'https://media.example/story.png',
    });
    expect(getDeviceIdentityHeaders).not.toHaveBeenCalled();
  });
});
