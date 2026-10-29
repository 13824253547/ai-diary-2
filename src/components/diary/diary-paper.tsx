import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DiaryItem } from '../../types/diary';
import { art } from '../../theme/assets';
import { colors } from '../../theme/tokens';
import { Photo } from './photo';
import { CityStamp } from '../library/city-stamp';
import { getCityStampConfig, getVisitedCityStampIds } from '../library/city-stamp-catalog';
import { AIContentLabel, AI_DIARY_NOTICE } from '../common/ai-content-label';

const titleFont = 'STSong';
const bodyFont = 'PingFang SC';
const quoteFont = 'STKaiti';

type DiaryPaperProps = {
  diary: DiaryItem;
  author?: string;
  testIDPrefix?: string;
  showCover?: boolean;
  showAdditionalPhotos?: boolean;
  renderCoverPhoto?: () => ReactNode;
  renderPublicPhoto?: (photoId: string, style: StyleProp<ViewStyle>) => ReactNode;
};

type DiaryParagraph = Extract<DiaryItem['blocks'][number], { type: 'text' | 'quote' }>;

function photosForBlock(diary: DiaryItem, block: DiaryParagraph) {
  const blockPhotos = block.photoIds ?? [];
  const relatedPhotos = diary.blocks.flatMap(candidate =>
    candidate.type === 'photo' && candidate.relatedBlockId === block.id
      ? [candidate.photoId]
      : [],
  );
  return [...new Set([...blockPhotos, ...relatedPhotos])];
}

function captionForPhoto(diary: DiaryItem, photoId: string) {
  const photo = diary.blocks.find(block => block.type === 'photo' && block.photoId === photoId);
  return photo?.type === 'photo' ? photo.caption : '';
}

