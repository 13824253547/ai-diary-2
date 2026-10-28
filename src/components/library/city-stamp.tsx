import { useId } from 'react';
import Svg, { Circle, Defs, Path, Text as SvgText, TextPath } from 'react-native-svg';
import type { SvgProps } from 'react-native-svg';
import {
  cityStampOptions,
  type CityStampConfig,
} from './city-stamp-catalog';

export { cityStampOptions, getCityStampConfig } from './city-stamp-catalog';
export type { CityStampConfig } from './city-stamp-catalog';
export type CityStampId = (typeof cityStampOptions)[number]['id'];

type CityStampProps = Pick<CityStampConfig, 'cityName' | 'latinName' | 'serial' | 'region' | 'inkColor' | 'accentColor'>
  & Pick<SvgProps, 'width' | 'height' | 'style' | 'testID'>;

const CITY_TEXT_MAX_WIDTH = 47;
const LATIN_TEXT_MAX_WIDTH = 48;
const REGION_TEXT_MAX_WIDTH = 79;

function isFullWidthCharacter(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff)
    || (codePoint >= 0x2e80 && codePoint <= 0x9fff)
    || (codePoint >= 0xac00 && codePoint <= 0xd7af)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xff01 && codePoint <= 0xff60)
    || (codePoint >= 0x20000 && codePoint <= 0x3ffff)
  );
}

function glyphWidthUnits(character: string) {
  if (/[\u0300-\u036f]/u.test(character)) return 0;
  if (isFullWidthCharacter(character)) return 1;
  if (/\s/u.test(character)) return 0.34;
  if (/[ilI.,'`:;!|]/u.test(character)) return 0.31;
  if (/[MW@#%&]/u.test(character)) return 0.82;
  if (/[A-Z0-9]/u.test(character)) return 0.63;
  return 0.54;
}

export function estimateSvgTextWidth(text: string, fontSize: number, letterSpacing: number) {
  const characters = Array.from(text);
  const glyphWidth = characters.reduce((width, character) => width + glyphWidthUnits(character), 0);
  return glyphWidth * fontSize + Math.max(0, characters.length - 1) * letterSpacing;
}

export function fitSvgText(
  text: string,
  availableWidth: number,
  maxFontSize: number,
  minFontSize: number,
  letterSpacing: number,
) {
  const characters = Array.from(text);
  const widthAt = (value: string, fontSize: number) =>
    estimateSvgTextWidth(value, fontSize, letterSpacing);
  const fullSize = widthAt(text, maxFontSize);
  if (fullSize <= availableWidth) {
    return { text, fontSize: maxFontSize };
  }

  const units = characters.reduce((width, character) => width + glyphWidthUnits(character), 0);
  const gaps = Math.max(0, characters.length - 1) * letterSpacing;
  const calculatedSize = units > 0 ? (availableWidth - gaps) / units : minFontSize;
  if (calculatedSize >= minFontSize) {
    return { text, fontSize: Math.min(maxFontSize, calculatedSize) };
  }

  let fitted = '';
  for (const character of characters) {
    const candidate = `${fitted}${character}…`;
    if (widthAt(candidate, minFontSize) > availableWidth) break;
    fitted += character;
  }
  return {
    text: fitted ? `${fitted}…` : '…',
    fontSize: minFontSize,
  };
}

export function CityStamp({
  cityName,
  latinName,
  serial,
  region,
  inkColor,
  accentColor,
  width = '100%',
  height = '100%',
  style,
  testID,
}: CityStampProps) {
  const cityText = fitSvgText(cityName, CITY_TEXT_MAX_WIDTH, 17, 3.2, 1.2);
  const latinText = fitSvgText(latinName, LATIN_TEXT_MAX_WIDTH, 7.2, 3, 0.75);
  const headerText = fitSvgText(`${region} · ${serial}`, REGION_TEXT_MAX_WIDTH, 4.3, 2.5, 0.55);
  const footerText = fitSvgText('TRAVEL POST', REGION_TEXT_MAX_WIDTH, 4.3, 2.5, 0.55);
  const svgId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const topArcId = `${svgId}-top-arc`;
  const bottomArcId = `${svgId}-bottom-arc`;

  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 75 75"
      preserveAspectRatio="xMidYMid meet"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${cityName}城市邮戳`}
      testID={testID}
      style={style}
    >
      <Circle cx="37.5" cy="37.5" r="35" fill="none" stroke={inkColor} strokeWidth="1.35" opacity="0.76" />
      <Circle cx="37.5" cy="37.5" r="31.5" fill="none" stroke={accentColor} strokeWidth="0.8" strokeDasharray="2 1.5" opacity="0.72" />
      <Defs>
        <Path id={topArcId} d="M 11 37.5 A 26.5 26.5 0 0 1 64 37.5" fill="none" />
        <Path id={bottomArcId} d="M 11 37.5 A 26.5 26.5 0 0 0 64 37.5" fill="none" />
      </Defs>
      <SvgText fill={inkColor} fontFamily="Georgia" fontSize={headerText.fontSize} letterSpacing="0.55" opacity="0.83" textAnchor="middle">
        <TextPath href={`#${topArcId}`} startOffset="50%" textAnchor="middle">
          {headerText.text}
        </TextPath>
      </SvgText>
      <SvgText
        x="37.5"
        y="42.5"
        fill={inkColor}
        fontFamily="Songti SC, serif"
        fontSize={cityText.fontSize}
        fontWeight="600"
        letterSpacing="1.2"
        textAnchor="middle"
      >
        {cityText.text}
      </SvgText>
      <SvgText
        x="37.5"
        y="54"
        fill={inkColor}
        fontFamily="Georgia"
        fontSize={latinText.fontSize}
        letterSpacing="0.75"
        textAnchor="middle"
      >
        {latinText.text}
      </SvgText>
      <SvgText fill={accentColor} fontFamily="Georgia" fontSize={footerText.fontSize} letterSpacing="0.55" textAnchor="middle">
        <TextPath href={`#${bottomArcId}`} startOffset="50%" textAnchor="middle">
          {footerText.text}
        </TextPath>
      </SvgText>
    </Svg>
  );
}
