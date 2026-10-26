import { Module } from '@nestjs/common';
import { GenerationController, GenerationIdentityGuard } from './generation.controller';

@Module({
  controllers: [GenerationController],
  providers: [GenerationIdentityGuard],
})
export class GenerationModule {}
