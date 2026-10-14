import { Module } from '@nestjs/common';
import { MemoriesController } from './memories.controller';

@Module({
  controllers: [MemoriesController],
})
export class MemoriesModule {}
