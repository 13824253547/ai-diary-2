import { getCityStampConfig, getVisitedCityStampIds } from '../components/library/city-stamp-catalog';
import type { DiaryItem } from '../types/diary';
import type { ViewStyle } from 'react-native';

// Legacy route indices remain readable; new cards use normalized coordinates.
export const postcardStampPlacements = [
  { top: 200, left: 18, rotation: '-7deg' },
  { top: 185, right: 20, rotation: '9deg' },
  { top: 135, left: 22, rotation: '-12deg' },
  { top: 32, left: 24, rotation: '6deg' },
] as const;

function parsePlacement(value?: string) {
  if (!value || !/^v2:\d{1,4}:\d{1,4}:-?\d{1,2}$/.test(value)) return undefined;
  const [, x, y, rotation] = value.split(':').map(Number);
  if (x > 1000 || y > 1000 || Math.abs(rotation) > 18) return undefined;
  return { x: x / 1000, y: y / 1000, rotation };
}

export function isPostcardStampPlacement(value?: string): value is string {
  return value !== undefined && (/^[0-3]$/.test(value) || parsePlacement(value) !== undefined);
}

export function createPostcardStampPlacement() {
  const x = Math.random();
  const y = Math.random();
  const rotation = Math.round(Math.random() * 36 - 18);
  return `v2:${Math.round(x * 1000)}:${Math.round(y * 1000)}:${rotation}`;
}

export function getPostcardStampPosition(value: string, photoWidth: number, hasLocationMark: boolean): ViewStyle {
  const placement = parsePlacement(value);
  if (!placement) {
    const legacy = postcardStampPlacements[Number(value)] ?? postcardStampPlacements[0];
    return {
      top: legacy.top,
      left: 'left' in legacy ? legacy.left : undefined,
      right: 'right' in legacy ? legacy.right : undefined,
      transform: [{ rotate: legacy.rotation }],
    };
  }
  const width = Math.max(88, photoWidth);
  const left = 22 + placement.x * (width - 88);
  // Include 10dp for the rotated edge inside the photo's 12dp inset.
  // Map into the available height instead of clamping many stamps to one line.
  const minTop = hasLocationMark && left + 78 > width - 84 ? 112 : 22;
  const top = minTop + placement.y * (214 - minTop);
  return { left, right: undefined, top, transform: [{ rotate: `${placement.rotation}deg` }] };
}

export function getRecentPostcardStampIds(diaries: readonly DiaryItem[]) {
  const datedDiaries = [...diaries].sort((a, b) => b.date.localeCompare(a.date));
  return [...getVisitedCityStampIds(datedDiaries)]
    .filter(id => getCityStampConfig(id) !== undefined)
    .slice(0, 6);
}
