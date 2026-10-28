export type PublicDiscoveryPhoto = {
  photoId: string;
  caption: string;
};

export type PublicDiscoveryBlock = {
  id: string;
  type: 'text' | 'quote';
  title?: string;
  content: string;
  photos: PublicDiscoveryPhoto[];
};

export type DiscoveryPublicationSnapshot = {
  title: string;
  authorDisplayName: string;
  location: string;
  cityKey: string;
  date: Date;
  body: string;
  likesEnabled: boolean;
  coverPhotoId: string | null;
  publicPhotoIds: string[];
  publicContent: PublicDiscoveryBlock[];
  characterId: string;
};

type DiaryPublicationSource = {
  title: string;
  location: string;
  date: Date;
  privacy: string;
  photoIds: unknown;
  publicBlockIds: unknown;
  contentSnapshot: unknown;
};

export class DiscoveryPublicationError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'publication_blocked',
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && !!item.trim());
}

function redact(value: string, names: string[]) {
  if (!names.length) return value;
  const pattern = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return value.replace(new RegExp(pattern, 'gu'), '同行人');
}

function anonymousNames(snapshot: Record<string, unknown>) {
  const people = Array.isArray(snapshot.people) ? snapshot.people : [];
  const names = [
    snapshot.companionName,
    ...people.flatMap(person => {
      if (!isRecord(person)) return [];
      return [person.name, ...readStrings(person.aliases)];
    }),
  ];
  return [...new Set(names
    .filter((name): name is string => typeof name === 'string')
    .map(name => name.trim())
    .filter(name => name.length > 0 && !['自己', '同行人', '我'].includes(name)))]
    .sort((left, right) => right.length - left.length);
}

export function normalizeDiscoveryCity(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
  if (!normalized || /^(unknown|unknown location|未设置|未知|未知地点|地点未知)$/iu.test(normalized)) {
    return '';
  }
  return normalized.replace(/市$/u, '').trim();
}

export function buildDiscoveryPublicationSnapshot(
  diary: DiaryPublicationSource,
): DiscoveryPublicationSnapshot {
  if (!isRecord(diary.contentSnapshot) || !Array.isArray(diary.contentSnapshot.blocks)) {
    throw new DiscoveryPublicationError('invalid_input', '日记正文暂时无法发布到发现。');
  }
  if (!Array.isArray(diary.publicBlockIds) || !diary.publicBlockIds.length
    || !diary.publicBlockIds.every(item => typeof item === 'string' && !!item.trim())) {
    throw new DiscoveryPublicationError('invalid_input', '请先选择要公开的正文段落。');
  }

  const sourcePhotoIds = new Set(readStrings(diary.photoIds));
  const selectedBlockIds = new Set(diary.publicBlockIds as string[]);
  const sourceBlocks = diary.contentSnapshot.blocks.filter(isRecord);
  const paragraphBlocks = sourceBlocks.filter(block =>
    (block.type === 'text' || block.type === 'quote')
    && typeof block.id === 'string'
    && selectedBlockIds.has(block.id)
    && typeof block.content === 'string'
    && !!block.content.trim());
  if (!paragraphBlocks.length || paragraphBlocks.length !== selectedBlockIds.size) {
    throw new DiscoveryPublicationError('invalid_input', '公开段落与当前日记版本不匹配。');
  }

  const standalonePhotos = sourceBlocks.filter(block =>
    block.type === 'photo'
    && typeof block.photoId === 'string'
    && sourcePhotoIds.has(block.photoId));

  const publicContent: PublicDiscoveryBlock[] = paragraphBlocks.map(block => {
    const blockId = block.id as string;
    const paragraphPhotoIds = readStrings(block.photoIds)
      .filter(photoId => sourcePhotoIds.has(photoId));
    const paragraphPhotoBlocks = standalonePhotos.filter(photo =>
      photo.relatedBlockId === blockId
      || (photo.relatedBlockId === undefined && paragraphPhotoIds.includes(photo.photoId as string)));
    const captionByPhotoId = new Map(paragraphPhotoBlocks.flatMap(photo =>
      typeof photo.caption === 'string' && photo.caption.trim()
        ? [[photo.photoId as string, photo.caption] as const]
        : []));
    const relatedPhotoIds = paragraphPhotoBlocks.map(photo => photo.photoId as string);
    const photos = [...new Set([...paragraphPhotoIds, ...relatedPhotoIds])]
      .map(photoId => ({ photoId, caption: captionByPhotoId.get(photoId) ?? '' }));
    const title = typeof block.title === 'string' ? block.title.trim() : '';
    return {
      id: blockId,
      type: block.type as 'text' | 'quote',
      ...(title ? { title } : {}),
      content: (block.content as string).trim(),
      photos,
    };
  });

  const publicPhotoIds = [...new Set(publicContent.flatMap(block =>
    block.photos.map(photo => photo.photoId)))];
  const anonymous = diary.privacy === 'anonymous';
  if (anonymous && publicPhotoIds.length) {
    throw new DiscoveryPublicationError(
      'publication_blocked',
      '匿名照片遮挡目前不可用，含照片的匿名日记暂不能发布到发现。',
    );
  }

  const snapshot = diary.contentSnapshot;
  const characterId = typeof snapshot.characterId === 'string' ? snapshot.characterId : 'character-blue';
  const names = anonymous ? anonymousNames(snapshot) : [];
  const content = publicContent.map(block => ({
    ...block,
    ...(block.title ? { title: redact(block.title, names) } : {}),
    content: redact(block.content, names),
    photos: block.photos.map(photo => ({
      ...photo,
      caption: redact(photo.caption, names),
    })),
  }));
  const title = typeof diary.title === 'string' ? diary.title.trim() : '';
  if (!title || !Number.isFinite(diary.date.getTime())) {
    throw new DiscoveryPublicationError('invalid_input', '日记标题或日期无效，暂时无法发布。');
  }

  return {
    title: redact(title, names),
    authorDisplayName: anonymous ? '匿名用户' : '日记作者',
    location: anonymous ? '' : diary.location.trim(),
    cityKey: anonymous ? '' : normalizeDiscoveryCity(diary.location),
    date: diary.date,
    body: content.map(block => block.content).join('\n\n'),
    likesEnabled: diary.privacy === 'public-likes' || diary.privacy === 'public-comments',
    coverPhotoId: typeof snapshot.coverPhotoId === 'string' && publicPhotoIds.includes(snapshot.coverPhotoId)
      ? snapshot.coverPhotoId
      : publicPhotoIds[0] ?? null,
    publicPhotoIds,
    publicContent: content,
    characterId,
  };
}
