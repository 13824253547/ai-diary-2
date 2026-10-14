import { Module } from '@nestjs/common';
import { SharingController } from './sharing.controller';

@Module({
  controllers: [SharingController],
})
export class SharingModule {}
