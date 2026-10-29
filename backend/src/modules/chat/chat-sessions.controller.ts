import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DeviceAiTaskCoordinator } from '../../common/device-ai-task-coordinator';
import { resolveDeviceId } from '../../common/device-identity';
import { ChatDailyAnchorService } from '../anchors/chat-daily-anchor.service';
import { ArkPetChatProvider, PetChatProviderError } from './ark-pet-chat-provider';
import { PetChatMemoryService } from './pet-chat-memory.service';
import {
  classifyPetChatInput,
  classifyPetChatReply,
  getPetChatPolicyMessage,
} from './pet-chat-safety-policy';
import {
  CHAT_PAGE_SIZES,
  ChatSessionError,
  ChatSessionsService,
  type ChatConversationSnapshot,
} from './chat-sessions.service';

type BeginTurnBody = {
  requestId?: unknown;
  userMessageId?: unknown;
  text?: unknown;
  deviceLocalDate?: unknown;
};

type CompleteTurnBody = {
  attempt?: unknown;
  assistantMessageId?: unknown;
  text?: unknown;
  source?: unknown;
  providerRequestId?: unknown;
};

type FailTurnBody = {
  attempt?: unknown;
  failureCode?: unknown;
};

type RetryTurnBody = {
  nextAttempt?: unknown;
};

type GenerateReplyBody = {
  attempt?: unknown;
};

export type ChatStreamResponse = Pick<
  ServerResponse,
  'write' | 'end' | 'destroyed' | 'writableEnded'
> & {
  status(code: number): ChatStreamResponse;
  set(headers: Record<string, string>): ChatStreamResponse;
  flushHeaders(): void;
};

