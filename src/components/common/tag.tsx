import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type TagProps = {
  label: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'default';
};

const toneStyles = {
  brand: { backgroundColor: colors.brandSoft, color: colors.brand },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  default: { backgroundColor: colors.backgroundMuted, color: colors.textSecondary },
} as const;

export function Tag({ label, tone = 'default' }: TagProps) {
  const current = toneStyles[tone];

  return (
    <View style={[styles.wrap, { backgroundColor: current.backgroundColor }]}>
      <Text style={[styles.label, { color: current.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: typography.meta,
    fontWeight: '700',
  },
});
