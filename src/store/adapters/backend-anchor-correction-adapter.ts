import { appConfig } from '../../config/app-config';
import { HttpAnchorCorrectionRepository } from '../../repositories/http-anchor-correction-repository';
import { ApiClient } from '../../services/api-client';
import { getAccountAuthHeaders } from '../../services/account-auth';

export function createBackendAnchorCorrectionRepository() {
  return new HttpAnchorCorrectionRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getAccountAuthHeaders,
    }),
  );
}