export function DiaryPaper({
  diary,
  author,
  testIDPrefix = 'diary',
  showCover = true,
  showAdditionalPhotos = false,
  renderCoverPhoto,
  renderPublicPhoto,
}: DiaryPaperProps) {
  const paragraphs = diary.blocks.filter(b => b.type === 'text');
  const quotes = diary.blocks.filter(b => b.type === 'quote');
  const nordic = diary.characterId === 'character-brown';
  const postcard = diary.characterId === 'character-green';
  const heroId = diary.coverPhotoId || diary.photoIds[0] || '';
  const cityStampId = [...getVisitedCityStampIds([diary])][0];
  const cityStamp = cityStampId ? getCityStampConfig(cityStampId) : undefined;
  const metadata = author
    ? [author, diary.location, diary.date].filter(Boolean).join(' · ')
    : `${diary.location} · ${diary.date}`;

  const photoContent = (photoId: string, mode: 'inline' | 'full') => {
    const style = mode === 'inline' ? postcard ? s.postcardPhoto : s.photo : s.fullPhoto;
    return renderPublicPhoto
      ? renderPublicPhoto(photoId, style)
      : <Photo id={photoId} diaryId={diary.id} anonymous={diary.anonymous} style={style} />;
  };

  const photoCaption = (photoId: string) => {
    if (!showAdditionalPhotos) return null;
    const caption = captionForPhoto(diary, photoId);
    return caption ? <Text style={s.caption}>{caption}</Text> : null;
  };

  const fullPhoto = (photoId: string) => (
    <View key={photoId} style={s.fullPhotoFrame}>
      {photoContent(photoId, 'full')}
      {photoCaption(photoId)}
    </View>
  );

  return (
    <View testID={`${testIDPrefix}-paper-${diary.id}`} style={[s.paper, nordic && s.nordic, postcard && s.postcard]}>
      {showCover ? (
        <View testID={`${testIDPrefix}-hero-frame-${diary.id}`} style={[s.heroFrame, { transform: [{ rotate: nordic ? '0deg' : '-3deg' }] }]}>
          {renderCoverPhoto
            ? renderCoverPhoto()
            : <Photo id={heroId} diaryId={diary.id} anonymous={diary.anonymous} style={s.hero} />}
          {!nordic && cityStamp ? (
            <CityStamp
              {...cityStamp}
              width={78}
              height={78}
              testID={`${testIDPrefix}-city-stamp-${diary.id}`}
              style={s.cityStamp}
            />
          ) : null}
        </View>
      ) : null}
      <Text testID={`${testIDPrefix}-title-${diary.id}`} style={[s.title, nordic && s.nordicTitle]}>
        {diary.title}
        <Text style={s.sun}> ☼</Text>
      </Text>
      <Text style={s.meta}>
        {metadata}
      </Text>
      <AIContentLabel text={AI_DIARY_NOTICE} testID={`${testIDPrefix}-ai-label-${diary.id}`} />
      {paragraphs.map((block, index) => {
        if (block.type !== 'text') return null;
        const [photoId, ...additionalPhotos] = photosForBlock(diary, block);
        return (
          <View key={block.id}>
            <View
              testID={`${testIDPrefix}-row-${block.id}`}
              style={[s.row, index % 2 === 1 && { flexDirection: 'row-reverse' }, postcard && s.postcardRow]}
            >
              <Text style={[s.body, postcard && s.postcardBody]}>
                {index === 0 ? <Text style={s.initial}>{block.content.slice(0, 1)}</Text> : null}
                {index === 0 ? block.content.slice(1) : block.content}
              </Text>
              {photoId ? (
                <View
                  style={[
                    s.photoFrame,
                    { transform: [{ rotate: nordic ? '0deg' : index % 2 ? '3deg' : '-4deg' }] },
                    postcard && s.postcardPhotoFrame,
                  ]}
                >
                  {photoContent(photoId, 'inline')}
                  {photoCaption(photoId)}
                  {!nordic ? <Image source={art.tape} resizeMode="contain" style={s.tape} /> : null}
                </View>
              ) : null}
            </View>
            {showAdditionalPhotos ? additionalPhotos.map(fullPhoto) : null}
          </View>
        );
      })}
      {quotes.map(quote => {
        const quotePhotos = photosForBlock(diary, quote);
        return (
          <View key={quote.id} style={s.quoteBlock}>
            <View style={s.quoteWrap}>
              <Text style={s.quote}>“ {quote.content.replace(/[“”]/g, '')} ”</Text>
              <View style={s.quoteUnderline} />
            </View>
            {showAdditionalPhotos ? quotePhotos.map(fullPhoto) : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  paper: { padding: 6, gap: 16 },
  nordic: { backgroundColor: '#F3F3ED', padding: 14 },
  postcard: { borderWidth: 1, borderColor: '#E8DAC5', backgroundColor: '#FFF9ED', padding: 16 },
  heroFrame: {
    padding: 6,
    backgroundColor: '#FFFCF3',
    borderWidth: 1,
    borderColor: '#EFDFC9',
    margin: 4,
    marginBottom: 12,
    shadowColor: '#80572D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 1, height: 2 },
    shadowRadius: 4,
  },
  hero: { height: 165, width: '100%' },
  cityStamp: { position: 'absolute', right: -5, bottom: -13 },
  title: { fontFamily: titleFont, fontSize: 34, fontWeight: '700', color: colors.textPrimary, letterSpacing: 1.2 },
  nordicTitle: { fontFamily: bodyFont, fontWeight: '400', fontSize: 28 },
  sun: { fontSize: 27, color: colors.brand },
  meta: { fontSize: 12, color: '#A79685', marginTop: -8, letterSpacing: 0.4 },
  row: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  postcardRow: { flexDirection: 'column', gap: 14 },
  body: { flex: 1, fontSize: 15, lineHeight: 31, color: '#675444', fontFamily: bodyFont },
  postcardBody: { flex: 0, fontSize: 16, lineHeight: 33, color: '#6B5644' },
  initial: { fontSize: 42, color: '#D97628', fontFamily: quoteFont, lineHeight: 45 },
  photoFrame: {
    width: '38%',
    padding: 4,
    borderWidth: 1,
    borderColor: '#EADDC9',
    backgroundColor: '#FFFCF5',
    marginTop: 6,
  },
  postcardPhotoFrame: { width: '100%', marginTop: 0 },
  photo: { height: 110, width: '100%' },
  postcardPhoto: { height: 153 },
  tape: { width: 48, height: 18, position: 'absolute', right: 15, top: -10, transform: [{ rotate: '23deg' }] },
  quoteWrap: { alignItems: 'center', paddingVertical: 4 },
  quoteBlock: { gap: 10 },
  fullPhotoFrame: {
    padding: 6,
    borderWidth: 1,
    borderColor: '#EADDC9',
    backgroundColor: '#FFFCF5',
  },
  fullPhoto: { width: '100%', height: 200 },
  caption: { fontSize: 12, lineHeight: 18, color: '#A79685', marginTop: 5 },
  quote: {
    fontSize: 28,
    lineHeight: 42,
    fontFamily: quoteFont,
    color: '#E18133',
    textAlign: 'center',
    paddingHorizontal: 8,
    letterSpacing: 0.8,
  },
  quoteUnderline: {
    width: 92,
    height: 10,
    borderBottomWidth: 2,
    borderColor: '#E9A264',
    borderRadius: 18,
    marginTop: -2,
    transform: [{ rotate: '-5deg' }],
    opacity: 0.85,
  },
});
