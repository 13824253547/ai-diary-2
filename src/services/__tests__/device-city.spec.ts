import * as Location from 'expo-location';
import { DeviceCityError, getCurrentDeviceCity } from '../device-city';

jest.mock('expo-location', () => ({
  Accuracy: { Low: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

describe('getCurrentDeviceCity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requests a low-accuracy foreground fix and reverse-geocodes the city', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
      coords: { latitude: 24.16, longitude: 120.65 },
    } as never);
    jest.mocked(Location.reverseGeocodeAsync).mockResolvedValue([{ city: '台中市' }] as never);

    await expect(getCurrentDeviceCity()).resolves.toBe('台中市');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Low });
    expect(Location.reverseGeocodeAsync).toHaveBeenCalledWith({ latitude: 24.16, longitude: 120.65 });
  });

  test('requests foreground permission only when needed and stops when denied', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: false } as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ granted: false } as never);

    await expect(getCurrentDeviceCity()).rejects.toMatchObject({
      code: 'permission_denied',
    } satisfies Partial<DeviceCityError>);
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  test('does not invent a city when reverse geocoding has no city result', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
      coords: { latitude: 24.16, longitude: 120.65 },
    } as never);
    jest.mocked(Location.reverseGeocodeAsync).mockResolvedValue([{ city: null }] as never);

    await expect(getCurrentDeviceCity()).rejects.toMatchObject({
      code: 'city_unavailable',
    } satisfies Partial<DeviceCityError>);
  });
});