function parseDecimalIntegerParam(value: unknown, defaultValue: number): number | null {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

@Controller('chat')
export class ChatSessionsController {
  private readonly generatingTurns = new Map<string, Promise<ChatConversationSnapshot>>();
  private readonly activeDeviceGenerations = new Map<string, {
    flightKey: string;
    conversationId: string;
    requestId: string;
  }>();

  constructor(
    private readonly service: ChatSessionsService,
    private readonly provider: ArkPetChatProvider,
    private readonly taskCoordinator: DeviceAiTaskCoordinator,
    private readonly dailyAnchors: ChatDailyAnchorService,
    private readonly memories: PetChatMemoryService,
  ) {}

  @Get('conversations')
  async listConversations(
    @Query('page') pageParam?: unknown,
    @Query('pageSize') pageSizeParam?: unknown,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    const page = parseDecimalIntegerParam(pageParam, 1);
    const pageSize = parseDecimalIntegerParam(pageSizeParam, 20);
    if (page === null || page < 1 || pageSize === null
      || !CHAT_PAGE_SIZES.includes(pageSize as typeof CHAT_PAGE_SIZES[number])) {
      throw this.invalidInput('会话分页条件无效。');
    }
    try {
      return {
        ok: true,
        version: 'pet-chat-v1',
        data: await this.service.listConversations({ page, pageSize }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('conversations/:conversationId')
  async getConversation(
    @Param('conversationId') conversationId: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      return {
        ok: true,
        version: 'pet-chat-v1',
        data: await this.service.getConversation(conversationId, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('conversations/:conversationId/turns/:requestId/generate/stream')
  async streamReply(
    @Param('conversationId') conversationId: string,
    @Param('requestId') requestId: string,
    @Body() body: GenerateReplyBody,
    @Headers('x-device-id') deviceId: string | undefined,
    @Res() response: ChatStreamResponse,
  ): Promise<void> {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.attempt !== 'number' || !Number.isSafeInteger(body.attempt) || body.attempt < 1) {
      throw this.invalidInput('聊天请求轮次无效。');
    }

    response.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    const writeEvent = (event: string, data: unknown) => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    const flightKey = `${ownerDeviceId}:${conversationId}:${requestId}:${body.attempt}`;
    const existingFlight = this.generatingTurns.get(flightKey);

    try {
      const conversation = existingFlight
        ? await existingFlight
        : await this.startGenerationFlight(
            flightKey,
            conversationId,
            requestId,
            body.attempt,
            ownerDeviceId,
            text => writeEvent('delta', { text }),
          );
      const turn = conversation.turns.find(item => item.requestId === requestId);
      if (turn?.status === 'completed') {
        writeEvent('complete', { ok: true, version: 'pet-chat-v1', data: conversation });
      } else {
        writeEvent('error', { code: turn?.failureCode ?? 'provider_failed' });
      }
    } catch (error) {
      const code = error instanceof ChatSessionError
        ? error.code
        : error instanceof PetChatProviderError
          ? error.failureCode
          : 'provider_failed';
      writeEvent('error', { code });
    } finally {
      if (!response.writableEnded) response.end();
    }
  }

  @Post('conversations/:conversationId/turns/:requestId/generate')
  async generateReply(
    @Param('conversationId') conversationId: string,
    @Param('requestId') requestId: string,
    @Body() body: GenerateReplyBody,
    @Headers('x-device-id') deviceId?: string,
  ): Promise<{ ok: true; version: 'pet-chat-v1'; data: ChatConversationSnapshot }> {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.attempt !== 'number' || !Number.isSafeInteger(body.attempt) || body.attempt < 1) {
      throw this.invalidInput('聊天请求轮次无效。');
    }

    const flightKey = `${ownerDeviceId}:${conversationId}:${requestId}:${body.attempt}`;
    const existingFlight = this.generatingTurns.get(flightKey);
    if (existingFlight) {
      const data = await existingFlight;
      return { ok: true, version: 'pet-chat-v1', data };
    }

    try {
      const data = await this.startGenerationFlight(
        flightKey,
        conversationId,
        requestId,
        body.attempt,
        ownerDeviceId,
      );
      return { ok: true, version: 'pet-chat-v1', data };
    } catch (error) {
      this.handleError(error);
    }
  }

  private async startGenerationFlight(
    flightKey: string,
    conversationId: string,
    requestId: string,
    attempt: number,
    ownerDeviceId: string,
    onTextDelta?: (text: string) => void,
  ) {
    const existing = this.generatingTurns.get(flightKey);
    if (existing) return existing;
    const active = this.activeDeviceGenerations.get(ownerDeviceId);
    if (active && active.flightKey !== flightKey) {
      throw new ChatSessionError('chat_busy', '该设备已有一条小橘回复正在生成，请稍后再试。');
    }
    const flight = this.taskCoordinator.runInteractive(
      ownerDeviceId,
      () => this.generateReplyOnce(conversationId, requestId, attempt, ownerDeviceId, onTextDelta),
    );
    this.generatingTurns.set(flightKey, flight);
    this.activeDeviceGenerations.set(ownerDeviceId, { flightKey, conversationId, requestId });
    let completed: ChatConversationSnapshot | undefined;
    try {
      completed = await flight;
      return completed;
    } finally {
      if (this.generatingTurns.get(flightKey) === flight) {
        this.generatingTurns.delete(flightKey);
      }
      if (this.activeDeviceGenerations.get(ownerDeviceId)?.flightKey === flightKey) {
        this.activeDeviceGenerations.delete(ownerDeviceId);
      }
      const turn = completed?.turns.find(item => item.requestId === requestId);
      if (turn?.status === 'completed' && turn.source === 'provider' && turn.deviceLocalDate) {
        this.dailyAnchors.enqueueAfterCompletedTurn(ownerDeviceId, turn.deviceLocalDate);
      }
    }
  }

  private assertDeviceCanBeginTurn(ownerDeviceId: string, conversationId: string, requestId: string) {
    const active = this.activeDeviceGenerations.get(ownerDeviceId);
    if (active && (active.conversationId !== conversationId || active.requestId !== requestId)) {
      throw new ChatSessionError('chat_busy', '该设备已有一条小橘回复正在生成，请稍后再发送。');
    }
  }

  private async generateReplyOnce(
    conversationId: string,
    requestId: string,
    attempt: number,
    ownerDeviceId: string,
    onTextDelta?: (text: string) => void,
  ): Promise<ChatConversationSnapshot> {
    const snapshot = await this.service.getConversation(conversationId, ownerDeviceId);
    const turn = snapshot.turns.find(item => item.requestId === requestId);
    if (!turn) throw new ChatSessionError('not_found', '聊天请求不存在。');
    if (turn.status === 'completed') return snapshot;
    if (turn.status !== 'pending' || turn.attempt !== attempt) {
      throw new ChatSessionError('version_conflict', '聊天请求已更新，请重新读取后再生成回复。');
    }
    const currentUserMessage = snapshot.messages.find(
      message => message.requestId === requestId && message.role === 'user',
    );
    if (!currentUserMessage) throw new ChatSessionError('not_found', '聊天请求没有对应的用户消息。');
    const currentPolicyCode = classifyPetChatInput(currentUserMessage.text);
    if (currentPolicyCode) {
      await this.service.discardPolicyBlockedTurn({
        conversationId,
        requestId,
        attempt,
      }, ownerDeviceId);
      throw new ChatSessionError(currentPolicyCode, getPetChatPolicyMessage(currentPolicyCode));
    }

    try {
      const completedRequestIds = new Set(
        snapshot.turns
          .filter(item => item.status === 'completed')
          .filter(item => {
            const turnMessages = snapshot.messages.filter(message => message.requestId === item.requestId);
            return turnMessages.length === 2 && turnMessages.every(message =>
              message.role === 'user'
                ? classifyPetChatInput(message.text) === undefined
                : classifyPetChatReply(message.text) === undefined,
            );
          })
          .map(item => item.requestId),
      );
      const trustedContext = snapshot.messages
        .filter(message => message.requestId === requestId || completedRequestIds.has(message.requestId))
        .map(message => ({
        role: message.role,
        content: message.text,
        }));
      // Unavailable memory is not evidence of an empty diary history; continue without claims.
      const memoryContext = await this.memories.getContext(ownerDeviceId).catch(() => '');
      const reply = await this.provider.reply(trustedContext, onTextDelta, memoryContext);
      return this.service.completeGeneratedTurn({
        conversationId,
        requestId,
        attempt,
        assistantMessageId: randomUUID(),
        text: reply.text,
        source: 'provider',
        providerRequestId: reply.providerRequestId,
      }, ownerDeviceId);
    } catch (error) {
      if (!(error instanceof PetChatProviderError)) throw error;
      if (error.failureCode === 'out_of_scope' || error.failureCode === 'unsafe_request') {
        await this.service.discardPolicyBlockedTurn({
          conversationId,
          requestId,
          attempt,
        }, ownerDeviceId);
        throw new ChatSessionError(error.failureCode, getPetChatPolicyMessage(error.failureCode));
      }
      return this.service.failTurn({
        conversationId,
        requestId,
        attempt,
        failureCode: error.failureCode,
      }, ownerDeviceId);
    }
  }

  @Post('conversations/:conversationId/turns')
  async beginTurn(
    @Param('conversationId') conversationId: string,
    @Body() body: BeginTurnBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.requestId !== 'string'
      || typeof body.userMessageId !== 'string'
      || typeof body.text !== 'string'
      || (body.deviceLocalDate !== undefined && typeof body.deviceLocalDate !== 'string')) {
      throw this.invalidInput('消息请求信息不完整。');
    }
    try {
      this.assertDeviceCanBeginTurn(ownerDeviceId, conversationId, body.requestId);
      return {
        ok: true,
        version: 'pet-chat-v1',
        data: await this.service.beginTurn({
          conversationId,
          requestId: body.requestId,
          userMessageId: body.userMessageId,
          text: body.text,
          deviceLocalDate: body.deviceLocalDate as string | undefined,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('conversations/:conversationId/turns/:requestId/reply')
  async completeTurn(
    @Param('conversationId') conversationId: string,
    @Param('requestId') requestId: string,
    @Body() body: CompleteTurnBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.attempt !== 'number'
      || typeof body.assistantMessageId !== 'string'
      || typeof body.text !== 'string'
      || (body.source !== 'mock' && body.source !== 'provider')
      || (body.providerRequestId !== undefined && typeof body.providerRequestId !== 'string')) {
      throw this.invalidInput('回复结果信息不完整。');
    }
    try {
      return {
        ok: true,
        version: 'pet-chat-v1',
        data: await this.service.completeTurn({
          conversationId,
          requestId,
          attempt: body.attempt,
          assistantMessageId: body.assistantMessageId,
          text: body.text,
          source: body.source,
          providerRequestId: body.providerRequestId,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('conversations/:conversationId/turns/:requestId/failure')
  async failTurn(
    @Param('conversationId') conversationId: string,
    @Param('requestId') requestId: string,
    @Body() body: FailTurnBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.attempt !== 'number'
      || (body.failureCode !== 'timeout'
        && body.failureCode !== 'cancelled'
        && body.failureCode !== 'provider_failed')) {
      throw this.invalidInput('失败状态信息无效。');
    }
    try {
      return {
        ok: true,
        version: 'pet-chat-v1',
        data: await this.service.failTurn({
          conversationId,
          requestId,
          attempt: body.attempt,
          failureCode: body.failureCode,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('conversations/:conversationId/turns/:requestId/retry')
  async retryTurn(
    @Param('conversationId') conversationId: string,
    @Param('requestId') requestId: string,
    @Body() body: RetryTurnBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.nextAttempt !== 'number') {
      throw this.invalidInput('重试轮次无效。');
    }
    try {
      this.assertDeviceCanBeginTurn(ownerDeviceId, conversationId, requestId);
      return {
        ok: true,
        version: 'pet-chat-v1',
        data: await this.service.retryTurn({
          conversationId,
          requestId,
          nextAttempt: body.nextAttempt,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  private invalidInput(message: string) {
    return new BadRequestException({
      ok: false,
      error: { code: 'invalid_input', message, retryable: false },
    });
  }

  private handleError(error: unknown): never {
    if (error instanceof ChatSessionError) {
      const payload = {
        ok: false,
        error: { code: error.code, message: error.message, retryable: false },
      };
      if (error.code === 'not_found') throw new NotFoundException(payload);
      if (error.code === 'permission_denied') throw new ForbiddenException(payload);
      if (error.code === 'version_conflict' || error.code === 'chat_busy') throw new ConflictException(payload);
      if (error.code === 'provider_failed') throw new ServiceUnavailableException(payload);
      throw new BadRequestException(payload);
    }
    throw error;
  }
}
