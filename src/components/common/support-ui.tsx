import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ComponentProps, ReactNode } from 'react';
import { colors } from '../../theme/tokens';

export function IconAction({ name, label, onPress }: { name: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={s.icon}><Ionicons name={name} size={23} color={colors.textPrimary} /></Pressable>;
}

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={s.row}><Text style={s.heading}>{title}</Text>{action ? <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}><Text style={s.link}>{action} ›</Text></Pressable> : null}</View>;
}

export function SearchField({ value, onChangeText, placeholder = '搜索回忆' }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return <View style={s.search}><Ionicons name="search-outline" size={19} color={colors.textMuted} /><TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} style={s.input} returnKeyType="search" />{value ? <IconAction name="close-circle-outline" label="清除搜索" onPress={() => onChangeText('')} /> : null}</View>;
}

export function EmptyResult({ title = '还没有这段回忆', children }: { title?: string; children?: ReactNode }) {
  return <View style={s.empty}><Ionicons name="book-outline" size={30} color={colors.brand} /><Text style={s.heading}>{title}</Text>{children || <Text style={s.hint}>试试其他日期或关键词吧</Text>}</View>;
}

export const supportStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 25, fontWeight: '700', color: colors.textPrimary },
  heading: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  body: { fontSize: 14, lineHeight: 23, color: colors.textSecondary },
  muted: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  surface: { padding: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18 },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.textSecondary },
  pillTextSelected: { color: '#fff', fontWeight: '600' },
});

const s = StyleSheet.create({
  icon: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  link: { color: colors.textSecondary, fontSize: 12 },
  search: { flexDirection: 'row', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.surface, minHeight: 42, gap: 9 },
  input: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 10 },
  empty: { alignItems: 'center', paddingVertical: 38, gap: 12 },
  hint: { color: colors.textMuted, fontSize: 13 },
});
