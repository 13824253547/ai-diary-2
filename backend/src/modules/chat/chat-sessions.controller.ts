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
  ServiceUnavailableException,
} from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import {
  CHAT_PAGE_SIZES,
  ChatSessionError,
  ChatSessionsService,
} from './chat-sessions.service';

type BeginTurnBody = {
  requestId?: unknown;
  userMessageId?: unknown;
  text?: unknown;
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

function parseDecimalIntegerParam(value: unknown, defaultValue: number): number | null {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

@Controller('chat')
export class ChatSessionsController {
  constructor(private readonly service: ChatSessionsService) {}

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

  @Post('conversations/:conversationId/turns')
  async beginTurn(
    @Param('conversationId') conversationId: string,
    @Body() body: BeginTurnBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.requestId !== 'string'
      || typeof body.userMessageId !== 'string'
      || typeof body.text !== 'string') {
      throw this.invalidInput('消息请求信息不完整。');
    }
    try {
      return {
        ok: true,
        version: 'pet-chat-v1',
        data: await this.service.beginTurn({
          conversationId,
          requestId: body.requestId,
          userMessageId: body.userMessageId,
          text: body.text,
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
      if (error.code === 'version_conflict') throw new ConflictException(payload);
      if (error.code === 'provider_failed') throw new ServiceUnavailableException(payload);
      throw new BadRequestException(payload);
    }
    throw error;
  }
}
