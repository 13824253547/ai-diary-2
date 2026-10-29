import { appConfig } from '../config/app-config';
import { getDeviceIdentityHeaders } from './device-identity';

export function resolveDiscoveryMediaUri(uri: string) {
  if (!uri || /^(https?:|file:|content:|data:)/iu.test(uri)) return uri;
  const baseUrl = appConfig.backendBaseUrl.replace(/\/+$/u, '');
  const path = uri.startsWith('/') ? uri : `/${uri}`;
  if (path.startsWith('/api/')) {
    return `${baseUrl.replace(/\/api$/u, '')}${path}`;
  }
  return `${baseUrl}${path}`;
}

function requiresBackendIdentity(uri: string) {
  try {
    const media = new URL(uri);
    const backend = new URL(appConfig.backendBaseUrl);
    const apiPath = backend.pathname.replace(/\/+$/u, '');
    return media.origin === backend.origin
      && media.pathname.startsWith(`${apiPath}/photos/discovery/`);
  } catch {
    return false;
  }
}

export async function createDiscoveryMediaSource(uri: string) {
  const resolvedUri = resolveDiscoveryMediaUri(uri);
  if (!resolvedUri) return undefined;
  if (!requiresBackendIdentity(resolvedUri)) return { uri: resolvedUri };
  return {
    uri: resolvedUri,
    headers: await getDeviceIdentityHeaders(),
  };
}
