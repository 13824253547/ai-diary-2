import { Module } from '@nestjs/common';
import { AnchorCorrectionsModule } from '../anchors/anchor-corrections.module';
import { ArkPetChatProvider } from './ark-pet-chat-provider';
import { ChatSessionsController } from './chat-sessions.controller';
import { ChatSessionsService } from './chat-sessions.service';
import { PetChatMemoryService } from './pet-chat-memory.service';

@Module({
  imports: [AnchorCorrectionsModule],
  controllers: [ChatSessionsController],
  providers: [ArkPetChatProvider, ChatSessionsService, PetChatMemoryService],
})
export class ChatSessionsModule {}
