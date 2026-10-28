import { Module } from '@nestjs/common';
import { AnchorCorrectionsModule } from '../anchors/anchor-corrections.module';
import { PhotosModule } from '../photos/photos.module';
import { DiariesController } from './diaries.controller';
import { GrowthInsightsModule } from '../growth/growth-insights.module';

@Module({
  imports: [AnchorCorrectionsModule, GrowthInsightsModule, PhotosModule],
  controllers: [DiariesController],
})
export class DiariesModule {}
