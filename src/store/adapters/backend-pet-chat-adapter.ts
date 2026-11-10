import { appConfig } from '../../config/app-config';
import { HttpPetChatRepository } from '../../repositories/http-pet-chat-repository';
import { ApiClient } from '../../services/api-client';
import { getAccountAuthHeaders } from '../../services/account-auth';

export function createBackendPetChatRepository() {
  return new HttpPetChatRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getAccountAuthHeaders,
    }),
  );
}
