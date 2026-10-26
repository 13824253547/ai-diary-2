import { isGenerationResultForSelectedPhotoIds, type GenerationResultContract } from '../contracts/core-diary-contract';
import type { ContentBlock, DiaryDraft, DiaryItem, DiaryPerson, DiaryPhoto, HistoryGroup } from '../types/diary';

export const MIN_SELECTED_PHOTOS = 3;
export function cloneDiary(diary: DiaryItem): DiaryItem {
  return { ...diary, photoIds: [...diary.photoIds], blocks: diary.blocks.map(block => ({ ...block, ...('photoIds' in block && block.photoIds ? { photoIds: [...block.photoIds] } : {}) })), shareModes: [...diary.shareModes], exportModes: [...(diary.exportModes ?? [])], people: diary.people?.map(person => ({ ...person, photoIds: [...person.photoIds], aliases: person.aliases && [...person.aliases] })), posterPhotoIds: diary.posterPhotoIds && [...diary.posterPhotoIds], publicBlockIds: diary.publicBlockIds && [...diary.publicBlockIds] };
}
export function sanitizePhotoIds(photoIds: string[], photos: DiaryPhoto[]) {
  const allowed = new Set(photos.map(photo => photo.id));
  return [...new Set(photoIds)].filter(id => allowed.has(id));
}
export function getPeopleForPhotos(photoIds: string[], photos: DiaryPhoto[], existing: DiaryPerson[] = []): DiaryPerson[] {
  const selected = photos.filter(photo => photoIds.includes(photo.id));
  const personIds = [...new Set(selected.flatMap(photo => photo.personIds ?? []))];
  return personIds.map(id => {
    const group = selected.filter(photo => photo.personIds?.includes(id)).map(photo => photo.id);
    const known = existing.find(person => person.id === id);
    return { id, name: known?.name ?? (id === 'person-self' ? '我' : ''), aliases: known?.aliases && [...known.aliases], photoIds: group, avatarPhotoId: group[0] };
  });
}
export function canGenerate(photoIds: string[]) { return new Set(photoIds).size >= MIN_SELECTED_PHOTOS; }
export function getHistoryGroups(diaries: DiaryItem[]): HistoryGroup[] {
  const byMonth = new Map<string, HistoryGroup>();
  const sorted = [...diaries].sort((a, b) => b.date.localeCompare(a.date));
  for (const diary of sorted) {
    const match = diary.date.match(/(\d{4})[.\-/](\d{1,2})/);
    const key = match ? `${match[1]}-${match[2].padStart(2, '0')}` : 'other';
    const group = byMonth.get(key) ?? { id: `history-${key}`, label: match ? `${match[1]}年${Number(match[2])}月` : '我的回忆', diaryIds: [] };
    group.diaryIds.push(diary.id); byMonth.set(key, group);
  }
  return [...byMonth.values()];
}
export function getDiaryStatistics(diaries: DiaryItem[]) {
  return {
    diaries: diaries.length,
    photos: new Set(diaries.flatMap(diary => diary.photoIds)).size,
    days: new Set(diaries.map(diary => diary.date)).size,
    companions: new Set(diaries.flatMap(diary =>
      (diary.people ?? [])
        .filter(person => person.id !== 'person-self' && person.name.trim())
        .map(person => person.name.trim()),
    )).size,
  };
}
export function publicParagraphs(diary: DiaryItem) { return diary.blocks.filter(block => block.type === 'text' || block.type === 'quote'); }
function redact(value: string, names: string[]) {
  if (!names.length) return value;
  // One pass prevents a short name inside “同行人” from corrupting an earlier replacement.
  const pattern = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return value.replace(new RegExp(pattern, 'gu'), '同行人');
}

