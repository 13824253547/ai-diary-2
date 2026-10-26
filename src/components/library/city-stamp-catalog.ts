import catalogData from '../../data/city-stamp-catalog.json';
import type { DiaryItem } from '../../types/diary';

export type CityStampCatalogArea = {
  id: string;
  nameZh: string;
  nameEn: string;
  sourceNameEn: string;
  cityCount: number;
};

export type CityStampCatalogEntry = {
  id: string;
  cityName: string;
  latinName: string;
  areaId: string;
  areaNameZh: string;
  areaNameEn: string;
  serial: string;
  aliases: string[];
  nameSource?: 'geonames' | 'ungegn' | 'wikidata' | 'openstreetmap' | 'reviewed-override';
};

export type CityStampConfig = CityStampCatalogEntry & {
  region: string;
  inkColor: string;
  accentColor: string;
};

type CatalogShape = {
  version: string;
  sources: Array<{ name: string; url: string; license: string; citation?: string }>;
  areas: Array<Omit<CityStampCatalogArea, 'cityCount'>>;
  cities: CityStampCatalogEntry[];
};

const catalog = catalogData as CatalogShape;
const legacyCityNames = {
  stampKyoto: { areaId: 'JP', latinName: 'Kyoto' },
  stampKamakura: { areaId: 'JP', latinName: 'Kamakura' },
  stamp: { areaId: 'CN-TW', latinName: 'Tainan' },
} as const;
const legacyLocationNames = {
  stampKyoto: ['Kyoto', '京都'],
  stampKamakura: ['Kamakura', '镰仓'],
  stamp: ['Tainan', '台南'],
} as const;
const legacyFallbacks: Record<string, CityStampConfig> = {
  stampKyoto: {
    id: 'stampKyoto',
    cityName: '京都',
    latinName: 'Kyoto',
    areaId: 'JP',
    areaNameZh: '日本',
    areaNameEn: 'JAPAN',
    region: 'JAPAN',
    serial: '01',
    aliases: [],
    inkColor: '#A84E62',
    accentColor: '#D49AA4',
  },
  stampKamakura: {
    id: 'stampKamakura',
    cityName: '镰仓',
    latinName: 'Kamakura',
    areaId: 'JP',
    areaNameZh: '日本',
    areaNameEn: 'JAPAN',
    region: 'JAPAN',
    serial: '02',
    aliases: [],
    inkColor: '#55758D',
    accentColor: '#9DB2C2',
  },
  stamp: {
    id: 'stamp',
    cityName: '台南',
    latinName: 'Tainan',
    areaId: 'CN-TW',
    areaNameZh: '中国台湾',
    areaNameEn: 'TAIWAN · CHINA',
    region: 'TAIWAN · CHINA',
    serial: '01',
    aliases: [],
    inkColor: '#C27B3C',
    accentColor: '#D9AE7F',
  },
};

const areaPalette = [
  { inkColor: '#A84E62', accentColor: '#D49AA4' },
  { inkColor: '#55758D', accentColor: '#9DB2C2' },
  { inkColor: '#C27B3C', accentColor: '#D9AE7F' },
  { inkColor: '#65754F', accentColor: '#AEBB91' },
  { inkColor: '#765D88', accentColor: '#B9A7C8' },
];

const legacyPalette: Record<string, { inkColor: string; accentColor: string }> = {
  stampKyoto: areaPalette[0],
  stampKamakura: areaPalette[1],
  stamp: areaPalette[2],
};

