import { appConfig } from '../../config/app-config';
import { HttpGrowthInsightRepository } from '../../repositories/http-growth-insight-repository';
import { ApiClient } from '../../services/api-client';
import { getAccountAuthHeaders } from '../../services/account-auth';

export function createBackendGrowthInsightRepository() {
  return new HttpGrowthInsightRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getAccountAuthHeaders,
    }),
  );
}