/** Keep photo references, covers and visible people inside the selected photo collection. */
export function normalizeDiaryPhotos(diary: DiaryItem, selectedPhotoIds: string[] = diary.photoIds): DiaryItem {
  const photoIds = [...new Set(selectedPhotoIds)];
  const allowed = new Set(photoIds);
  const paragraphIds = new Set(publicParagraphs(diary).map(block => block.id));
  const blocks: ContentBlock[] = diary.blocks
    .filter(block => block.type !== 'photo' || (allowed.has(block.photoId) && (!block.relatedBlockId || paragraphIds.has(block.relatedBlockId))))
    .map(block => block.type === 'photo' ? { ...block } : { ...block, photoIds: block.photoIds && [...new Set(block.photoIds)].filter(id => allowed.has(id)) });
  const poster = [...new Set(diary.posterPhotoIds ?? [])].filter(id => allowed.has(id));
  return { ...diary, photoIds, blocks,
    coverPhotoId: allowed.has(diary.coverPhotoId) ? diary.coverPhotoId : photoIds[0] ?? '',
    posterPhotoIds: poster.length ? poster : photoIds.slice(0, 2),
    publicBlockIds: diary.publicBlockIds && [...new Set(diary.publicBlockIds)].filter(id => paragraphIds.has(id)),
    people: diary.people?.map(person => ({ ...person, photoIds: person.photoIds.filter(id => allowed.has(id)) }))
      .filter(person => person.photoIds.length > 0)
      .map(person => ({ ...person, avatarPhotoId: person.photoIds.includes(person.avatarPhotoId) ? person.avatarPhotoId : person.photoIds[0] })),
  };
}
/** Every share destination receives this same projection. Never fall back to excluded cover/summary. */
export function projectDiaryForSharing(source: DiaryItem): DiaryItem {
  const diary = normalizeDiaryPhotos(source);
  const projected = cloneDiary(diary);
  const filtered = diary.privacy !== 'private' && diary.publicBlockIds !== undefined;
  const allowed = new Set(diary.publicBlockIds ?? publicParagraphs(diary).map(block => block.id));
  const paragraphs = publicParagraphs(diary).filter(block => !filtered || allowed.has(block.id));
  const referencedPhotos = new Set(paragraphs.flatMap(block => 'photoIds' in block ? block.photoIds ?? [] : []));
  projected.blocks = diary.blocks.filter(block => {
    if (!filtered) return true;
    if (block.type === 'photo') return block.relatedBlockId ? allowed.has(block.relatedBlockId) : referencedPhotos.has(block.photoId);
    return allowed.has(block.id);
  }).map(block => ({ ...block }));
  for (const block of projected.blocks) if (block.type === 'photo') referencedPhotos.add(block.photoId);
  projected.photoIds = filtered ? diary.photoIds.filter(id => referencedPhotos.has(id)) : [...diary.photoIds];
  projected.coverPhotoId = projected.photoIds[0] ?? '';
  projected.posterPhotoIds = (diary.posterPhotoIds ?? []).filter(id => projected.photoIds.includes(id));
  if (projected.posterPhotoIds.length === 0) projected.posterPhotoIds = projected.photoIds.slice(0, 2);
  if (filtered) {
    const first = paragraphs.find(block => block.type === 'text');
    projected.summary = first && 'content' in first ? first.content.slice(0, 88) : paragraphs.map(block => 'content' in block ? block.content : '').join(' ').slice(0, 88);
    projected.subtitle = '选段分享';
    projected.helperMessage = '';
  }
  projected.anonymous = diary.privacy === 'anonymous';
  if (projected.anonymous) {
    const names = [...new Set([diary.companionName, ...(diary.people ?? []).flatMap(person => [person.name, ...(person.aliases ?? [])])].map(name => name.trim()))].filter(name => name.length > 0 && !['自己', '同行人', '我'].includes(name)).sort((a, b) => b.length - a.length);
    projected.title = redact(projected.title, names);
    projected.subtitle = redact(projected.subtitle, names);
    projected.summary = redact(projected.summary, names);
    projected.location = redact(projected.location, names);
    projected.helperMessage = '';
    projected.companionName = '同行人';
    projected.people = [];
    projected.blocks = projected.blocks.map(block => block.type === 'photo' ? { ...block, caption: redact(block.caption, names) } : { ...block, ...('title' in block && block.title ? { title: redact(block.title, names) } : {}), content: redact(block.content, names) });
  }
  return projected;
}
export const projectDiaryForShare = projectDiaryForSharing;
export const buildHistoryGroups = getHistoryGroups;

