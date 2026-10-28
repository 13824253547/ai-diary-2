import { Module } from '@nestjs/common';
import { AnchorCorrectionsController } from './anchor-corrections.controller';
import { AnchorCorrectionsService } from './anchor-corrections.service';
import { AnchorReadModelController } from './anchor-read-model.controller';
import { AnchorReadModelService } from './anchor-read-model.service';
import { ArkMemoryAnchorProvider } from './ark-memory-anchor-provider';
import { ChatDailyAnchorService } from './chat-daily-anchor.service';
import { DiaryAnchorGenerationService } from './diary-anchor-generation.service';

@Module({
  controllers: [AnchorCorrectionsController, AnchorReadModelController],
  providers: [
    AnchorCorrectionsService,
    AnchorReadModelService,
    ArkMemoryAnchorProvider,
    ChatDailyAnchorService,
    DiaryAnchorGenerationService,
  ],
  exports: [
    AnchorCorrectionsService,
    AnchorReadModelService,
    ChatDailyAnchorService,
    DiaryAnchorGenerationService,
  ],
})
export class AnchorCorrectionsModule {}
