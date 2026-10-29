import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DiscoveryStoryContract } from '../../contracts/discovery-contract';
import type { ContentBlock, DiaryItem } from '../../types/diary';
import { DiscoveryPhoto } from './discovery-photo';
import { DiaryPaper } from './diary-paper';

function formatStoryDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}

export function DiscoveryStoryPaper({ story }: { story: DiscoveryStoryContract }) {
  const blocks = story.blocks.length
    ? story.blocks
    : [{ id: `${story.id}-body`, type: 'text' as const, content: story.body, photos: [] }];
  const photos = new Map(blocks.flatMap(block => block.photos.map(photo => [photo.photoId, photo] as const)));
  const photoIds = [...photos.keys()];
  const diaryBlocks: ContentBlock[] = blocks.flatMap(block => {
    const ids = block.photos.map(photo => photo.photoId);
    const contentBlock: ContentBlock = block.type === 'quote'
      ? { id: block.id, type: 'quote', content: block.content, ...(ids.length ? { photoIds: ids } : {}) }
      : { id: block.id, type: 'text', ...(block.title ? { title: block.title } : {}), content: block.content, ...(ids.length ? { photoIds: ids } : {}) };
    const photoBlocks: ContentBlock[] = block.photos.map((photo, index) => ({
      id: `${block.id}-photo-${index}`,
      type: 'photo',
      photoId: photo.photoId,
      caption: photo.caption,
      relatedBlockId: block.id,
    }));
    return [contentBlock, ...photoBlocks];
  });
  const diary: DiaryItem = {
    id: story.id,
    type: 'travel',
    status: 'ready',
    title: story.title,
    subtitle: '',
    location: story.location,
    date: formatStoryDate(story.date),
    summary: story.body,
    helperMessage: '',
    characterId: story.characterId ?? 'character-blue',
    companionName: story.author,
    privacy: story.author === '匿名用户' ? 'anonymous' : 'public-likes',
    photoIds,
    coverPhotoId: photoIds[0] ?? '',
    blocks: diaryBlocks,
    exportedImage: false,
    exportedPdf: false,
    shareModes: [],
  };
  const publicImage = (photoId: string, style: StyleProp<ViewStyle>) => {
    const photo = photos.get(photoId);
    if (!photo) return null;
    return (
      <View style={[s.photoFrame, style]}>
        <DiscoveryPhoto
          accessibilityLabel={photo.caption || '故事配图'}
          uri={photo.uri}
          style={s.image}
        />
      </View>
    );
  };

  return (
    <DiaryPaper
      diary={diary}
      testIDPrefix="discovery"
      showCover={Boolean(story.coverUri)}
      renderCoverPhoto={() => (
        <View style={[s.photoFrame, s.hero]}>
          <DiscoveryPhoto
            accessibilityLabel="故事封面"
            uri={story.coverUri}
            style={s.image}
          />
        </View>
      )}
      renderPublicPhoto={publicImage}
    />
  );
}

const s = StyleSheet.create({
  hero: { height: 165, width: '100%' },
  photoFrame: { overflow: 'hidden', backgroundColor: '#EFE3D5' },
  image: { width: '100%', height: '100%' },
});
