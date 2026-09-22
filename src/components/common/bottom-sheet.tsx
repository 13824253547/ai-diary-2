import { Ionicons } from "@expo/vector-icons";
import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/tokens";

const INITIAL_HIDDEN_OFFSET = 640;

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  showClose?: boolean;
  scroll?: boolean;
  maxHeight?: number | `${number}%`;
  sheetStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  useModal?: boolean;
}>;

export function BottomSheet({
  visible,
  onClose,
  onAfterClose,
  title,
  actionLabel,
  onAction,
  showClose = true,
  scroll = false,
  maxHeight = "82%",
  sheetStyle,
  contentContainerStyle,
  useModal = true,
  children,
}: BottomSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(
    new Animated.Value(visible ? 0 : INITIAL_HIDDEN_OFFSET),
  ).current;
  const hiddenOffsetRef = useRef(INITIAL_HIDDEN_OFFSET);

  function getHiddenOffset() {
    return hiddenOffsetRef.current;
  }

  useEffect(() => {
    if (visible) {
      backdropOpacity.stopAnimation();
      translateY.stopAnimation();
      backdropOpacity.setValue(0);
      translateY.setValue(getHiddenOffset());
      setRendered(true);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            damping: 24,
            mass: 0.9,
            stiffness: 240,
            useNativeDriver: true,
          }),
        ]).start();
      });
      return;
    }

    backdropOpacity.stopAnimation();
    translateY.stopAnimation();
    Animated.sequence([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: getHiddenOffset(),
        duration: 300,
        easing: Easing.bezier(0.22, 0.8, 0.2, 1),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setRendered(false);
        onAfterClose?.();
      }
    });
  }, [backdropOpacity, onAfterClose, translateY, visible]);

  if (!rendered) return null;

  const resolvedMaxHeight =
    typeof maxHeight === "number"
      ? maxHeight
      : typeof maxHeight === "string" && maxHeight.endsWith("%")
        ? (windowHeight * Number(maxHeight.replace("%", ""))) / 100
        : windowHeight * 0.82;

  const bodyMaxHeight = Math.max(
    resolvedMaxHeight - headerHeight - 24 - insets.bottom,
    120,
  );
  const shouldScroll = scroll && contentHeight > bodyMaxHeight;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      scrollEnabled={shouldScroll}
      showsVerticalScrollIndicator={shouldScroll}
      onContentSizeChange={(_, height) => setContentHeight(height)}
      style={[styles.scrollBody, { maxHeight: bodyMaxHeight }]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentContainerStyle]}>{children}</View>
  );

  const content = (
    <View style={useModal ? styles.host : styles.inlineHost}>
      <Animated.View
        pointerEvents="none"
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      />
      <Pressable
        accessibilityLabel="关闭面板"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.wrap, { transform: [{ translateY }] }]}>
        <View
          onLayout={(event) => {
            hiddenOffsetRef.current = Math.max(
              event.nativeEvent.layout.height + insets.bottom + 36,
              INITIAL_HIDDEN_OFFSET,
            );
          }}
          style={[
            styles.sheet,
            { maxHeight: resolvedMaxHeight, paddingBottom: 24 + insets.bottom },
            sheetStyle,
          ]}
        >
          {title || actionLabel || showClose ? (
            <View
              style={styles.header}
              onLayout={(event) =>
                setHeaderHeight(event.nativeEvent.layout.height)
              }
            >
              <Text style={styles.placeholder}>
                {showClose || actionLabel ? " " : ""}
              </Text>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.headerRight}>
                {actionLabel ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onAction}
                    hitSlop={10}
                  >
                    <Text style={styles.action}>{actionLabel}</Text>
                  </Pressable>
                ) : null}
                {showClose ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="关闭"
                    onPress={onClose}
                    hitSlop={12}
                  >
                    <Ionicons
                      name="close"
                      size={23}
                      color={colors.textPrimary}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {body}
        </View>
      </Animated.View>
    </View>
  );

  if (!useModal) {
    return content;
  }

  return (
    <Modal
      transparent
      visible={rendered}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    justifyContent: "flex-end",
  },
  inlineHost: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(33,25,16,0.38)",
  },
  wrap: {
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  placeholder: {
    minWidth: 24,
    color: "transparent",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  headerRight: {
    minWidth: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  action: {
    fontSize: 14,
    color: colors.brandStrong,
    fontWeight: "600",
  },
  content: {
    gap: 16,
    paddingBottom: 8,
  },
  scrollBody: {
    flexGrow: 0,
  },
});
