import { appConfig } from '../../config/app-config';
import { HttpAnchorReadModelRepository } from '../../repositories/http-anchor-read-model-repository';
import { ApiClient } from '../../services/api-client';
import { getAccountAuthHeaders } from '../../services/account-auth';

export function createBackendAnchorReadModelRepository() {
  return new HttpAnchorReadModelRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getAccountAuthHeaders,
    }),
  );
}
