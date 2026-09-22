import { StyleSheet, View } from 'react-native';
import type { GenerationPhase } from '../../types/creation';
import { colors, radius, spacing } from '../../theme/tokens';
import { ProgressStep } from './progress-step';

type ProgressPanelProps = {
  phases: GenerationPhase[];
  activeIndex: number;
};

export function ProgressPanel({ phases, activeIndex }: ProgressPanelProps) {
  return (
    <View style={styles.panel}>
      {phases.map((phase, index) => (
        <ProgressStep
          key={phase.id}
          title={phase.label}
          detail={phase.detail}
          active={index === activeIndex}
          completed={index < activeIndex}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
  },
});

