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
  nameSource?: (
    | 'geonames'
    | 'geonames-nearest'
    | 'ungegn'
    | 'wikidata'
    | 'openstreetmap'
    | 'reviewed-override'
    | 'wup-original'
    | 'mca-administrative-code'
  );
  latinNameSource?: 'hanyu-pinyin';
  matchConfidence?: 'verified' | 'approximate' | 'unmatched';
  administrativeCode?: string;
  administrativeLevel?: 'municipality' | 'prefecture-level-city';
  provinceCode?: string;
  provinceName?: string;
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

type StampPalette = Pick<CityStampConfig, 'inkColor' | 'accentColor'>;

function hashString(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return hash || 0x9e3779b9;
}

function nextRandom(value: number) {
  let next = value;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const offset = normalizedLightness - chroma / 2;
  const [red, green, blue] = hueSection < 1
    ? [chroma, secondary, 0]
    : hueSection < 2
      ? [secondary, chroma, 0]
      : hueSection < 3
        ? [0, chroma, secondary]
        : hueSection < 4
          ? [0, secondary, chroma]
          : hueSection < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const toHex = (channel: number) =>
    Math.round((channel + offset) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function createCityPalettes() {
  const palettes = new Map<string, StampPalette>();
  const usedInkColors = new Set(
    Object.values(legacyFallbacks).map(palette => palette.inkColor.toLowerCase()),
  );

  for (const city of catalog.cities) {
    let seed = hashString(city.id);
    let palette: StampPalette | undefined;
    for (let attempt = 0; attempt < 250_000; attempt += 1) {
      seed = nextRandom(seed);
      const hue = seed % 360;
      seed = nextRandom(seed);
      const saturation = 54 + (seed % 23);
      seed = nextRandom(seed);
      const lightness = 31 + (seed % 24);
      const inkColor = hslToHex(hue, saturation, lightness);
      if (usedInkColors.has(inkColor)) continue;

      palette = {
        inkColor,
        accentColor: hslToHex(
          (hue + 14) % 360,
          Math.max(32, saturation - 14),
          Math.min(78, lightness + 24),
        ),
      };
      usedInkColors.add(inkColor);
      break;
    }

    if (!palette) {
      throw new Error(`Unable to assign a unique city-stamp color to ${city.id}`);
    }
    palettes.set(city.id, palette);
  }

  return palettes;
}

const cityPalettes = createCityPalettes();

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
  const palette = cityPalettes.get(city.id);
  if (!palette) return legacyFallbacks[id];
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
    city.matchConfidence !== 'approximate'
      && city.matchConfidence !== 'unmatched'
      && [city.cityName, city.latinName, ...city.aliases]
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
  if (areaMatches.length === 1) return areaMatches;

  const provinceMatches = matches.filter(city => (
    city.provinceName
    && normalizedParts.has(normalizeLocationPart(city.provinceName))
  ));
  return provinceMatches.length === 1 ? provinceMatches : [];
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
