import { Global, Module } from '@nestjs/common';
import { DiaryGenerationService } from './diary-generation.service';
import { DeviceAiTaskCoordinator } from './device-ai-task-coordinator';
import { MemoryStoreService } from './memory-store.service';
import { PrismaService } from './prisma.service';
import { TemporaryGenerationPhotoStore } from './temporary-generation-photo-store';

@Global()
@Module({
  providers: [PrismaService, DiaryGenerationService, DeviceAiTaskCoordinator, TemporaryGenerationPhotoStore, MemoryStoreService],
  exports: [PrismaService, DiaryGenerationService, DeviceAiTaskCoordinator, TemporaryGenerationPhotoStore, MemoryStoreService],
})
export class CommonServicesModule {}
