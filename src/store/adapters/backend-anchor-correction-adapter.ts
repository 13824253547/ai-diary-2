import { appConfig } from '../../config/app-config';
import { HttpAnchorCorrectionRepository } from '../../repositories/http-anchor-correction-repository';
import { ApiClient } from '../../services/api-client';
import { getDeviceIdentityHeaders } from '../../services/device-identity';

export function createBackendAnchorCorrectionRepository() {
  return new HttpAnchorCorrectionRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: getDeviceIdentityHeaders,
    }),
  );
}
