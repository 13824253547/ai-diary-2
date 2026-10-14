import type { DiaryType } from './diary';

export const SUPPORTED_DIARY_TYPES: readonly DiaryType[] = ['travel', 'work', 'emotion'];

export const CREATABLE_DIARY_TYPES: readonly DiaryType[] = ['travel'];

export function isDiaryType(value: unknown): value is DiaryType {
  return typeof value === 'string' && SUPPORTED_DIARY_TYPES.includes(value as DiaryType);
}

export function canCreateDiaryType(value: unknown): value is DiaryType {
  return typeof value === 'string' && CREATABLE_DIARY_TYPES.includes(value as DiaryType);
}
