import { Injectable } from '@nestjs/common';
import { PhotoAssetError, PhotoAssetService } from '../photos/photo-asset.service';
import { ArkPostcardMessageProvider, PostcardMessageProviderError } from './ark-postcard-message-provider';

export const POSTCARD_MESSAGE_CONTRACT_VERSION = 'postcard-message-v1';

export type PostcardMessageRequest = {
  version: typeof POSTCARD_MESSAGE_CONTRACT_VERSION;
  photoId: string;
  location: string;
};

@Injectable()
export class PostcardMessageService {
  constructor(
    private readonly provider: ArkPostcardMessageProvider,
    private readonly assets: PhotoAssetService,
  ) {}

  async generate(ownerDeviceId: string, request: PostcardMessageRequest, signal?: AbortSignal) {
    const photo = await this.assets.readMaterialPhoto(ownerDeviceId, request.photoId);
    const message = await this.provider.generate(photo, request.location, signal);
    if (!message || /[\r\n\u2028\u2029]/u.test(message) || Array.from(message).length > 12) {
      throw new PostcardMessageProviderError('invalid_response');
    }
    return { message };
  }
}

export { PhotoAssetError, PostcardMessageProviderError };
