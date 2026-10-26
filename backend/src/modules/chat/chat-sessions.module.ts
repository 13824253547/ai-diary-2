import { Module } from '@nestjs/common';
import { ArkPetChatProvider } from './ark-pet-chat-provider';
import { ChatSessionsController } from './chat-sessions.controller';
import { ChatSessionsService } from './chat-sessions.service';

@Module({
  controllers: [ChatSessionsController],
  providers: [ArkPetChatProvider, ChatSessionsService],
})
export class ChatSessionsModule {}
