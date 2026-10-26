import { estimateSvgTextWidth, fitSvgText } from '../city-stamp';

describe('city stamp SVG text fitting', () => {
  test('keeps short city names at the intended maximum font size', () => {
    expect(fitSvgText('台南', 47, 17, 3.2, 1.2)).toEqual({
      text: '台南',
      fontSize: 17,
    });
  });

  test('reduces long city names just enough to fit the safe width', () => {
    const fitted = fitSvgText('圣彼得堡市中心城区', 47, 17, 3.2, 1.2);

    expect(fitted.text).toBe('圣彼得堡市中心城区');
    expect(fitted.fontSize).toBeLessThan(17);
    expect(estimateSvgTextWidth(fitted.text, fitted.fontSize, 1.2)).toBeLessThanOrEqual(47);
  });

  test('ellipsizes only when the minimum readable size cannot fit the full name', () => {
    const fitted = fitSvgText('这是一个特别特别长的城市名称需要省略', 47, 17, 3.2, 1.2);

    expect(fitted.text.endsWith('…')).toBe(true);
    expect(estimateSvgTextWidth(fitted.text, fitted.fontSize, 1.2)).toBeLessThanOrEqual(47);
  });

  test('accounts for mixed-width Latin text and letter spacing', () => {
    const text = 'WIDE City 2026';
    const fitted = fitSvgText(text, 48, 7.2, 3, 0.75);

    expect(fitted.text).toBe(text);
    expect(estimateSvgTextWidth(text, fitted.fontSize, 0.75)).toBeLessThanOrEqual(48);
  });

  test('fits the complete country label and sequence number on the upper arc', () => {
    const fitted = fitSvgText('UNITED STATES OF AMERICA · 01', 79, 4.3, 2.5, 0.55);

    expect(fitted.text).toBe('UNITED STATES OF AMERICA · 01');
    expect(estimateSvgTextWidth(fitted.text, fitted.fontSize, 0.55)).toBeLessThanOrEqual(79);
  });
});
