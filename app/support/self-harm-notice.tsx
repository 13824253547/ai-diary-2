import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/layout/screen';
import { riskSupport } from '../../src/constants/risk-support';
import { colors, radius, shadow, spacing, typography } from '../../src/theme/tokens';

export default function SelfHarmSupportNoticeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.circleButton, shadow.soft]}>
          <Ionicons color={colors.black} name="chevron-back" size={22} />
        </Pressable>
      </View>

      <Text style={styles.title}>We noticed{'\n'}something in your{'\n'}entry</Text>

      <View style={styles.infoCard}>
        <Text style={styles.paragraph}>{riskSupport.paragraphs[0]}</Text>
        <Text style={styles.paragraph}>If you are in immediate danger{"\n"}Call 111 (Police, Fire, Ambulance) or go to your nearest hospital emergency department.</Text>
        <Text style={styles.paragraph}>Talk to someone now</Text>
        <Text style={styles.paragraph}>Need to talk? — Free call or text 1737, anytime, 24/7, to speak with a trained counsellor.</Text>
        <Text style={styles.paragraph}>Lifeline — Free call 0800 543 354, or free text 4357 (HELP). Available 24/7.</Text>
        <Text style={styles.paragraph}>Suicide Crisis Helpline (0508 TAUTOKO) — Free call 0508 828 865. Available 24/7, if you or someone you know may be thinking about suicide.</Text>
      </View>

      <Text style={styles.footer}>
        This message was triggered automatically by something in your entry. It isn't a diagnosis, and no one else has seen what you wrote. We just want to make sure you have support close by if you need it.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 48,
    fontWeight: '800',
    color: '#4e2d18',
    marginBottom: spacing.xl,
  },
  infoCard: {
    borderRadius: radius.lg,
    backgroundColor: '#f4f0ea',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  paragraph: {
    fontSize: typography.heading,
    lineHeight: 34,
    color: '#5d3b29',
  },
  footer: {
    textAlign: 'center',
    fontSize: typography.body,
    lineHeight: 28,
    color: '#6c5c4f',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
});
