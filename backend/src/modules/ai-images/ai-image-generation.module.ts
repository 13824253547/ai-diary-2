import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module';
import { AIImageGenerationController } from './ai-image-generation.controller';
import { AIImageGenerationService } from './ai-image-generation.service';
import { ArkSeedreamImageProvider } from './ark-seedream-image-provider';

@Module({
  imports: [PhotosModule],
  controllers: [AIImageGenerationController],
  providers: [ArkSeedreamImageProvider, AIImageGenerationService],
})
export class AIImageGenerationModule {}
