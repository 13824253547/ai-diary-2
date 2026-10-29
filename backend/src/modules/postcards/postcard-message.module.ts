import { Module } from '@nestjs/common';
import { PhotosModule } from '../photos/photos.module';
import { ArkPostcardMessageProvider } from './ark-postcard-message-provider';
import { PostcardMessageController } from './postcard-message.controller';
import { PostcardMessageService } from './postcard-message.service';

@Module({
  imports: [PhotosModule],
  controllers: [PostcardMessageController],
  providers: [ArkPostcardMessageProvider, PostcardMessageService],
})
export class PostcardMessageModule {}
