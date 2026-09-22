import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import metadata from '../../../docs/business/growth-assets.json';

type Props = { width: number; kind: 'tree' | 'flowers'; unlocked?: boolean; onLabelPress?: (label: string) => void; onFlowerPress?: () => void };
export function GrowthArtwork({ width, kind, unlocked, onLabelPress, onFlowerPress }: Props) {
  const tree = kind === 'tree';
  const scale = width / (tree ? metadata.tree.size_px[0] : metadata.flowers.size_px[0]);
  const positioned = (box: readonly number[]) => ({ left: box[0] * scale, top: box[1] * scale, width: (box[2] - box[0]) * scale, height: (box[3] - box[1]) * scale });
  const labelHitSlop = (box: readonly number[]) => {
    const vertical = Math.max(5, (44 - (box[3] - box[1]) * scale) / 2);
    return { left: 12, right: 12, top: vertical, bottom: vertical };
  };
  const source = tree ? require('../../../assets/restored/growth-tree.png') : unlocked ? require('../../../assets/restored/growth-flowers-unlocked.png') : require('../../../assets/restored/growth-flowers-locked.png');
  return <View style={{ width, height: (tree ? 616 : 495) * scale, alignSelf: 'center' }}>
    <Image source={source} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="stretch" accessible={false} />
    {tree ? <>
      {metadata.tree.labels.filter(label => label.id !== 'ribbon').map(label => <Pressable key={label.text} accessibilityRole="button" accessibilityLabel={`查看${label.text}记忆锚点`} onPress={() => onLabelPress?.(label.text)} hitSlop={labelHitSlop(label.text_box_px)} style={({ pressed }) => [s.label, positioned(label.text_box_px), pressed && s.pressed]}><Text style={[s.treeText, { fontSize: 16 * scale }]}>{label.text}</Text></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel="查看记忆花朵" onPress={onFlowerPress} hitSlop={{ left: 12, right: 12, top: 14, bottom: 14 }} style={[s.label, positioned(metadata.tree.labels.find(label => label.id === 'ribbon')!.text_box_px)]}><Text style={[s.ribbonText, { fontSize: 14 * scale }]}>人生旷野的寻路者</Text></Pressable>
      {[[67, 190, 223, 340], [186, 333, 340, 444]].map((box, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`查看第${i + 1}朵记忆花`} onPress={onFlowerPress} style={[s.label, positioned(box)]} />)}
    </> : metadata.flowers.labels.map((label, i) => <View key={label.text} style={[s.label, positioned(label.text_box_px)]}><Text style={[s.flowerText, { fontSize: (i === 2 ? 15 : 14) * scale, lineHeight: 20 * scale }, i === 2 && s.lockedText]}>{label.text}{i === 2 && !unlocked ? '\n· 未解锁' : i === 2 ? '\n· 已绽放' : ''}</Text></View>)}
  </View>;
}
const s = StyleSheet.create({
  label: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  treeText: { color: '#634B34', fontWeight: '500' }, ribbonText: { color: '#4C3218', fontWeight: '600' },
  flowerText: { color: '#50381F', textAlign: 'center', fontWeight: '500' }, lockedText: { color: '#877057', fontWeight: '400' }, pressed: { opacity: 0.55 },
});
