export const SUPPORTED_CHARACTER_IDS = [
  'character-blue',
  'character-green',
  'character-brown',
  'character-red',
  'character-brown-2',
  'character-blue-2',
] as const;

export const AVAILABLE_CHARACTER_IDS = [
  'character-blue',
  'character-green',
  'character-brown',
] as const;

export function isSupportedCharacterId(value: unknown): value is typeof SUPPORTED_CHARACTER_IDS[number] {
  return typeof value === 'string' && SUPPORTED_CHARACTER_IDS.includes(value as typeof SUPPORTED_CHARACTER_IDS[number]);
}

export function canSelectCharacterId(value: unknown): value is typeof AVAILABLE_CHARACTER_IDS[number] {
  return typeof value === 'string' && AVAILABLE_CHARACTER_IDS.includes(value as typeof AVAILABLE_CHARACTER_IDS[number]);
}
