import { AnchorReadModelService, type MemoryAnchorFeedPage } from '../anchors/anchor-read-model.service';
import { PetChatMemoryService } from './pet-chat-memory.service';

describe('PetChatMemoryService', () => {
  const anchors = { listFeed: jest.fn() };
  let service: PetChatMemoryService;
  const page = (version = 1, excerpt = '日记记录了一次海边散步。'): MemoryAnchorFeedPage => ({
    page: 1, pageSize: 10, tagId: null, total: 1,
    items: [{
      id: 'diary:a1', anchorId: 'a1', sourceType: 'diary', tagId: 'mountains',
      title: '海边', displayDate: '2026-10-27T00:00:00.000Z', excerpt,
      correction: '展示纠正不能发送', diary: { id: 'd1', version, coverPhotoId: 'p1' },
    }],
  });
  beforeEach(() => {
    jest.clearAllMocks();
    service = new PetChatMemoryService(anchors as unknown as AnchorReadModelService);
  });

  test('revalidates owner and source on cache hits and never sends corrections', async () => {
    anchors.listFeed.mockResolvedValue(page());
    const first = await service.getContext('device-a');
    expect(await service.getContext('device-a')).toBe(first);
    expect(anchors.listFeed).toHaveBeenCalledTimes(2);
    expect(anchors.listFeed).toHaveBeenCalledWith({ page: 1, pageSize: 10, sourceType: 'diary' }, 'device-a');
    expect(first).not.toContain('展示纠正');
    expect(first).toContain('海边散步');
  });

  test('replaces modified memories and removes deleted memories before cache expiry', async () => {
    anchors.listFeed.mockResolvedValueOnce(page()).mockResolvedValueOnce(page(2, '新版本已经改成山间散步。'))
      .mockResolvedValueOnce({ ...page(), items: [], total: 0 });
    await service.getContext('device-a');
    expect(await service.getContext('device-a')).toContain('新版本');
    expect(await service.getContext('device-a')).toBe('');
  });

  test('never serves another owner or a stale cached result when validation fails', async () => {
    anchors.listFeed.mockResolvedValueOnce(page())
      .mockResolvedValueOnce({ ...page(), items: [], total: 0 })
      .mockRejectedValueOnce(new Error('unavailable'));
    await service.getContext('device-a');
    expect(await service.getContext('device-b')).toBe('');
    await expect(service.getContext('device-a')).rejects.toThrow('unavailable');
  });
});
