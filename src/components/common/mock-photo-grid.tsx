import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { DiaryPhoto } from '../../types/diary';

type MockPhotoGridProps = {
  photos: DiaryPhoto[];
  selectedIds?: string[];
  onPress?: (photoId: string) => void;
};

export function MockPhotoGrid({ photos, selectedIds = [], onPress }: MockPhotoGridProps) {
  return (
    <View style={styles.grid}>
      {photos.map((photo) => {
        const selected = selectedIds.includes(photo.id);
        return (
          <Pressable
            key={photo.id}
            onPress={onPress ? () => onPress(photo.id) : undefined}
            style={[styles.card, selected ? styles.cardSelected : null]}
          >
            {photo.image ? <Image resizeMode="cover" source={photo.image} style={styles.image} /> : null}
            <View style={styles.overlay}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{photo.emoji}</Text>
              </View>
              {selected ? (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedText}>已选</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.title}>
                {photo.title}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {photo.location} · {photo.date}
              </Text>
            </View>
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
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSelected: {
    borderColor: colors.brand,
    borderWidth: 2,
  },
  image: {
    width: '100%',
    height: 124,
  },
  overlay: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 16,
  },
  selectedBadge: {
    borderRadius: radius.pill,
    backgroundColor: colors.brandStrong,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectedText: {
    fontSize: typography.meta,
    color: colors.white,
    fontWeight: '700',
  },
  copy: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
});

