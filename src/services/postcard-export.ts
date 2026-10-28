import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Image } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type { View } from 'react-native';

export async function discardPostcard(uri?: string) {
  if (uri?.startsWith('file://')) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

export async function capturePostcard(ref: RefObject<View | null>): Promise<string> {
  if (!ref.current) throw new Error('postcard view unavailable');
  const uri = await captureRef(ref, { format: 'png', result: 'tmpfile' });
  try {
    const file = await FileSystem.getInfoAsync(uri);
    if (!file.exists || !file.size) throw new Error('empty postcard');
    await new Promise<void>((resolve, reject) => {
      Image.getSize(uri, (width, height) => {
        if (width > 0 && height > 0) resolve();
        else reject(new Error('invalid postcard image'));
      }, reject);
    });
    return uri;
  } catch (error) {
    await discardPostcard(uri);
    throw error;
  }
}

export async function sharePostcard(uri: string): Promise<'opened' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
  return 'opened';
}

export async function savePostcard(uri: string): Promise<'saved' | 'permission_denied'> {
  const permission = await MediaLibrary.getPermissionsAsync(true, ['photo']);
  const result = permission.granted ? permission : await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!result.granted) return 'permission_denied';
  await MediaLibrary.saveToLibraryAsync(uri);
  return 'saved';
}
