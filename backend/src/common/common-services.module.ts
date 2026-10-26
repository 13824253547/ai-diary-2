import { Global, Module } from '@nestjs/common';
import { DiaryGenerationService } from './diary-generation.service';
import { MemoryStoreService } from './memory-store.service';
import { PrismaService } from './prisma.service';
import { TemporaryGenerationPhotoStore } from './temporary-generation-photo-store';

@Global()
@Module({
  providers: [PrismaService, DiaryGenerationService, TemporaryGenerationPhotoStore, MemoryStoreService],
  exports: [PrismaService, DiaryGenerationService, TemporaryGenerationPhotoStore, MemoryStoreService],
})
export class CommonServicesModule {}
