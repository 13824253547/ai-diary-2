import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { Button } from '../../src/components/common/button';
import { EmptyResult, SearchField, supportStyles as u } from '../../src/components/common/support-ui';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { CityStamp } from '../../src/components/library/city-stamp';
import {
  cityStampCatalogAreas,
  cityStampCatalogSources,
  getCityStampCitiesForArea,
  getCityStampConfig,
  getVisitedCityStampIds,
  isCityStampUnlocked,
  type CityStampCatalogArea,
  type CityStampCatalogEntry,
} from '../../src/components/library/city-stamp-catalog';
import { useAppStore } from '../../src/store/use-app-store';
import { colors } from '../../src/theme/tokens';

export default function CityStampCatalogScreen() {
  const router = useRouter();
  const diaries = useAppStore(state => state.diaries);
  const [activeAreaId, setActiveAreaId] = useState<string>();
  const [search, setSearch] = useState('');
  const [previewCityId, setPreviewCityId] = useState<string>();
  const unlockedIds = useMemo(() => getVisitedCityStampIds(diaries), [diaries]);
  const activeArea = cityStampCatalogAreas.find(area => area.id === activeAreaId);
  const previewCity = previewCityId
    ? getCityStampCitiesForArea(activeAreaId ?? '').find(city => city.id === previewCityId)
    : undefined;
  const previewConfig = previewCity ? getCityStampConfig(previewCity.id) : undefined;
  const isUnlocked = previewCity ? isCityStampUnlocked(previewCity.id, unlockedIds) : false;
  const includesOpenStreetMap = cityStampCatalogSources.some(source => source.license === 'ODbL-1.0');

  const visibleAreas = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return cityStampCatalogAreas.filter(area => (
      area.cityCount > 0
      && (!query || `${area.nameZh} ${area.nameEn} ${area.sourceNameEn}`.toLocaleLowerCase().includes(query))
    ));
  }, [search]);
  const visibleCities = useMemo(() => {
    if (!activeAreaId) return [];
    const query = search.trim().toLocaleLowerCase();
    return getCityStampCitiesForArea(activeAreaId).filter(city => (
      !query
      || `${city.cityName} ${city.latinName} ${city.provinceName ?? ''} ${city.aliases.join(' ')}`
        .toLocaleLowerCase()
        .includes(query)
    ));
  }, [activeAreaId, search]);

  const returnFromScreen = () => {
    if (activeAreaId) {
      setActiveAreaId(undefined);
      setSearch('');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/library');
  };

  const renderArea = ({ item }: { item: CityStampCatalogArea }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`浏览${item.nameZh}城市，${item.cityCount}个`}
      onPress={() => {
        setSearch('');
        setActiveAreaId(item.id);
      }}
      style={styles.row}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.primary}>{item.nameZh}</Text>
        <Text style={styles.secondary}>{item.nameEn}</Text>
      </View>
      <Text style={styles.count}>{item.cityCount} 个</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );

  const renderCity = ({ item }: { item: CityStampCatalogEntry }) => {
    const unlocked = isCityStampUnlocked(item.id, unlockedIds);
    const qualityHints = [
      ...(item.matchConfidence === 'approximate' ? ['近似匹配'] : []),
      ...(item.matchConfidence === 'unmatched' ? ['未核实'] : []),
      ...(item.nameSource === 'wup-original' ? ['原名回退'] : []),
      ...(item.latinNameSource === 'hanyu-pinyin' ? ['汉语拼音'] : []),
    ];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`预览${item.cityName}印章`}
        accessibilityState={{ selected: previewCityId === item.id }}
        onPress={() => setPreviewCityId(item.id)}
        style={styles.row}
      >
        <Text style={styles.serial}>{item.serial}</Text>
        <View style={styles.rowCopy}>
          <Text style={styles.primary}>{item.cityName}</Text>
          <Text style={styles.secondary}>
            {`${item.latinName}${item.provinceName ? ` · ${item.provinceName}` : ''}${qualityHints.length ? ` · ${qualityHints.join(' · ')}` : ''}`}
          </Text>
        </View>
        <Ionicons
          name={unlocked ? 'lock-open-outline' : 'lock-closed-outline'}
          size={17}
          color={unlocked ? colors.brandStrong : colors.textMuted}
        />
      </Pressable>
    );
  };

  return (
    <Screen
      header={
        <TopBar
          title={activeArea?.nameZh ?? '城市印章'}
          centered
          onBackPress={returnFromScreen}
        />
      }
      scroll={false}
      contentStyle={styles.content}
    >
      <View style={styles.intro}>
        <Text style={u.body}>
          {activeArea
            ? `${activeArea.nameEn} · 按名称排序`
            : '按国家或地区浏览全球城市'}
        </Text>
        <Text style={u.muted}>
          {activeArea
            ? activeArea.id === 'CN'
              ? '仅含直辖市和地级市；不含县级市、县、区、镇、街道。'
              : '城市可预览；近似匹配或未核实记录仅供浏览，不能用于明信片。'
            : `${visibleAreas.length} 个国家或地区`}
        </Text>
      </View>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={activeArea ? '搜索中文名或英文名' : '搜索国家或地区'}
      />
      {activeArea ? (
        visibleCities.length ? (
          <FlatList
            data={visibleCities}
            keyExtractor={item => item.id}
            renderItem={renderCity}
            initialNumToRender={18}
            maxToRenderPerBatch={24}
            windowSize={9}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
          />
        ) : (
          <EmptyResult title="没有找到匹配城市" />
        )
      ) : visibleAreas.length ? (
        <FlatList
          data={visibleAreas}
          keyExtractor={item => item.id}
          renderItem={renderArea}
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      ) : (
        <EmptyResult title="没有找到国家或地区" />
      )}
      {includesOpenStreetMap ? (
        <View style={styles.sourceFooter}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="OpenStreetMap 贡献者署名与 ODbL 许可"
            onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
          >
            <Text style={styles.attributionText}>
              © OpenStreetMap contributors · ODbL-1.0
            </Text>
          </Pressable>
        </View>
      ) : null}
      <BottomSheet
        visible={Boolean(previewCity && previewConfig)}
        onClose={() => setPreviewCityId(undefined)}
        title={previewCity?.cityName}
        scroll
        maxHeight="85%"
        sheetStyle={styles.sheet}
        contentContainerStyle={styles.sheetContent}
      >
        {previewCity && previewConfig ? (
          <>
            <CityStamp {...previewConfig} width="100%" height={270} testID="catalog-city-stamp-preview" />
            <Text style={u.body}>
              {previewCity.cityName} · {previewCity.latinName}
            </Text>
            <Text style={u.muted}>
              {`${previewCity.provinceName ? `${previewCity.provinceName} · ` : ''}${previewCity.areaNameZh} · ${previewCity.areaNameEn} · ${previewCity.serial}`}
            </Text>
            {previewCity.administrativeLevel ? (
              <Text style={u.muted}>
                {`${previewCity.administrativeLevel === 'municipality' ? '直辖市' : '地级市'} · 行政区划代码 ${previewCity.administrativeCode}`}
              </Text>
            ) : null}
            {previewCity.latinNameSource === 'hanyu-pinyin' ? (
              <Text style={u.muted}>拉丁字母为官方中文名称的无声调汉语拼音转写。</Text>
            ) : null}
            {previewCity.matchConfidence === 'approximate' ? (
              <Text style={u.muted}>
                根据附近地名自动匹配，城市对应关系可能有误；此印章仅供预览。
              </Text>
            ) : null}
            {previewCity.matchConfidence === 'unmatched' ? (
              <Text style={u.muted}>
                未找到可靠的城市对应记录，当前显示联合国原始名称；此印章仅供预览。
              </Text>
            ) : null}
            {previewCity.nameSource === 'wup-original' ? (
              <Text style={u.muted}>未做译名补全，当前沿用联合国原始城市名称。</Text>
            ) : null}
            <Text accessibilityLiveRegion="polite" style={isUnlocked ? styles.unlocked : styles.locked}>
              {isUnlocked
                ? '已解锁，可用于明信片。'
                : previewCity.matchConfidence === 'approximate'
                  || previewCity.matchConfidence === 'unmatched'
                  ? '此城市记录未达到解锁可信度要求。'
                  : '尚未解锁。保存一篇地点与城市名称精确匹配的日记后即可应用。'}
            </Text>
            <Button
              label="用于明信片"
              disabled={!isUnlocked}
              onPress={() => {
                if (!isUnlocked) return;
                setPreviewCityId(undefined);
                router.push({ pathname: '/postcard', params: { decoration: previewCity.id } });
              }}
            />
          </>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingBottom: 10, gap: 12 },
  intro: { gap: 2 },
  list: { paddingBottom: 14 },
  sourceFooter: { alignItems: 'center', gap: 3, paddingVertical: 6 },
  attributionText: { color: colors.textMuted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  row: {
    minHeight: 67,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowCopy: { flex: 1, gap: 3 },
  primary: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  secondary: { color: colors.textMuted, fontSize: 11 },
  count: { color: colors.textSecondary, fontSize: 12 },
  serial: { width: 28, color: colors.brandStrong, fontSize: 12, fontVariant: ['tabular-nums'] },
  sheet: { paddingHorizontal: 20, paddingBottom: 38, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { gap: 12 },
  unlocked: { color: colors.brandStrong, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  locked: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
