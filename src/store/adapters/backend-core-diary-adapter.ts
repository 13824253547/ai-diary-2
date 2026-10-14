import { appConfig } from '../../config/app-config';
import { HttpCoreDiaryRepository } from '../../repositories/http-core-diary-repository';
import { ApiClient } from '../../services/api-client';
import { ensureDeviceIdentity } from '../../services/device-identity';

export function createBackendCoreDiaryRepository() {
  return new HttpCoreDiaryRepository(
    new ApiClient({
      baseUrl: appConfig.backendBaseUrl,
      getHeaders: async () => ({
        'x-device-id': await ensureDeviceIdentity(),
      }),
    }),
  );
}
