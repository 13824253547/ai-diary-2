import { appConfig } from '../../config/app-config';
import { HttpCoreDiaryRepository } from '../../repositories/http-core-diary-repository';
import { ApiClient } from '../../services/api-client';
import { getAccountAuthHeaders } from '../../services/account-auth';

export function createBackendCoreDiaryRepository() {
  return new HttpCoreDiaryRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getAccountAuthHeaders,
    }),
  );
}
