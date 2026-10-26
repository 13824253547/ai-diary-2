import { Image, StyleSheet, Text, View } from 'react-native';
import type { DiaryItem } from '../../types/diary';
import { art } from '../../theme/assets';
import { colors } from '../../theme/tokens';
import { Photo } from './photo';

const titleFont = 'STSong';
const bodyFont = 'PingFang SC';
const quoteFont = 'STKaiti';

export function DiaryPaper({ diary }: { diary: DiaryItem }) {
  const paragraphs = diary.blocks.filter(b => b.type === 'text');
  const quotes = diary.blocks.filter(b => b.type === 'quote');
  const nordic = diary.characterId === 'character-brown';
  const postcard = diary.characterId === 'character-green';
  const heroId = diary.coverPhotoId || diary.photoIds[0] || '';

  return (
    <View testID={`diary-paper-${diary.id}`} style={[s.paper, nordic && s.nordic, postcard && s.postcard]}>
      <View testID={`diary-hero-frame-${diary.id}`} style={[s.heroFrame, { transform: [{ rotate: nordic ? '0deg' : '-3deg' }] }]}>
        <Photo id={heroId} diaryId={diary.id} anonymous={diary.anonymous} style={s.hero} />
        {!nordic ? <Image source={art.stamp} resizeMode="contain" style={s.stamp} /> : null}
      </View>
      <Text testID={`diary-title-${diary.id}`} style={[s.title, nordic && s.nordicTitle]}>
        {diary.title}
        <Text style={s.sun}> ☼</Text>
      </Text>
      <Text style={s.meta}>
        {diary.location} · {diary.date}
      </Text>
      {paragraphs.map((block, index) => {
        if (block.type !== 'text') return null;
        const photoId =
          block.photoIds?.[0] ??
          diary.blocks.flatMap(item =>
            item.type === 'photo' && item.relatedBlockId === block.id ? [item.photoId] : [],
          )[0];
        return (
          <View
            key={block.id}
            testID={`diary-row-${block.id}`}
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
                <Photo id={photoId} diaryId={diary.id} anonymous={diary.anonymous} style={[s.photo, postcard && s.postcardPhoto]} />
                {!nordic ? <Image source={art.tape} resizeMode="contain" style={s.tape} /> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {quotes.map(quote =>
        quote.type === 'quote' ? (
          <View key={quote.id} style={s.quoteWrap}>
            <Text style={s.quote}>“ {quote.content.replace(/[“”]/g, '')} ”</Text>
            <View style={s.quoteUnderline} />
          </View>
        ) : null,
      )}
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
  stamp: { width: 91, height: 68, position: 'absolute', right: -5, bottom: -13 },
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
