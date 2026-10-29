import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
export { AI_DIARY_NOTICE, isGeneratedPhoto } from '../../services/ai-content-provenance';

export function AIContentLabel({
  text = 'AI生成',
  style,
  testID,
}: {
  text?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  return <Text accessibilityLabel={text} testID={testID} style={[styles.label, style]}>{text}</Text>;
}

const styles = StyleSheet.create({
  label: { fontSize: 11, lineHeight: 16, color: '#6B5644' },
});
