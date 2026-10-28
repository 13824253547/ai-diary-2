import { resolveDiscoveryMediaUri } from '../discovery-media';

describe('resolveDiscoveryMediaUri', () => {
  test('adds the backend API origin to a public photo route', () => {
    expect(resolveDiscoveryMediaUri('/photos/discovery/story-1/photo-content?photoId=photo-1'))
      .toBe('http://127.0.0.1:3001/api/photos/discovery/story-1/photo-content?photoId=photo-1');
  });

  test('preserves absolute media URLs and empty cover values', () => {
    expect(resolveDiscoveryMediaUri('https://assets.example/story.jpg'))
      .toBe('https://assets.example/story.jpg');
    expect(resolveDiscoveryMediaUri('')).toBe('');
  });
});
