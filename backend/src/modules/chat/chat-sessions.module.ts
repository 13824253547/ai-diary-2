import { Module } from '@nestjs/common';
import { AnchorCorrectionsModule } from '../anchors/anchor-corrections.module';
import { ArkPetChatProvider } from './ark-pet-chat-provider';
import { ChatSessionsController } from './chat-sessions.controller';
import { ChatSessionsService } from './chat-sessions.service';

@Module({
  imports: [AnchorCorrectionsModule],
  controllers: [ChatSessionsController],
  providers: [ArkPetChatProvider, ChatSessionsService],
})
export class ChatSessionsModule {}
