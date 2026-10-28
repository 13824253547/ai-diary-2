import { Module } from '@nestjs/common';
import { AnchorCorrectionsModule } from '../anchors/anchor-corrections.module';
import { ArkGrowthInsightProvider } from './ark-growth-insight-provider';
import { GrowthInsightsController } from './growth-insights.controller';
import { GrowthInsightsService } from './growth-insights.service';

@Module({
  imports: [AnchorCorrectionsModule],
  controllers: [GrowthInsightsController],
  providers: [ArkGrowthInsightProvider, GrowthInsightsService],
  exports: [GrowthInsightsService],
})
export class GrowthInsightsModule {}
