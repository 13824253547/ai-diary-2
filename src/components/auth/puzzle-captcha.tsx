import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AccountAuthError, requestCaptcha, type CaptchaChallenge } from '../../services/account-auth';
import { colors } from '../../theme/tokens';

export type PuzzleCaptchaHandle = {
  getProof: () => { challengeId: string; x: number } | undefined;
  refresh: () => Promise<void>;
};

type Props = { purpose: 'register' | 'login' };

const DESIGN_WIDTH = 320;
const PUZZLE_HEIGHT = 160;
const PIECE_SIZE = 48;

export const PuzzleCaptcha = forwardRef<PuzzleCaptchaHandle, Props>(function PuzzleCaptcha({ purpose }, ref) {
  const [challenge, setChallenge] = useState<CaptchaChallenge>();
  const [width, setWidth] = useState(DESIGN_WIDTH);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const startOffset = useRef(0);
  const offsetRef = useRef(offset);
  const widthRef = useRef(width);
  const challengeRef = useRef(challenge);
  const enabledRef = useRef(Boolean(challenge) && !loading);
  offsetRef.current = offset;
  widthRef.current = width;
  challengeRef.current = challenge;
  enabledRef.current = Boolean(challenge) && !loading;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setChallenge(undefined);
    challengeRef.current = undefined;
    offsetRef.current = 0;
    setOffset(0);
    try {
      setChallenge(await requestCaptcha(purpose));
    } catch (caught) {
      setError(caught instanceof AccountAuthError ? caught.message : '图形验证暂时不可用，请重试。');
    } finally {
      setLoading(false);
    }
  }, [purpose]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useImperativeHandle(ref, () => ({
    getProof: () => challengeRef.current
      ? { challengeId: challengeRef.current.challengeId, x: Math.round(offsetRef.current / widthRef.current * challengeRef.current.width) }
      : undefined,
    refresh,
  }), [challenge, offset, refresh, width]);

  const setClampedOffset = (next: number) => {
    const current = challengeRef.current;
    const max = Math.max(0, widthRef.current * (1 - (current?.pieceSize ?? PIECE_SIZE) / (current?.width ?? DESIGN_WIDTH)));
    const value = Math.max(0, Math.min(max, next));
    offsetRef.current = value;
    setOffset(value);
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => enabledRef.current,
    onMoveShouldSetPanResponder: () => enabledRef.current,
    onPanResponderGrant: () => { startOffset.current = offsetRef.current; },
    onPanResponderMove: (_event, gesture) => {
      setClampedOffset(startOffset.current + gesture.dx);
    },
    onPanResponderRelease: () => { startOffset.current = 0; },
    onPanResponderTerminate: () => { startOffset.current = 0; },
  })).current;

  const scale = width / (challenge?.width ?? DESIGN_WIDTH);
  const pieceSize = (challenge?.pieceSize ?? PIECE_SIZE) * scale;

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>完成图形验证</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="刷新图形验证" onPress={() => void refresh()} disabled={loading}>
          <Text style={styles.refresh}>换一张</Text>
        </Pressable>
      </View>
      <View
        accessibilityLabel="拼图验证背景"
        onLayout={event => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth <= 0) return;
          const nextOffset = offsetRef.current * nextWidth / widthRef.current;
          widthRef.current = nextWidth;
          setWidth(nextWidth);
          setClampedOffset(nextOffset);
        }}
        style={[styles.puzzle, { aspectRatio: (challenge?.width ?? DESIGN_WIDTH) / (challenge?.height ?? PUZZLE_HEIGHT) }]}
      >
        {challenge ? (
          <>
            <Image source={{ uri: challenge.background }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
            <Image
              source={{ uri: challenge.piece }}
              accessibilityLabel="可移动拼图块"
              style={{
                position: 'absolute',
                left: offset,
                top: challenge.pieceTop * scale,
                width: pieceSize,
                height: pieceSize,
              }}
              resizeMode="stretch"
            />
          </>
        ) : <Text style={styles.hint}>{loading ? '正在准备验证...' : '验证图片暂不可用'}</Text>}
      </View>
      <View
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="拖动拼图块，对齐缺口"
        accessibilityValue={{ min: 0, max: Math.max(1, Math.round(width - pieceSize)), now: Math.round(offset) }}
        accessibilityActions={[{ name: 'increment', label: '向右移动' }, { name: 'decrement', label: '向左移动' }]}
        onAccessibilityAction={event => {
          const delta = event.nativeEvent.actionName === 'increment' ? 8 : -8;
          setClampedOffset(offsetRef.current + delta);
        }}
        style={styles.slider}
      >
        <View style={styles.track}><View style={[styles.progress, { width: offset + pieceSize / 2 }]} /></View>
        <View style={[styles.handle, { left: offset, width: pieceSize }]}>
          <Text style={styles.handleText}>⇆</Text>
        </View>
      </View>
      <Text accessibilityLiveRegion="polite" style={error ? styles.error : styles.hint}>
        {error || '拖动拼图块，使它与图片中的缺口对齐'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  refresh: { color: colors.brandStrong, fontSize: 13 },
  puzzle: { width: '100%', overflow: 'hidden', borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  slider: { height: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: 8, backgroundColor: colors.border },
  progress: { height: 8, borderRadius: 8, backgroundColor: colors.brand },
  handle: { position: 'absolute', top: 0, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.brandStrong, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  handleText: { color: colors.brandStrong, fontSize: 20, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});
