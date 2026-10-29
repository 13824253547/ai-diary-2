export const appConfig = {
  appName: 'AI旅行日记',
  mode: 'service-backed',
  description: 'AI Travel Diary uses device data and configured backend services; unavailable providers fail closed.',
  backendBaseUrl: 'https://www.comiaite.com/api',
  backendEnabled: true,
  identityMode: 'installation' as 'installation' | 'attested',
};
