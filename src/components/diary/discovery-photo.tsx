import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { createDiscoveryMediaSource } from '../../services/discovery-media';

type Props = {
  uri: string;
  accessibilityLabel: string;
  style?: StyleProp<ImageStyle>;
  testID?: string;
};

export function DiscoveryPhoto({ uri, accessibilityLabel, style, testID }: Props) {
  const [source, setSource] = useState<ImageSourcePropType>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSource(undefined);
    setFailed(false);
    void createDiscoveryMediaSource(uri).then(nextSource => {
      if (!active) return;
      if (!nextSource) {
        setFailed(true);
        return;
      }
      setSource(nextSource);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [uri]);

  if (failed) {
    return (
      <View
        accessibilityLabel="图片暂时无法显示"
        style={[style as StyleProp<ViewStyle>, s.fallback]}
      >
        <Text style={s.fallbackText}>图片暂时无法显示</Text>
      </View>
    );
  }

  if (!source) {
    return (
      <View
        accessibilityLabel="正在加载故事图片"
        style={[style as StyleProp<ViewStyle>, s.loading]}
      />
    );
  }

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      source={source}
      resizeMode="cover"
      style={style}
      testID={testID}
      onError={() => setFailed(true)}
    />
  );
}

const s = StyleSheet.create({
  fallback: { overflow: 'hidden', backgroundColor: '#EFE3D5', alignItems: 'center', justifyContent: 'center' },
  fallbackText: { paddingHorizontal: 12, color: '#8B7866', fontSize: 12, textAlign: 'center' },
  loading: { overflow: 'hidden', backgroundColor: '#EFE3D5' },
});
