import { appConfig } from '../../config/app-config';
import { HttpDiscoveryRepository } from '../../repositories/http-discovery-repository';
import { ApiClient } from '../../services/api-client';
import { getAccountAuthHeaders } from '../../services/account-auth';

export function createBackendDiscoveryRepository() {
  return new HttpDiscoveryRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getAccountAuthHeaders,
    }),
  );
}