function paletteFor(areaId: string) {
  let hash = 0;
  for (const character of areaId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return areaPalette[hash % areaPalette.length];
}

const cityById = new Map(catalog.cities.map(city => [city.id, city]));
const legacyTargets = new Map<string, string>();

for (const [legacyId, legacy] of Object.entries(legacyCityNames)) {
  const match = catalog.cities.find(
    city => city.areaId === legacy.areaId && city.latinName.toLowerCase() === legacy.latinName.toLowerCase(),
  );
  if (match) legacyTargets.set(legacyId, match.id);
}

const cityByName = new Map<string, CityStampCatalogEntry[]>();

function normalizeLocationPart(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

for (const city of catalog.cities) {
  for (const candidate of [city.cityName, city.latinName, ...city.aliases]) {
    const key = normalizeLocationPart(candidate);
    if (!key) continue;
    const matchingCities = cityByName.get(key) ?? [];
    if (!matchingCities.some(item => item.id === city.id)) matchingCities.push(city);
    cityByName.set(key, matchingCities);
  }
}

export const cityStampCatalogVersion = catalog.version;
export const cityStampCatalogSources = catalog.sources;
export const cityStampCatalogCities = catalog.cities;
const cityCountsByArea = new Map<string, number>();
for (const city of catalog.cities) {
  cityCountsByArea.set(city.areaId, (cityCountsByArea.get(city.areaId) ?? 0) + 1);
}
export const cityStampCatalogAreas: CityStampCatalogArea[] = catalog.areas.map(area => ({
  ...area,
  cityCount: cityCountsByArea.get(area.id) ?? 0,
}));

const citiesByArea = new Map<string, CityStampCatalogEntry[]>();
for (const city of catalog.cities) {
  const cities = citiesByArea.get(city.areaId) ?? [];
  cities.push(city);
  citiesByArea.set(city.areaId, cities);
}

export function getCityStampCitiesForArea(areaId: string) {
  return citiesByArea.get(areaId) ?? [];
}

export function getCityStampConfig(id?: string): CityStampConfig | undefined {
  if (!id) return undefined;
  const canonicalId = legacyTargets.get(id) ?? id;
  const city = cityById.get(canonicalId);
  if (!city) return legacyFallbacks[id];
  const palette = legacyPalette[id] ?? paletteFor(city.areaId);
  return {
    ...city,
    id,
    region: city.areaNameEn,
    ...palette,
  };
}

export const cityStampOptions = (
  ['stampKyoto', 'stampKamakura', 'stamp'] as const
).map(id => getCityStampConfig(id)).filter((city): city is CityStampConfig => city !== undefined);

export function splitDiaryLocation(location: string) {
  const parts = new Set<string>();
  for (const segment of location.split(/[·•、/|;；\n]+/u)) {
    const commaParts = segment.split(/[,，]+/u).map(normalizeLocationPart).filter(Boolean);
    for (let start = 0; start < commaParts.length; start += 1) {
      for (let end = start; end < commaParts.length; end += 1) {
        const selected = commaParts.slice(start, end + 1);
        parts.add(selected.join(', '));
        if (selected.length > 1) parts.add(selected.join(' '));
      }
    }
  }
  return [...parts];
}

export function resolveCityStampLocationMatch(
  locationParts: readonly string[],
  candidates: readonly CityStampCatalogEntry[],
  areas: readonly CityStampCatalogArea[] = cityStampCatalogAreas,
) {
  const normalizedParts = new Set(locationParts.map(normalizeLocationPart));
  const matches = candidates.filter(city => (
    [city.cityName, city.latinName, ...city.aliases]
      .some(candidate => normalizedParts.has(normalizeLocationPart(candidate)))
  ));
  if (matches.length <= 1) return matches;

  const areasById = new Map(areas.map(area => [area.id, area]));
  const areaMatches = matches.filter(city => {
    const area = areasById.get(city.areaId);
    return area
      ? [area.nameZh, area.nameEn, area.sourceNameEn].some(
          name => normalizedParts.has(normalizeLocationPart(name)),
        )
      : false;
  });
  return areaMatches.length === 1 ? areaMatches : [];
}

export function getVisitedCityStampIds(diaries: readonly DiaryItem[]) {
  const matches = new Set<string>();

  for (const diary of diaries) {
    if (diary.status !== 'ready') continue;
    const parts = splitDiaryLocation(diary.location);
    for (const [legacyId, cityNames] of Object.entries(legacyLocationNames)) {
      if (cityNames.some(cityName => parts.includes(normalizeLocationPart(cityName)))) {
        matches.add(legacyTargets.get(legacyId) ?? legacyId);
      }
    }
    for (const part of parts) {
      const candidates = cityByName.get(part);
      if (!candidates?.length) continue;
      for (const city of resolveCityStampLocationMatch(parts, candidates)) matches.add(city.id);
    }
  }
  return matches;
}

export function isCityStampUnlocked(cityId: string, unlockedIds: ReadonlySet<string>) {
  const canonicalId = legacyTargets.get(cityId) ?? cityId;
  return unlockedIds.has(canonicalId);
}
