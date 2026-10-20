import { Module } from '@nestjs/common';
import { ChatSessionsController } from './chat-sessions.controller';
import { ChatSessionsService } from './chat-sessions.service';

@Module({
  controllers: [ChatSessionsController],
  providers: [ChatSessionsService],
})
export class ChatSessionsModule {}
