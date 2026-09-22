import { Image, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

type AvatarProps = {
  source: number;
  size?: number;
};

export function Avatar({ source, size = 72 }: AvatarProps) {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Image resizeMode="cover" source={source} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

