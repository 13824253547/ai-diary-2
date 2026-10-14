import { Global, Module } from '@nestjs/common';
import { DiaryGenerationService } from './diary-generation.service';
import { MemoryStoreService } from './memory-store.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, DiaryGenerationService, MemoryStoreService],
  exports: [PrismaService, DiaryGenerationService, MemoryStoreService],
})
export class CommonServicesModule {}
