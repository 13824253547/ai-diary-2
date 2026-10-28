import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GrowthFlowerId } from '../../contracts/growth-insight-contract';

import metadata from './growth-assets.json';

type Props = {
  width: number;
  kind: 'tree' | 'flowers';
  unlocked?: boolean;
  flowerStates?: Partial<Record<GrowthFlowerId, boolean>>;
  onLabelPress?: (label: { id: string; text: string }) => void;
  onFlowerPress?: () => void;
};

const flowerSlots = [
  { id: 'pathfinder', left: 30, top: 9, width: 194, height: 270 },
  { id: 'self-awareness', left: 248, top: 68, width: 189, height: 259 },
  { id: 'healing', left: 92, top: 288, width: 200, height: 195 },
] as const;

const openFlowerSources = [
  require('../../../assets/restored/growth-flower-cutouts/open-flower-a.png'),
  require('../../../assets/restored/growth-flower-cutouts/open-flower-b.png'),
] as const;

const flowerSourceSizes = [
  { width: 194, height: 270 },
  { width: 189, height: 259 },
  { width: 200, height: 195 },
] as const;

const flowerLabelBoxes = [
  [46, 231, 211, 277],
  [267, 278, 422, 318],
  [116, 419, 266, 475],
] as const;

export function GrowthArtwork({ width, kind, unlocked, flowerStates, onLabelPress, onFlowerPress }: Props) {
  const tree = kind === 'tree';
  const scale = width / (tree ? metadata.tree.size_px[0] : metadata.flowers.size_px[0]);
  const positioned = (box: readonly number[]) => ({ left: box[0] * scale, top: box[1] * scale, width: (box[2] - box[0]) * scale, height: (box[3] - box[1]) * scale });
  const labelHitSlop = (box: readonly number[]) => {
    const vertical = Math.max(5, (44 - (box[3] - box[1]) * scale) / 2);
    return { left: 12, right: 12, top: vertical, bottom: vertical };
  };
  const [openFlowerChoices] = useState(() =>
    flowerSlots.map(() => Math.floor(Math.random() * openFlowerSources.length)),
  );
  const source = tree
    ? require('../../../assets/restored/growth-tree.png')
    : require('../../../assets/restored/growth-flower-cutouts/background.png');
  const defaultUnlocked = Boolean(unlocked);
  const states: Record<GrowthFlowerId, boolean> = {
    pathfinder: flowerStates?.pathfinder ?? defaultUnlocked,
    'self-awareness': flowerStates?.['self-awareness'] ?? defaultUnlocked,
    healing: flowerStates?.healing ?? defaultUnlocked,
  };
  return <View style={{ width, height: (tree ? 616 : 495) * scale, alignSelf: 'center' }}>
    <Image source={source} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="stretch" accessible={false} />
    {tree ? <>
      {metadata.tree.labels.filter(label => label.id !== 'ribbon').map(label => <Pressable key={label.text} accessibilityRole="button" accessibilityLabel={`查看${label.text}记忆锚点`} onPress={() => onLabelPress?.({ id: label.id, text: label.text })} hitSlop={labelHitSlop(label.text_box_px)} style={({ pressed }) => [s.label, positioned(label.text_box_px), pressed && s.pressed]}><Text style={[s.treeText, { fontSize: 16 * scale }]}>{label.text}</Text></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel="查看记忆花朵" onPress={onFlowerPress} hitSlop={{ left: 12, right: 12, top: 14, bottom: 14 }} style={[s.label, positioned(metadata.tree.labels.find(label => label.id === 'ribbon')!.text_box_px)]}><Text style={[s.ribbonText, { fontSize: 14 * scale }]}>人生旷野的寻路者</Text></Pressable>
      {[[67, 190, 223, 340], [186, 333, 340, 444]].map((box, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`查看第${i + 1}朵记忆花`} onPress={onFlowerPress} style={[s.label, positioned(box)]} />)}
    </> : <>
      {flowerSlots.map((slot, index) => {
        const flowerId = slot.id;
        const flowerUnlocked = states[flowerId];
        const sourceIndex = flowerUnlocked ? openFlowerChoices[index] : 2;
        const itemSource = flowerUnlocked
          ? openFlowerSources[sourceIndex]
          : require('../../../assets/restored/growth-flower-cutouts/locked-gray-brown-bud.png');
        const sourceSize = flowerSourceSizes[sourceIndex];
        const itemScale = Math.min(slot.width / sourceSize.width, slot.height / sourceSize.height);
        const itemWidth = sourceSize.width * itemScale;
        const itemHeight = sourceSize.height * itemScale;
        return <Image
          key={flowerId}
          testID={`growth-flower-art-${flowerId}`}
          source={itemSource}
          resizeMode="stretch"
          style={{
            position: 'absolute',
            left: (slot.left + (slot.width - itemWidth) / 2) * scale,
            top: (slot.top + slot.height - itemHeight) * scale,
            width: itemWidth * scale,
            height: itemHeight * scale,
          }}
          accessible={false}
        />;
      })}
      {metadata.flowers.labels.map((label, index) => {
        const flowerId = flowerSlots[index].id;
        const flowerUnlocked = states[flowerId];
        return <View
          key={label.text}
          accessibilityLabel={`${label.text}，${flowerUnlocked ? '已绽放' : '未解锁'}`}
          style={[s.flowerLabel, positioned(flowerLabelBoxes[index])]}
        >
          <Text numberOfLines={1} style={[s.flowerTitle, { fontSize: 12 * scale, lineHeight: 16 * scale }, !flowerUnlocked && s.lockedText]}>
            {label.text}
          </Text>
          <Text numberOfLines={1} style={[s.flowerStatus, { fontSize: 10 * scale, lineHeight: 13 * scale }, !flowerUnlocked && s.lockedText]}>
            {flowerUnlocked ? '· 已绽放' : '· 未解锁'}
          </Text>
        </View>;
      })}
    </>}
  </View>;
}
const s = StyleSheet.create({
  label: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  flowerLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  treeText: { color: '#634B34', fontWeight: '500' }, ribbonText: { color: '#4C3218', fontWeight: '600' },
  flowerTitle: { color: '#50381F', textAlign: 'center', fontWeight: '500' },
  flowerStatus: { color: '#806C58', textAlign: 'center', fontWeight: '400' },
  lockedText: { color: '#877057', fontWeight: '400' }, pressed: { opacity: 0.55 },
});
