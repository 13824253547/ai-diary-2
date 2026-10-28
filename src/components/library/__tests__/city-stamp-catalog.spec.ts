import {
  cityStampCatalogAreas,
  cityStampCatalogCities,
  cityStampCatalogSources,
  getCityStampConfig,
  getVisitedCityStampIds,
  isCityStampUnlocked,
  resolveCityStampLocationMatch,
  splitDiaryLocation,
} from '../city-stamp-catalog';
import type { CityStampCatalogArea, CityStampCatalogEntry } from '../city-stamp-catalog';
import type { DiaryItem } from '../../../types/diary';

function diary(location: string, status: DiaryItem['status'] = 'ready') {
  return {
    id: 'saved-diary',
    status,
    location,
    createdInSession: true,
  } as DiaryItem;
}

describe('city stamp catalog', () => {
  test('contains all international WUP areas and 297 official mainland city units', () => {
    expect(cityStampCatalogCities).toHaveLength(14_665);
    expect(cityStampCatalogAreas).toHaveLength(194);
    expect(new Set(cityStampCatalogCities.map(city => city.id)).size).toBe(cityStampCatalogCities.length);
    expect(cityStampCatalogCities.filter(city => city.areaId === 'CN')).toHaveLength(297);
    expect(cityStampCatalogSources.map(source => source.name)).toEqual(expect.arrayContaining([
      expect.stringContaining('World Urbanization Prospects 2025'),
      expect.stringContaining('Ministry of Civil Affairs administrative division codes'),
      'GeoNames cities1000',
      'GeoNames cities500',
      'GeoNames alternate names',
      'UNGEGN World Geographical Names API',
      'Wikidata Chinese labels linked by GeoNames identifier',
      'Wikidata English/Chinese city labels and coordinates',
    ]));

    for (const area of cityStampCatalogAreas) {
      const cities = cityStampCatalogCities.filter(city => city.areaId === area.id);
      expect(area.cityCount).toBe(cities.length);
      expect(area.nameZh).not.toBe('');
      expect(area.nameEn).not.toBe('');
      cities.forEach((city, index) => {
        expect(city.cityName.trim()).not.toBe('');
        expect(city.latinName.trim()).not.toBe('');
        expect(city.serial).toBe(String(index + 1).padStart(2, '0'));
      });
    }
  });

  test('assigns stable unique ink colors to every city stamp', () => {
    const configs = cityStampCatalogCities.map(city => getCityStampConfig(city.id));
    const palettes = configs.filter(
      (config): config is NonNullable<typeof config> => config !== undefined,
    );

    expect(palettes).toHaveLength(cityStampCatalogCities.length);
    expect(new Set(palettes.map(config => config.inkColor)).size).toBe(palettes.length);
    expect(new Set(palettes.map(config => `${config.inkColor}:${config.accentColor}`)).size)
      .toBe(palettes.length);
    const sampleId = cityStampCatalogCities[0]?.id;
    expect(sampleId).toBeDefined();
    if (!sampleId) return;

    const firstConfig = getCityStampConfig(sampleId);
    const secondConfig = getCityStampConfig(sampleId);
    expect(secondConfig).toMatchObject({
      inkColor: firstConfig?.inkColor,
      accentColor: firstConfig?.accentColor,
    });
  });

  test.each([
    ['CN', '中国大陆', 'MAINLAND CHINA'],
    ['CN-HK', '中国香港', 'HONG KONG · CHINA'],
    ['CN-MO', '中国澳门', 'MACAO · CHINA'],
    ['CN-TW', '中国台湾', 'TAIWAN · CHINA'],
  ])('uses the approved display labels for %s', (id, nameZh, nameEn) => {
    expect(cityStampCatalogAreas.find(area => area.id === id)).toMatchObject({ nameZh, nameEn });
    expect(cityStampCatalogCities.filter(city => city.areaId === id).length).toBeGreaterThan(0);
  });

  test('lists Mainland China before Taiwan', () => {
    const mainlandIndex = cityStampCatalogAreas.findIndex(area => area.id === 'CN');
    const taiwanIndex = cityStampCatalogAreas.findIndex(area => area.id === 'CN-TW');

    expect(mainlandIndex).toBeGreaterThanOrEqual(0);
    expect(taiwanIndex).toBeGreaterThanOrEqual(0);
    expect(mainlandIndex).toBeLessThan(taiwanIndex);
  });

  test('uses only official municipalities and prefecture-level cities for Mainland China', () => {
    const mainlandCities = cityStampCatalogCities.filter(city => city.areaId === 'CN');
    const byCode = new Map(mainlandCities.map(city => [city.administrativeCode, city]));

    expect(byCode.get('110000')).toMatchObject({
      cityName: '北京市',
      administrativeLevel: 'municipality',
      provinceName: '北京市',
    });
    expect(byCode.get('440500')).toMatchObject({
      cityName: '汕头市',
      latinName: 'Shantou',
      administrativeLevel: 'prefecture-level-city',
      provinceName: '广东省',
    });
    expect(byCode.get('445200')).toMatchObject({
      cityName: '揭阳市',
      latinName: 'Jieyang',
      administrativeLevel: 'prefecture-level-city',
      provinceName: '广东省',
    });
    expect(mainlandCities.every(city => city.cityName.endsWith('市'))).toBe(true);
    expect(mainlandCities.some(city => city.cityName === '揭西县')).toBe(false);
    expect(mainlandCities.some(city => city.latinName === 'Jiexi')).toBe(false);
    expect(mainlandCities.every(city => city.nameSource === 'mca-administrative-code')).toBe(true);
  });

  test('matches Shantou and Jieyang by official names and province', () => {
    const shantou = cityStampCatalogCities.find(city => city.administrativeCode === '440500');
    const jieyang = cityStampCatalogCities.find(city => city.administrativeCode === '445200');

    expect(shantou).toBeDefined();
    expect(jieyang).toBeDefined();
    expect(getVisitedCityStampIds([diary('汕头市，广东省')])).toContain(shantou?.id);
    expect(getVisitedCityStampIds([diary('Jieyang, 广东省')])).toContain(jieyang?.id);
    expect(getVisitedCityStampIds([diary('揭西县，广东省')])).not.toContain(jieyang?.id);
  });

  test('requires province information to disambiguate same-name mainland cities', () => {
    const candidates: CityStampCatalogEntry[] = [
      {
        id: 'jilin-city',
        cityName: '测试市',
        latinName: 'Test City',
        areaId: 'CN',
        areaNameZh: '中国大陆',
        areaNameEn: 'MAINLAND CHINA',
        provinceName: '吉林省',
        serial: '01',
        aliases: [],
      },
      {
        id: 'jiangsu-city',
        cityName: '测试市',
        latinName: 'Test City',
        areaId: 'CN',
        areaNameZh: '中国大陆',
        areaNameEn: 'MAINLAND CHINA',
        provinceName: '江苏省',
        serial: '02',
        aliases: [],
      },
    ];

    expect(resolveCityStampLocationMatch(
      splitDiaryLocation('测试市'),
      candidates,
    )).toEqual([]);
    expect(resolveCityStampLocationMatch(
      splitDiaryLocation('测试市，吉林省'),
      candidates,
    )).toEqual([candidates[0]]);
  });

  test('displays the Macau city without Zhuhai and only unlocks from Macau', () => {
    const macau = cityStampCatalogCities.find(city => city.id === 'wup-mac-11460');
    expect(macau).toBeDefined();
    expect(macau?.cityName).toBe('澳门');
    expect(macau?.latinName).toBe('Macau');
    expect(macau?.aliases).not.toEqual(expect.arrayContaining(['珠海', 'Zhuhai']));
    expect(getVisitedCityStampIds([diary('澳门')])).toContain(macau?.id);
    expect(getVisitedCityStampIds([diary('珠海')])).not.toContain(macau?.id);
    expect(getVisitedCityStampIds([diary('Zhuhai')])).not.toContain(macau?.id);
  });

  test('unlocks only saved ready diary locations with exact city-name matches', () => {
    const tainan = cityStampCatalogCities.find(city => city.latinName === 'Tainan');
    expect(tainan).toBeDefined();
    if (!tainan) return;

    const unlocked = getVisitedCityStampIds([
      diary(`旅行 · ${tainan.latinName} · 安平`),
    ]);
    expect(unlocked).toContain(tainan.id);
    expect(isCityStampUnlocked(tainan.id, unlocked)).toBe(true);
    expect(getVisitedCityStampIds([diary(`near ${tainan.latinName}`)])).not.toContain(tainan.id);
    expect(getVisitedCityStampIds([diary(tainan.latinName, 'draft')])).not.toContain(tainan.id);
  });

  test('keeps same-name cities locked unless a location includes one unique area label', () => {
    const candidates: CityStampCatalogEntry[] = [
      {
        id: 'fr-test',
        cityName: '双城',
        latinName: 'Twin City',
        areaId: 'FR',
        areaNameZh: '法国',
        areaNameEn: 'FRANCE',
        serial: '01',
        aliases: [],
      },
      {
        id: 'de-test',
        cityName: '双城',
        latinName: 'Twin City',
        areaId: 'DE',
        areaNameZh: '德国',
        areaNameEn: 'GERMANY',
        serial: '01',
        aliases: [],
      },
    ];
    const areas: CityStampCatalogArea[] = [
      { id: 'FR', nameZh: '法国', nameEn: 'FRANCE', sourceNameEn: 'France', cityCount: 1 },
      { id: 'DE', nameZh: '德国', nameEn: 'GERMANY', sourceNameEn: 'Germany', cityCount: 1 },
    ];

    expect(resolveCityStampLocationMatch(splitDiaryLocation('Twin City'), candidates, areas)).toEqual([]);
    expect(resolveCityStampLocationMatch(
      splitDiaryLocation('Twin City, France'),
      candidates,
      areas,
    )).toEqual([candidates[0]]);
  });

  test('does not unlock approximate or unmatched catalog records', () => {
    const candidates: CityStampCatalogEntry[] = [
      {
        id: 'approximate-city',
        cityName: '近似城市',
        latinName: 'Approximate City',
        areaId: 'FR',
        areaNameZh: '法国',
        areaNameEn: 'FRANCE',
        serial: '01',
        aliases: [],
        matchConfidence: 'approximate',
      },
      {
        id: 'unmatched-city',
        cityName: '未核实城市',
        latinName: 'Unmatched City',
        areaId: 'FR',
        areaNameZh: '法国',
        areaNameEn: 'FRANCE',
        serial: '02',
        aliases: [],
        matchConfidence: 'unmatched',
      },
    ];

    expect(resolveCityStampLocationMatch(
      splitDiaryLocation('Approximate City, France'),
      candidates,
    )).toEqual([]);
    expect(resolveCityStampLocationMatch(
      splitDiaryLocation('Unmatched City, France'),
      candidates,
    )).toEqual([]);
  });

  test('keeps real catalog records with uncertain matches preview-only', () => {
    const uncertainCities = cityStampCatalogCities.filter(city => (
      city.matchConfidence === 'approximate' || city.matchConfidence === 'unmatched'
    ));
    expect(uncertainCities.length).toBeGreaterThan(0);

    const sample = uncertainCities[0];
    expect(sample).toBeDefined();
    if (!sample) return;

    expect(getVisitedCityStampIds([diary(sample.latinName)])).not.toContain(sample.id);
  });

  test('resolves the legacy decoration IDs even if a WUP record is absent', () => {
    expect(getCityStampConfig('stampKyoto')?.latinName).toBe('Kyoto');
    expect(getCityStampConfig('stampKamakura')?.latinName).toBe('Kamakura');
    expect(getCityStampConfig('stamp')?.latinName).toBe('Tainan');
  });
});
