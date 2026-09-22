import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { DiaryPhoto } from '../../types/diary';

type MockImageGridProps = {
  photos: DiaryPhoto[];
  selectedIds?: string[];
  onPress?: (photoId: string) => void;
};

export function MockImageGrid({ photos, selectedIds = [], onPress }: MockImageGridProps) {
  return (
    <View style={styles.grid}>
      {photos.map((photo) => {
        const selected = selectedIds.includes(photo.id);
        return (
          <Pressable
            key={photo.id}
            onPress={onPress ? () => onPress(photo.id) : undefined}
            style={[
              styles.card,
              { backgroundColor: photo.color },
              selected ? styles.selected : null,
            ]}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{photo.emoji}</Text>
            </View>
            <Text numberOfLines={1} style={styles.title}>
              {photo.title}
            </Text>
            <Text numberOfLines={1} style={styles.meta}>
              {photo.location}
            </Text>
            <Text style={styles.time}>{photo.date}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47%',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 138,
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: colors.brand,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 18,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  time: {
    fontSize: typography.meta,
    color: colors.textMuted,
  },
});
