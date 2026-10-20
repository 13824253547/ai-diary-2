import { Module } from '@nestjs/common';
import { AnchorCorrectionsController } from './anchor-corrections.controller';
import { AnchorCorrectionsService } from './anchor-corrections.service';
import { AnchorReadModelController } from './anchor-read-model.controller';
import { AnchorReadModelService } from './anchor-read-model.service';

@Module({
  controllers: [AnchorCorrectionsController, AnchorReadModelController],
  providers: [AnchorCorrectionsService, AnchorReadModelService],
})
export class AnchorCorrectionsModule {}
