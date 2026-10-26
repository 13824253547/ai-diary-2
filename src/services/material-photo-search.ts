import type { DiaryItem, DiaryPhoto } from '../types/diary';

function getDiarySearchText(diary: DiaryItem) {
  const blockText = diary.blocks.flatMap(block => {
    if (block.type === 'text') return [block.title, block.content];
    if (block.type === 'quote') return [block.content];
    return [block.caption];
  });
  const peopleText = diary.people?.flatMap(person => [person.name, ...(person.aliases ?? [])]) ?? [];
  return [
    diary.title,
    diary.subtitle,
    diary.location,
    diary.summary,
    diary.date,
    diary.companionName,
    ...peopleText,
    ...blockText,
  ].filter((value): value is string => typeof value === 'string').join('\n').toLocaleLowerCase();
}

function getDiaryPhotoIds(diary: DiaryItem) {
  return [
    ...diary.photoIds,
    ...diary.blocks.flatMap(block => block.type === 'photo'
      ? [block.photoId]
      : block.photoIds ?? []),
  ];
}

export function filterMaterialPhotosByDiary(
  photos: DiaryPhoto[],
  diaries: DiaryItem[],
  keyword: string,
) {
  const query = keyword.trim().toLocaleLowerCase();
  if (!query) return photos;

  const matchingPhotoIds = new Set(
    diaries
      .filter(diary => getDiarySearchText(diary).includes(query))
      .flatMap(getDiaryPhotoIds),
  );

  return photos.filter(photo =>
    matchingPhotoIds.has(photo.id)
    || Boolean(photo.sourceAssetId && matchingPhotoIds.has(photo.sourceAssetId)),
  );
}
