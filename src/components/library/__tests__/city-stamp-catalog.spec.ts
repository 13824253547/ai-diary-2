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
  test('contains every WUP 2025 city with unique IDs and continuous per-area numbering', () => {
    expect(cityStampCatalogCities).toHaveLength(16_828);
    expect(cityStampCatalogAreas).toHaveLength(194);
    expect(new Set(cityStampCatalogCities.map(city => city.id)).size).toBe(cityStampCatalogCities.length);
    expect(cityStampCatalogSources.map(source => source.name)).toEqual(expect.arrayContaining([
      expect.stringContaining('World Urbanization Prospects 2025'),
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

  test.each([
    ['CN-HK', '中国香港', 'HONG KONG · CHINA'],
    ['CN-MO', '中国澳门', 'MACAO · CHINA'],
    ['CN-TW', '中国台湾', 'TAIWAN · CHINA'],
  ])('uses the approved display labels for %s', (id, nameZh, nameEn) => {
    expect(cityStampCatalogAreas.find(area => area.id === id)).toMatchObject({ nameZh, nameEn });
    expect(cityStampCatalogCities.filter(city => city.areaId === id).length).toBeGreaterThan(0);
  });

  test('does not unlock the cross-border Macau-Zhuhai record from either constituent city', () => {
    const crossBorderCity = cityStampCatalogCities.find(city => city.latinName === 'Macau - Zhuhai');
    expect(crossBorderCity).toBeDefined();
    expect(crossBorderCity?.cityName).toBe('澳门-珠海');
    expect(crossBorderCity?.aliases).not.toEqual(expect.arrayContaining(['澳门', '珠海']));
    expect(getVisitedCityStampIds([diary('澳门')])).not.toContain(crossBorderCity?.id);
    expect(getVisitedCityStampIds([diary('珠海')])).not.toContain(crossBorderCity?.id);
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

  test('resolves the legacy decoration IDs even if a WUP record is absent', () => {
    expect(getCityStampConfig('stampKyoto')?.latinName).toBe('Kyoto');
    expect(getCityStampConfig('stampKamakura')?.latinName).toBe('Kamakura');
    expect(getCityStampConfig('stamp')?.latinName).toBe('Tainan');
  });
});
