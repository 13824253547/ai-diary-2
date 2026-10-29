import { HttpAnchorReadModelRepository } from '../http-anchor-read-model-repository';
import { AnchorReadRepositoryError } from '../anchor-read-model-repository';
import type { ApiClient } from '../../services/api-client';

const page = {
  items: [{
    id: 'row-1',
    anchorId: 'anchor-1',
    tagId: 'tag-stable',
    sourceBlockId: 'block-1',
    excerpt: 'A saved excerpt.',
    source: 'provider',
    diary: {
      id: 'diary-1',
      version: 3,
      title: 'A saved diary',
      date: '2026-10-16T00:00:00.000Z',
      coverPhotoId: 'photo-1',
    },
  }],
  tagId: 'tag-stable',
  page: 1,
  pageSize: 20,
  total: 1,
};

const pendingRun = {
  diaryId: 'diary-1',
  diaryVersion: 3,
  requestId: 'request-1',
  attempt: 1,
  status: 'pending',
  anchors: [],
};

describe('HttpAnchorReadModelRepository', () => {
  const client = { request: jest.fn() } as unknown as ApiClient;
  const repository = new HttpAnchorReadModelRepository(client);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reads batch history and rejects mismatched, duplicate or incomplete pages', async () => {
    const history = {
      batchId: 'batch-1', sourceVersion: 'hash-1',
      sourceDateStart: '2026-10-27', sourceDateEnd: '2026-10-27',
      page: 1, pageSize: 100, total: 1,
      items: [{ id: 'message-1', conversationId: 'chat-2', requestId: 'request-1',
        role: 'user', text: '金色的海面', createdAt: '2026-10-27T00:00:00.000Z' }],
    };
    const respond = (data: unknown) => ({ ok: true, status: 200,
      data: { ok: true, version: 'memory-anchor-v1', data } });
    jest.mocked(client.request).mockResolvedValueOnce(respond(history));
    await expect(repository.getChatHistory({ batchId: 'batch-1' })).resolves.toEqual(history);
    expect(client.request).toHaveBeenCalledWith('/anchors/chat/batch-1/history?page=1&pageSize=100',
      { method: 'GET' }, undefined);
    for (const invalid of [
      { ...history, batchId: 'other' }, { ...history, page: 2 },
      { ...history, total: 2 }, { ...history, total: 2, items: [history.items[0], history.items[0]] },
    ]) {
      jest.mocked(client.request).mockResolvedValueOnce(respond(invalid));
      await expect(repository.getChatHistory({ batchId: 'batch-1' })).rejects.toBeInstanceOf(AnchorReadRepositoryError);
    }
  });

  test('queries only an explicit tag and validates the source diary projection', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'anchor-extraction-v1', data: page },
    });

    await expect(repository.listByTag({ tagId: 'tag-stable' })).resolves.toEqual(page);
    expect(client.request).toHaveBeenCalledWith(
      '/anchors?tagId=tag-stable&page=1&pageSize=20',
      { method: 'GET' },
      undefined,
    );
    await expect(repository.listByTag({ tagId: ' ' }))
      .rejects.toMatchObject({ code: 'invalid_input' });
  });

  test('rejects malformed queries and responses for a different tag or page', async () => {
    await expect(repository.listByTag(null as never)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(repository.listByTag({
      tagId: 'tag-stable',
      page: '1',
    } as never)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(client.request).not.toHaveBeenCalled();

    const mismatches = [
      { ...page, tagId: 'tag-other', items: page.items.map(item => ({ ...item, tagId: 'tag-other' })) },
      { ...page, page: 2 },
      { ...page, pageSize: 10 },
    ];
    for (const responsePage of mismatches) {
      jest.mocked(client.request).mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { ok: true, version: 'anchor-extraction-v1', data: responsePage },
      });
      await expect(repository.listByTag({ tagId: 'tag-stable' })).rejects.toMatchObject({
        code: 'provider_failed',
        retryable: false,
      });
    }
  });

  test('loads a mixed memory feed without a tag and validates the requested page', async () => {
    const feed = {
      items: [{
        id: 'chat:batch-1',
        anchorId: 'chat-anchor-1',
        sourceType: 'chat',
        tagId: 'friends',
        title: '小橘的陪伴记忆',
        displayDate: '2026-01-03T00:00:00.000Z',
        excerpt: '小橘记得你提到老朋友时，语气里满是珍惜。',
        chat: {
          batchId: 'batch-1',
          sourceDateStart: '2026-01-01',
          sourceDateEnd: '2026-01-02',
          sourceMessages: [{ conversationId: 'conversation-1', messageId: 'message-1' }],
        },
      }],
      tagId: null,
      page: 1,
      pageSize: 20,
      total: 1,
    };
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'memory-anchor-v1', data: feed },
    });

    await expect(repository.listFeed()).resolves.toEqual(feed);
    expect(client.request).toHaveBeenCalledWith('/anchors/feed?page=1&pageSize=20', { method: 'GET' }, undefined);
    const filteredFeed = { ...feed, tagId: 'friends', page: 2, pageSize: 10 };
    jest.mocked(client.request).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        ok: true,
        version: 'memory-anchor-v1',
        data: filteredFeed,
      },
    });
    await expect(repository.listFeed({ tagId: 'friends', page: 2, pageSize: 10 })).resolves.toEqual(filteredFeed);
    expect(client.request).toHaveBeenLastCalledWith(
      '/anchors/feed?page=2&pageSize=10&tagId=friends',
      { method: 'GET' },
      undefined,
    );
  });

  test('reads the real feed count without loading a fixed or mock total', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'memory-anchor-v1', data: { total: 7 } },
    });

    await expect(repository.getSummary()).resolves.toEqual({ total: 7 });
    expect(client.request).toHaveBeenCalledWith('/anchors/summary', { method: 'GET' }, undefined);
  });

  test('starts a request with diary source version and attempt', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'anchor-extraction-v1', data: pendingRun },
    });

    await expect(repository.beginExtraction({
      diaryId: 'diary-1',
      diaryVersion: 3,
      requestId: 'request-1',
      attempt: 1,
    })).resolves.toEqual(pendingRun);
    expect(client.request).toHaveBeenCalledWith(
      '/anchors/extractions/begin',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diaryId: 'diary-1',
          diaryVersion: 3,
          requestId: 'request-1',
          attempt: 1,
        }),
      },
      undefined,
    );
  });

  test('refuses mock results and fails closed on malformed service responses', async () => {
    await expect(repository.completeExtraction({
      attempt: 1,
      result: {
        requestId: 'request-1',
        diaryId: 'diary-1',
        diaryVersion: 3,
        source: 'mock',
        anchors: [],
      } as never,
    })).rejects.toBeInstanceOf(AnchorReadRepositoryError);
    expect(client.request).not.toHaveBeenCalled();

    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'wrong-version', data: page },
    });
    await expect(repository.listByTag({ tagId: 'tag-stable' }))
      .rejects.toMatchObject({ code: 'provider_failed' });
  });
});
