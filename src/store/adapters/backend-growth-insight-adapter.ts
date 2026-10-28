import { appConfig } from '../../config/app-config';
import { HttpGrowthInsightRepository } from '../../repositories/http-growth-insight-repository';
import { ApiClient } from '../../services/api-client';
import { getDeviceIdentityHeaders } from '../../services/device-identity';

export function createBackendGrowthInsightRepository() {
  return new HttpGrowthInsightRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getDeviceIdentityHeaders,
    }),
  );
}
