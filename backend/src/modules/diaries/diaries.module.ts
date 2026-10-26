import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module';
import { DiariesController } from './diaries.controller';

@Module({
  imports: [PhotosModule],
  controllers: [DiariesController],
})
export class DiariesModule {}
