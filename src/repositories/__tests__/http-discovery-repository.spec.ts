import { DISCOVERY_CONTRACT_VERSION, type DiscoveryStoriesPage } from '../../contracts/discovery-contract';
import { ApiClient } from '../../services/api-client';
import { DiscoveryRepositoryError } from '../discovery-repository';
import { HttpDiscoveryRepository } from '../http-discovery-repository';

const originalFetch = global.fetch;

function okResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data }),
  };
}

function createRepository() {
  return new HttpDiscoveryRepository(new ApiClient({
    baseUrl: 'http://127.0.0.1:3001/api',
    getHeaders: async () => ({ 'x-device-id': 'device-1' }),
  }));
}

describe('HttpDiscoveryRepository', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('requests the explicit latest category and maps the published list contract', async () => {
    const page: DiscoveryStoriesPage = {
      items: [{
        id: 'story-1',
        title: '旧城散步',
        author: '旅行者',
        coverUri: 'https://assets.example/story-1.png',
        date: '2026-09-12T00:00:00.000Z',
        location: '台南',
        body: '沿着旧街慢慢走。',
        likesEnabled: true,
        likeCount: 3,
        liked: true,
      }],
      page: 1,
      pageSize: 10,
      total: 1,
    };
    global.fetch = jest.fn().mockResolvedValue(okResponse(page)) as unknown as typeof fetch;
    const repository = createRepository();

    const result = await repository.listStories({
      category: 'latest',
      keyword: '旧城',
      page: 1,
      pageSize: 10,
    });

    expect(result).toEqual(page);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:3001/api/discovery/stories?category=latest&page=1&pageSize=10&keyword=%E6%97%A7%E5%9F%8E');
    expect(init.headers).toMatchObject({ 'x-device-id': 'device-1' });
    expect(DISCOVERY_CONTRACT_VERSION).toBe('discovery-read-v1');
  });

  test.each([undefined, 'recommended', 'local'])('rejects unresolved category %s before network access', async category => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const repository = createRepository();

    await expect(repository.listStories({
      category: category as 'latest',
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('reads one stable story ID and sends an idempotent target like state', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(okResponse({
        id: 'story/1',
        title: '旧城散步',
        author: '旅行者',
        coverUri: 'https://assets.example/story-1.png',
        date: '2026-09-12T00:00:00.000Z',
        location: '台南',
        body: '沿着旧街慢慢走。',
        likesEnabled: true,
        likeCount: 3,
        liked: false,
      }))
      .mockResolvedValueOnce(okResponse({ storyId: 'story/1', liked: true, likeCount: 4 })) as unknown as typeof fetch;
    const repository = createRepository();

    const story = await repository.getStory('story/1');
    const like = await repository.setLike('story/1', true);

    expect(story.id).toBe('story/1');
    expect(like).toEqual({ storyId: 'story/1', liked: true, likeCount: 4 });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(String(url)).toBe('http://127.0.0.1:3001/api/discovery/stories/story%2F1/like');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ liked: true });
  });

  test('rejects malformed IDs and responses for a different requested story', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({
      id: 'story-2',
      title: '另一篇故事',
      author: '旅行者',
      coverUri: 'https://assets.example/story-2.png',
      date: '2026-09-12T00:00:00.000Z',
      location: '台南',
      body: '不应作为目标故事返回。',
      likesEnabled: true,
      likeCount: 0,
      liked: false,
    })) as unknown as typeof fetch;
    const repository = createRepository();

    await expect(repository.getStory(null as never)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(global.fetch).not.toHaveBeenCalled();
    await expect(repository.getStory('story-1')).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
    });
  });

  test('binds like responses to the requested story before returning state', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({
      storyId: 'story-2',
      liked: true,
      likeCount: 1,
    })) as unknown as typeof fetch;
    const repository = createRepository();

    await expect(repository.setLike(null as never, true)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(global.fetch).not.toHaveBeenCalled();
    await expect(repository.setLike('story-1', true)).rejects.toMatchObject({
      code: 'provider_failed',
      retryable: false,
    });
  });

  test('preserves the disabled-interaction error from the likes endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        error: {
          code: 'interaction_not_available',
          message: 'likes are not enabled for this story',
          retryable: false,
        },
      }),
    }) as unknown as typeof fetch;
    const repository = createRepository();

    await expect(repository.setLike('story-disabled', true)).rejects.toMatchObject({
      code: 'interaction_not_available',
      retryable: false,
    });
  });

  test('maps inaccessible published snapshots to structured not-found errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        ok: false,
        error: { code: 'not_found', message: 'discovery story not found', retryable: false },
      }),
    }) as unknown as typeof fetch;
    const repository = createRepository();

    await expect(repository.getStory('story-private')).rejects.toMatchObject({
      code: 'not_found',
      retryable: false,
    });
  });

  test('rejects malformed list payloads rather than falling back to local content', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({ items: [{ id: 'private' }] })) as unknown as typeof fetch;
    const repository = createRepository();

    await expect(repository.listStories({
      category: 'latest',
      page: 1,
      pageSize: 20,
    })).rejects.toBeInstanceOf(DiscoveryRepositoryError);
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });
});
