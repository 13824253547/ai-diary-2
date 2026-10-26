import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { Button } from '../../src/components/common/button';
import { EmptyResult } from '../../src/components/common/support-ui';
import { colors } from '../../src/theme/tokens';

export default function ReportScreen() {
  const router = useRouter();

  return (
    <GrowthScreen header={<View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={8} onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={25} color={colors.textPrimary} />
        </Pressable>
        <View style={s.heading}>
          <Text style={s.title}>小橘的专属洞察报告</Text>
        </View>
      </View>} contentStyle={s.content}>
      <EmptyResult title="真实洞察服务暂未接入">
        <Text style={s.body}>目前没有可展示的真实分析结果，因此不会显示预设洞察内容。</Text>
        <Button label="返回记忆花朵" onPress={() => router.replace('/profile/flowers')} />
      </EmptyResult>
    </GrowthScreen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 21, paddingTop: 7, paddingBottom: 32, gap: 0 },
  header: { marginBottom: 26 },
  back: { width: 40, height: 34, justifyContent: 'center' },
  heading: { alignItems: 'center', gap: 12, marginTop: -1 },
  title: { fontSize: 24, lineHeight: 35, fontWeight: '600', color: '#201A15', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 25, color: '#897665' },
});