export function buildGeneratedDiaryFromResult(draft: DiaryDraft, result: GenerationResultContract): DiaryItem | undefined {
  if (!isGenerationResultForSelectedPhotoIds(result, draft.selectedPhotoIds)) return undefined;
  const allowed = new Set(draft.selectedPhotoIds);
  const coverPhotoId = allowed.has(result.coverPhotoId) ? result.coverPhotoId : undefined;
  if (!coverPhotoId) return undefined;
  if (result.posterPhotoIds.some(id => !allowed.has(id))) return undefined;

  const blocks: ContentBlock[] = [];
  let hasStructuredText = false;
  for (const block of result.blocks) {
    if (block.type === 'photo') {
      if (!allowed.has(block.photoId)) return undefined;
      continue;
    }

    const photoIds = block.photoIds && [...new Set(block.photoIds)];
    if (photoIds?.some(id => !allowed.has(id))) return undefined;
    if (block.type === 'text' && block.content.trim()) hasStructuredText = true;
    if (block.type === 'quote' && block.content.trim()) hasStructuredText = true;
  }

  if (!hasStructuredText) return undefined;

  const paragraphPhotoIds = new Map<string, string[]>();
  for (const block of result.blocks) {
    if (block.type === 'photo') continue;
    if (!block.content.trim()) {
      paragraphPhotoIds.set(block.id, []);
      continue;
    }
    paragraphPhotoIds.set(block.id, [...(block.photoIds ?? [])]);
  }
  for (const block of result.blocks) {
    if (block.type === 'photo') {
      const assigned = block.relatedBlockId ? paragraphPhotoIds.get(block.relatedBlockId) : undefined;
      if (assigned && assigned.length === 0) continue;
      blocks.push({ ...block, ...(assigned ? { photoId: assigned[0] } : {}) });
      continue;
    }
    blocks.push({ ...block, photoIds: paragraphPhotoIds.get(block.id) ?? [] });
  }

  const people = (result.people ?? [])
    .map(person => ({
      ...person,
      name: person.name.trim() || (person.id === 'person-self' ? '我' : '同行人'),
      photoIds: person.photoIds.filter(id => allowed.has(id)),
    }))
    .filter(person => person.photoIds.length > 0)
    .map(person => ({
      ...person,
      avatarPhotoId: person.photoIds.includes(person.avatarPhotoId) ? person.avatarPhotoId : person.photoIds[0],
    }));

  return normalizeDiaryPhotos({
    ...draft.diary,
    status: 'ready',
    title: result.title,
    summary: result.summary,
    location: result.location,
    date: draft.sourceDiaryId ? draft.diary.date : result.date,
    companionName: result.companionName.trim() || (people.some(person => person.id !== 'person-self') ? '同行人' : '自己'),
    people,
    photoIds: [...draft.selectedPhotoIds],
    coverPhotoId,
    posterPhotoIds: [...result.posterPhotoIds],
    blocks,
  }, draft.selectedPhotoIds);
}

export function buildGeneratedDiary(draft: DiaryDraft): DiaryItem {
  const diary = cloneDiary(draft.diary);
  const person = draft.people.find(item => item.id !== 'person-self')?.name.trim() || '同行人';
  const withPerson = draft.people.some(item => item.id !== 'person-self');
  const character = diary.characterId;
  const opening = character === 'character-green'
    ? `亲爱的未来的我：从台南寄来一张明信片。${withPerson ? `和${person}走过` : '走过'}暖暖的红墙和树影，才发现慢一点，风景就会多一点。`
    : character === 'character-brown'
      ? `台南，九月。红墙，树影，一段没有赶路的午后。${withPerson ? `和${person}一起，` : ''}用镜头收藏老城的纹理，也记下此刻平静的心情。`
      : `九月的台南，阳光还是暖暖的。${withPerson ? `和${person}` : '独自'}沿着赤崁楼的红墙慢慢走，树影落在脚边，连风都有了老城的味道。`;
  const blocks: ContentBlock[] = [
    { id: `${draft.id}-p1`, type: 'text', title: '在古城里，把时间放慢', content: opening, photoIds: draft.selectedPhotoIds[0] ? [draft.selectedPhotoIds[0]] : [] },
    { id: `${draft.id}-p2`, type: 'text', title: '巷弄里的小确幸', content: `钻进神农街的小巷，偶遇一家安静的咖啡馆。一碗热热的担仔面，一杯冰拿铁，就是今天最满足的时刻。${withPerson ? `${person}说，` : ''}这样不赶路的旅行真好。`, photoIds: draft.selectedPhotoIds[1] ? [draft.selectedPhotoIds[1]] : [] },
    { id: `${draft.id}-p3`, type: 'text', title: '日落之前，再走一小段', content: '傍晚去了安平，海风轻轻吹过来。坐在堤岸边看太阳一点点落下，没说什么，却觉得这一天已经很完整。', photoIds: draft.selectedPhotoIds[2] ? [draft.selectedPhotoIds[2]] : [] },
    { id: `${draft.id}-quote`, type: 'quote', content: '旅行不是走了多远，而是把日子过慢了一点。', photoIds: draft.selectedPhotoIds[3] ? [draft.selectedPhotoIds[3]] : [], relatedBlockId: `${draft.id}-p3` },
  ];
  draft.selectedPhotoIds.slice(0, 3).forEach((photoId, index) => {
    if (photoId) blocks.push({ id: `${draft.id}-photo${index + 1}`, type: 'photo', photoId, caption: ['红墙、绿树和不着急的午后。', '把巷子里的日常，装进相机。', '把这一刻的温柔，好好收藏。'][index], relatedBlockId: `${draft.id}-p${index + 1}` });
  });
  return normalizeDiaryPhotos({ ...diary, status: 'ready', companionName: withPerson ? person : '自己', people: draft.people.map(item => ({ ...item, name: item.name.trim() || (item.id === 'person-self' ? '我' : '同行人') })), photoIds: [...draft.selectedPhotoIds], coverPhotoId: draft.selectedPhotoIds[0] ?? '', posterPhotoIds: draft.selectedPhotoIds.slice(0, 2), blocks, summary: opening.slice(0, 72), publicBlockIds: undefined });
}
