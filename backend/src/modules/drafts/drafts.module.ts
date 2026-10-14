import { Module } from '@nestjs/common';
import { DraftsController } from './drafts.controller';

@Module({
  controllers: [DraftsController],
})
export class DraftsModule {}
