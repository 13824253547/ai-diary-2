import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../../src/components/layout/screen";
import { BottomSheet } from "../../src/components/common/bottom-sheet";
import { TopBar } from "../../src/components/layout/top-bar";
import { Button } from "../../src/components/common/button";
import {
  EmptyResult,
  supportStyles as u,
} from "../../src/components/common/support-ui";
import { getHistoryGroups, useAppStore } from "../../src/store/use-app-store";
import { art } from "../../src/theme/assets";
import { colors } from "../../src/theme/tokens";
import { Photo } from "../../src/components/diary/photo";

const covers = [art.bookOrange, art.bookBlue, art.bookGreen, art.bookPink];
const coverColors = ["#ffa132", "#84c5e6", "#b5ce75", "#eabfc1"];

export default function MonthlyScreen() {
  const router = useRouter();
  const { month } = useLocalSearchParams<{ month?: string }>();
  const diaries = useAppStore((s) => s.diaries);
  const monthlyExport = useAppStore((s) => s.monthlyExport);
  const startMonthlyExport = useAppStore((s) => s.startMonthlyExport);
  const cancelMonthlyExport = useAppStore((s) => s.cancelMonthlyExport);
  const groups = getHistoryGroups(diaries);
  const requestedGroupId = useMemo(() => {
    if (!month) return null;
    const normalized = month.replace(/\./g, "-");
    return (
      groups.find(
        (g) => g.id === `history-${normalized}` || g.label.includes(month),
      )?.id ?? null
    );
  }, [groups, month]);
  const [selectedId, setSelectedId] = useState<string | null>(requestedGroupId);
  const lastHandledExportRequestId = useRef(0);

  useEffect(() => {
    setSelectedId(requestedGroupId);
  }, [requestedGroupId]);

  useEffect(() => {
    if (
      monthlyExport.requestId === 0 ||
      monthlyExport.status === "idle" ||
      monthlyExport.status === "running"
    ) {
      return;
    }
    if (lastHandledExportRequestId.current === monthlyExport.requestId) {
      return;
    }
    lastHandledExportRequestId.current = monthlyExport.requestId;
    if (monthlyExport.status === "succeeded" && monthlyExport.result) {
      Alert.alert("导出已完成", monthlyExport.result.previewMessage);
      return;
    }
    if (monthlyExport.status === "cancelled") {
      Alert.alert("已取消", monthlyExport.error ?? "本次月度导出已取消。");
      return;
    }
    if (monthlyExport.status === "failed") {
      Alert.alert(
        "导出失败",
        monthlyExport.error ?? "月度导出失败，请稍后重试。",
      );
    }
  }, [monthlyExport]);

  const selected = groups.find((g) => g.id === selectedId);
  const selectedGroupId = selected?.id;
  const selectedLabel = selected?.label;
  const isSelectedExportRunning =
    Boolean(selectedGroupId) &&
    monthlyExport.status === "running" &&
    monthlyExport.groupId === selectedGroupId;
  const isOtherExportRunning =
    Boolean(selectedGroupId) &&
    monthlyExport.status === "running" &&
    monthlyExport.groupId !== selectedGroupId;
  const exportHint =
    selectedGroupId && monthlyExport.groupId === selectedGroupId
      ? monthlyExport.status === "running"
        ? `正在整理 ${selectedLabel} 的成员快照...`
        : monthlyExport.status === "succeeded"
          ? monthlyExport.result?.previewMessage
          : monthlyExport.error
      : isOtherExportRunning
        ? `当前正在整理 ${monthlyExport.monthLabel ?? "其他月份"} 的月度合集，重新导出会覆盖这次任务。`
        : undefined;

  return (
    <Screen
      header={
        <TopBar title="月度装订" centered onBackPress={() => router.back()} />
      }
    >
      <Text style={s.intro}>把每个月的心情，装订成一本小小的日记。</Text>
      {groups.length === 0 ? (
        <EmptyResult title="先写下第一篇日记吧" />
      ) : (
        <View style={s.grid}>
          {groups.map((g, i) => (
            <Pressable
              accessibilityLabel={`打开${g.label}合集`}
              key={g.id}
              onPress={() => setSelectedId(g.id)}
              style={s.book}
            >
              <View style={s.cover}>
                <Image source={covers[i % covers.length]} style={s.image} />
                <View
                  style={[
                    s.coverLabel,
                    { backgroundColor: coverColors[i % coverColors.length] },
                  ]}
                >
                  <Text style={s.coverTitle}>AI日记</Text>
                  <Text style={s.coverMonth}>{g.label}</Text>
                </View>
              </View>
              <Text style={s.month}>{g.label}</Text>
              <Text style={s.count}>{g.diaryIds.length} 篇回忆 · 点击翻阅</Text>
            </Pressable>
          ))}
        </View>
      )}
      <BottomSheet
        visible={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected ? `${selected.label} · 月度合集` : ""}
        scroll
        maxHeight="90%"
        sheetStyle={s.sheet}
        contentContainerStyle={s.sheetContent}
      >
        {selected?.diaryIds.map((id) => {
          const diary = diaries.find((item) => item.id === id);
          return diary ? (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`打开${diary.title}，${diary.date}`}
              style={s.diary}
              onPress={() => {
                setSelectedId(null);
                router.push(`/diary/${id}`);
              }}
            >
              <Photo
                id={diary.coverPhotoId}
                diaryId={diary.id}
                style={s.diaryImage}
              />
              <View style={s.diaryMeta}>
                <Text style={u.body}>{diary.title}</Text>
                <Text style={u.muted}>{diary.date}</Text>
              </View>
            </Pressable>
          ) : null;
        })}
        {/* <View style={s.actions}>
          <Button
            label={
              isSelectedExportRunning
                ? "正在导出这个月的回忆..."
                : "导出这个月的回忆"
            }
            onPress={() => {
              if (!selected) return;
              void startMonthlyExport(selected.id);
            }}
          />
          {isSelectedExportRunning ? (
            <Button
              label="取消本次导出"
              variant="secondary"
              onPress={cancelMonthlyExport}
            />
          ) : null}
          {exportHint ? <Text style={s.exportHint}>{exportHint}</Text> : null}
        </View> */}
      </BottomSheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 23 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  book: { width: "47%", gap: 6 },
  cover: {
    width: "100%",
    aspectRatio: 0.62,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  coverLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "34%",
    paddingHorizontal: 12,
    paddingTop: 13,
    gap: 4,
  },
  coverTitle: { fontSize: 27, color: "#fff", fontWeight: "600" },
  coverMonth: { color: "#fff", fontSize: 13 },
  month: { fontSize: 14, color: colors.textPrimary, fontWeight: "600" },
  count: { fontSize: 11, color: colors.textMuted },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { paddingBottom: 4 },
  diary: { flexDirection: "row", gap: 12, alignItems: "center" },
  diaryImage: { width: 68, height: 56, borderRadius: 8 },
  diaryMeta: { flex: 1, gap: 5 },
  actions: { gap: 12 },
  exportHint: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
});
