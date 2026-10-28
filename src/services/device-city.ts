import * as Location from 'expo-location';

export class DeviceCityError extends Error {
  constructor(readonly code: 'permission_denied' | 'city_unavailable' | 'location_failed', message: string) {
    super(message);
  }
}

export async function getCurrentDeviceCity() {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      throw new DeviceCityError('permission_denied', '需要定位权限才能筛选同城内容。');
    }
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    const [address] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
    const city = address?.city?.trim();
    if (!city) {
      throw new DeviceCityError('city_unavailable', '暂时无法识别你所在的城市。');
    }
    return city;
  } catch (error) {
    if (error instanceof DeviceCityError) throw error;
    throw new DeviceCityError('location_failed', '暂时无法获取所在城市，请稍后重试。');
  }
}
