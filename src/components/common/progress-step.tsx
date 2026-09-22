import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type ProgressStepProps = {
  title: string;
  detail: string;
  active: boolean;
  completed: boolean;
};

export function ProgressStep({ title, detail, active, completed }: ProgressStepProps) {
  return (
    <View style={styles.row}>
      <View style={styles.leftTrack}>
        <View
          style={[
            styles.dot,
            completed ? styles.dotCompleted : null,
            active ? styles.dotActive : null,
          ]}
        />
        <View style={[styles.line, completed ? styles.lineCompleted : null]} />
      </View>

      <View style={styles.iconBox}>
        <View style={[styles.iconInner, active ? styles.iconInnerActive : null]} />
      </View>

      <View style={styles.textWrap}>
        <Text style={[styles.title, active ? styles.titleActive : null]}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>

      <Text style={[styles.result, completed || active ? styles.resultDone : null]}>
        {completed ? '✓' : active ? '·' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  leftTrack: {
    alignItems: 'center',
    width: 14,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  dotActive: {
    borderColor: colors.brandStrong,
    backgroundColor: colors.brandSoft,
  },
  dotCompleted: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 26,
    marginTop: spacing.xs,
    backgroundColor: colors.border,
    opacity: 0.55,
  },
  lineCompleted: {
    backgroundColor: colors.successSoft,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 14,
    height: 14,
    borderRadius: 5,
    backgroundColor: colors.backgroundMuted,
  },
  iconInnerActive: {
    backgroundColor: colors.brandStrong,
  },
  textWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.subheading,
    fontWeight: '700',
  },
  titleActive: {
    color: colors.brandStrong,
  },
  detail: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  result: {
    width: 20,
    fontSize: typography.heading,
    color: colors.borderStrong,
    textAlign: 'center',
  },
  resultDone: {
    color: colors.success,
  },
});
