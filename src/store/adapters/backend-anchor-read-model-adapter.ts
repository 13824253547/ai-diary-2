import { appConfig } from '../../config/app-config';
import { HttpAnchorReadModelRepository } from '../../repositories/http-anchor-read-model-repository';
import { ApiClient } from '../../services/api-client';
import { ensureDeviceIdentity } from '../../services/device-identity';

export function createBackendAnchorReadModelRepository() {
  return new HttpAnchorReadModelRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: async () => ({
        'x-device-id': await ensureDeviceIdentity(),
      }),
    }),
  );
}
