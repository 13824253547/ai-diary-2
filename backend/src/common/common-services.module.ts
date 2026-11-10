import { Global, Module } from '@nestjs/common';
import { DiaryGenerationService } from './diary-generation.service';
import { AccountAiTaskCoordinator } from './account-ai-task-coordinator';
import { MemoryStoreService } from './memory-store.service';
import { PrismaService } from './prisma.service';
import { TemporaryGenerationPhotoStore } from './temporary-generation-photo-store';

@Global()
@Module({
  providers: [PrismaService, DiaryGenerationService, AccountAiTaskCoordinator, TemporaryGenerationPhotoStore, MemoryStoreService],
  exports: [PrismaService, DiaryGenerationService, AccountAiTaskCoordinator, TemporaryGenerationPhotoStore, MemoryStoreService],
})
export class CommonServicesModule {}
