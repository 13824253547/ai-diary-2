import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PrivacyOption } from '../../types/share';
import type { DiaryPrivacy } from '../../types/diary';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type PrivacyOptionProps = {
  option: PrivacyOption;
  value: DiaryPrivacy;
  onPress: (id: DiaryPrivacy) => void;
};

export function PrivacyOptionCard({ option, value, onPress }: PrivacyOptionProps) {
  const active = option.id === value;

  return (
    <Pressable onPress={() => onPress(option.id)} style={[styles.card, active ? styles.active : null]}>
      <View style={[styles.dot, active ? styles.dotActive : null]} />
      <View style={styles.copy}>
        <Text style={styles.title}>{option.title}</Text>
        <Text style={styles.description}>{option.description}</Text>
      </View>
      <Text style={[styles.state, active ? styles.stateActive : null]}>{active ? '已选择' : '选择'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  active: {
    borderColor: colors.brand,
    backgroundColor: colors.surfaceAlt,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.brand,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  description: {
    fontSize: typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  state: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  stateActive: {
    color: colors.brandStrong,
    fontWeight: '700',
  },
});

