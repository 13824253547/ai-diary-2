import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { AnchorReadModelService } from './anchor-read-model.service';

function harness() {
  const sources = Array.from({ length: 12 }, (_, index) => {
    const turnIndex = Math.floor(index / 2);
    const conversationId = turnIndex < 3 ? 'chat-a' : 'chat-b';
    const role = index % 2 === 0 ? 'user' : 'assistant';
    const userMessageId = `message-${turnIndex * 2}`;
    const assistantMessageId = `message-${turnIndex * 2 + 1}`;
    return {
      ownerDeviceId: 'device-1', conversationId, messageId: `message-${index}`, localDate: '2026-10-27',
      message: {
        id: `message-${index}`, conversationId, requestId: `request-${turnIndex}`,
        role, text: turnIndex === 3 ? '金色的海面' : `source-${index}`,
        order: index, createdAt: new Date(Date.UTC(2026, 9, 27, 8, turnIndex)),
      },
      turn: {
        ownerDeviceId: 'device-1', conversationId, memoryAnchorBatchId: 'batch-1',
        memoryEligible: true, status: 'completed', source: 'provider', deviceLocalDate: '2026-10-27',
        userMessageId, assistantMessageId, requestId: `request-${turnIndex}`, sequence: turnIndex + 1,
        createdAt: new Date(Date.UTC(2026, 9, 27, 8, turnIndex)),
        conversation: { ownerDeviceId: 'device-1' },
      },
    };
  });
  const batch = {
    id: 'batch-1', sourceCount: sources.length, sourceDateStart: '2026-10-27',
    sourceDateEnd: '2026-10-27', sources,
    sourceHash: createHash('sha256').update(JSON.stringify(sources.map(({ message: m }) =>
      [m.id, m.conversationId, m.requestId, m.role, m.text]))).digest('hex'),
  };
  const findFirst = jest.fn().mockResolvedValue(batch);
  const tx = { chatDailyAnchor: { findFirst } };
  const prisma = { $transaction: jest.fn(async (operation: any) => operation(tx)) } as unknown as PrismaService;
  return { batch, findFirst, prisma, service: new AnchorReadModelService(prisma) };
}

describe('Chat anchor complete history', () => {
  test('returns all conversations over fixed-size pages without truncating the second source', async () => {
    const h = harness();
    const first = await h.service.getChatHistory('batch-1', { page: 1, pageSize: 10 }, 'device-1');
    const second = await h.service.getChatHistory('batch-1', { page: 2, pageSize: 10 }, 'device-1');
    expect(first.total).toBe(12);
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(2);
    expect([...first.items, ...second.items].map(item => item.id)).toEqual(h.batch.sources.map(s => s.messageId));
    expect(first.items.some(item => item.text === '金色的海面' && item.conversationId === 'chat-b')).toBe(true);
    expect(h.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'batch-1', ownerDeviceId: 'device-1', status: 'succeeded' },
    }));
  });

  test('does not return another device batch', async () => {
    const h = harness();
    h.findFirst.mockResolvedValueOnce(null);
    await expect(h.service.getChatHistory('batch-1', { page: 1, pageSize: 100 }, 'device-2'))
      .rejects.toMatchObject({ code: 'not_found' });
    expect(h.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'batch-1', ownerDeviceId: 'device-2', status: 'succeeded' },
    }));
  });

  test.each(['count', 'owner', 'message', 'turn', 'date'])('rejects unavailable or mismatched sources: %s', async kind => {
    const h = harness();
    if (kind === 'count') h.batch.sourceCount += 1;
    if (kind === 'owner') h.batch.sources[0].turn.conversation.ownerDeviceId = 'device-2';
    if (kind === 'message') h.batch.sources[0].message.conversationId = 'foreign-chat';
    if (kind === 'turn') h.batch.sources[0].turn.status = 'failed';
    if (kind === 'date') h.batch.sources[0].localDate = '2026-10-28';
    await expect(h.service.getChatHistory('batch-1', { page: 1, pageSize: 100 }, 'device-1'))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  test('rejects source changes rather than showing a different history for an old summary', async () => {
    const h = harness();
    h.batch.sources[0].message.text = 'changed text';
    await expect(h.service.getChatHistory('batch-1', { page: 1, pageSize: 100 }, 'device-1'))
      .rejects.toMatchObject({ code: 'version_conflict' });
  });

  test('validates pagination before accessing the database', async () => {
    const h = harness();
    await expect(h.service.getChatHistory('batch-1', { page: 1, pageSize: 15 }, 'device-1'))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
});
