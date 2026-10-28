import { appConfig } from '../config/app-config';

export function resolveDiscoveryMediaUri(uri: string) {
  if (!uri || /^(https?:|file:|content:|data:)/iu.test(uri)) return uri;
  const baseUrl = appConfig.backendBaseUrl.replace(/\/+$/u, '');
  const path = uri.startsWith('/') ? uri : `/${uri}`;
  if (path.startsWith('/api/')) {
    return `${baseUrl.replace(/\/api$/u, '')}${path}`;
  }
  return `${baseUrl}${path}`;
}
