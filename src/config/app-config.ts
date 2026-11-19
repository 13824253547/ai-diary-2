const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim();

export const appConfig = {
  appName: '橙光AI日记',
  mode: 'service-backed',
  description: 'Orange Glow AI Diary uses device data and configured backend services; unavailable providers fail closed.',
  backendBaseUrl: backendBaseUrl || 'https://www.comiaite.com/api',
  backendEnabled: true,
};
