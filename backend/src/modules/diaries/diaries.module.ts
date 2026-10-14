import { Module } from '@nestjs/common';
import { DiariesController } from './diaries.controller';

@Module({
  controllers: [DiariesController],
})
export class DiariesModule {}
