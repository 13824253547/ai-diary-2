import { mockCharacters } from '../mocks/characters';
import type { DiaryCharacter } from '../types/diary';
import { canSelectCharacterId } from '../types/character-capabilities';

export async function listAvailableCharacters(): Promise<DiaryCharacter[]> {
  return mockCharacters.filter(character => canSelectCharacterId(character.id));
}
