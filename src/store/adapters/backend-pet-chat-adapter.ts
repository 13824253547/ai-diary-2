import { appConfig } from '../../config/app-config';
import { HttpPetChatRepository } from '../../repositories/http-pet-chat-repository';
import { ApiClient } from '../../services/api-client';
import { ensureDeviceIdentity } from '../../services/device-identity';

export function createBackendPetChatRepository() {
  return new HttpPetChatRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: async () => ({
        'x-device-id': await ensureDeviceIdentity(),
      }),
    }),
  );
}
