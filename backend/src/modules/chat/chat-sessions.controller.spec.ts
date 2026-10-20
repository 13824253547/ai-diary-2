import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  ChatSessionError,
  ChatSessionsService,
} from './chat-sessions.service';
import { ChatSessionsController } from './chat-sessions.controller';

describe('ChatSessionsController', () => {
  const service = {
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    beginTurn: jest.fn(),
    completeTurn: jest.fn(),
    failTurn: jest.fn(),
    retryTurn: jest.fn(),
  } as unknown as ChatSessionsService;
  const controller = new ChatSessionsController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires device identity and forwards scoped conversation listing', async () => {
    jest.mocked(service.listConversations).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await expect(controller.listConversations(undefined, undefined, undefined))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listConversations(undefined, undefined, 'device-1'))
      .resolves.toMatchObject({
        ok: true,
        version: 'pet-chat-v1',
        data: { items: [], page: 1, pageSize: 20 },
      });
    expect(service.listConversations).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, 'device-1');
  });

  test('requires device identity before validating malformed query and turn input', async () => {
    await expect(controller.listConversations(['1', '2'], undefined, undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    await expect(controller.beginTurn('conversation-1', undefined as never, undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    expect(service.listConversations).not.toHaveBeenCalled();
    expect(service.beginTurn).not.toHaveBeenCalled();
  });

  test.each([
    ['0x10', undefined],
    ['1e1', undefined],
    ['1.0', undefined],
    [' 1', undefined],
    [undefined, '+20'],
    [['1', '2'], undefined],
    [undefined, ['10', '20']],
    [undefined, '15'],
  ])('rejects non-decimal or repeated pagination values (%j, %j)', async (page, pageSize) => {
    await expect(controller.listConversations(page, pageSize, 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.listConversations).not.toHaveBeenCalled();
  });

  test('rejects malformed turn bodies before persistence', async () => {
    await expect(controller.beginTurn('conversation-1', {
      requestId: 'request-1',
      text: 'A message',
    }, 'device-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.beginTurn).not.toHaveBeenCalled();
  });

  test('maps ownership and stale attempt errors to explicit HTTP responses', async () => {
    jest.mocked(service.completeTurn)
      .mockRejectedValueOnce(new ChatSessionError('permission_denied', 'forbidden'))
      .mockRejectedValueOnce(new ChatSessionError('version_conflict', 'stale'));
    const body = {
      attempt: 1,
      assistantMessageId: 'assistant-1',
      text: 'A reply',
      source: 'mock',
    };

    await expect(controller.completeTurn('conversation-1', 'request-1', body, 'device-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.completeTurn('conversation-1', 'request-1', body, 'device-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
