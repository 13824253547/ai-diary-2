import { Module } from '@nestjs/common';
import { PhotoAssetService } from './photo-asset.service';
import { PhotosController } from './photos.controller';

@Module({
  controllers: [PhotosController],
  providers: [PhotoAssetService],
  exports: [PhotoAssetService],
})
export class PhotosModule {}
