import { StyleSheet, Text, View } from 'react-native';
import { Card } from './card';
import { Button } from './button';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ShareOption } from '../../types/share';

type ShareSheetProps = {
  options: ShareOption[];
  onSelect: (id: ShareOption['id']) => void;
};

export function ShareSheet({ options, onSelect }: ShareSheetProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>分享这篇日记</Text>
      <Text style={styles.subtitle}>选择一种演示态分享方式，完成本轮流程。</Text>
      <View style={styles.list}>
        {options.map((option) => (
          <View key={option.id} style={styles.item}>
            <View style={styles.copy}>
              <Text style={styles.itemTitle}>{option.title}</Text>
              <Text style={styles.itemDescription}>{option.description}</Text>
            </View>
            <View style={styles.buttonWrap}>
              <Button label="使用" onPress={() => onSelect(option.id)} variant="secondary" />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  list: {
    gap: spacing.md,
  },
  item: {
    gap: spacing.md,
  },
  copy: {
    gap: spacing.xs,
  },
  itemTitle: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemDescription: {
    fontSize: typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  buttonWrap: {
    width: 110,
  },
});

