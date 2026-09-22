import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type AvatarBadgeProps = {
  image: number;
  title: string;
  subtitle: string;
  tint?: string;
};

export function AvatarBadge({ image, title, subtitle, tint = colors.brandSoft }: AvatarBadgeProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.imageWrap, { backgroundColor: tint }]}>
        <Image resizeMode="contain" source={image} style={styles.image} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  imageWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 44,
    height: 44,
  },
  textWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
});
