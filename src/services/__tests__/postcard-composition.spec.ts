import { createPostcardStampPlacement, getPostcardStampPosition, isPostcardStampPlacement, postcardStampPlacements } from '../postcard-composition';

describe('postcard stamp placement', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([0, 1, 2, 3])('keeps legacy placement %s readable', index => {
    expect(isPostcardStampPlacement(String(index))).toBe(true);
    const placement = postcardStampPlacements[index]!;
    expect(placement.top).toBeGreaterThanOrEqual(12);
    expect(placement.top + 68).toBeLessThanOrEqual(292);
    expect(getPostcardStampPosition(String(index), 280, true).top).toBe(placement.top);
  });

  test('generates coordinates and rotation rather than one of four fixed indices', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.321).mockReturnValueOnce(0.765).mockReturnValueOnce(0.25);
    expect(createPostcardStampPlacement()).toBe('v2:321:765:-9');
    expect(isPostcardStampPlacement('v2:321:765:-9')).toBe(true);
  });

  test('allows the whole normalized photo range without rejection loops', () => {
    const random = jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9).mockReturnValueOnce(0.1).mockReturnValueOnce(0.8);
    expect(createPostcardStampPlacement()).toBe('v2:900:100:11');
    expect(random).toHaveBeenCalledTimes(3);
  });

  test.each([160, 280, 420])('fits coordinates within a %s dp photo and avoids the location mark', width => {
    for (let x = 0; x <= 1000; x += 100) {
      for (let y = 0; y <= 1000; y += 100) {
        const position = getPostcardStampPosition(`v2:${x}:${y}:18`, width, true);
        const left = position.left as number;
        const top = position.top as number;
        expect(left - 10).toBeGreaterThanOrEqual(12);
        expect(left + 68 + 10).toBeLessThanOrEqual(width + 12);
        expect(top - 10).toBeGreaterThanOrEqual(12);
        expect(top + 68 + 10).toBeLessThanOrEqual(292);
        expect(left + 78 <= width - 84 || top >= 112).toBe(true);
      }
    }
  });

  test('uses the photo interior and changes position continuously', () => {
    const first = getPostcardStampPosition('v2:400:500:3', 280, false);
    const second = getPostcardStampPosition('v2:401:501:4', 280, false);
    expect(first.left).toBeGreaterThan(80);
    expect(first.top).toBeGreaterThan(100);
    expect(second.left).not.toBe(first.left);
    expect(second.top).not.toBe(first.top);
  });

  test('spreads upper-right coordinates below a real location mark without clustering', () => {
    const first = getPostcardStampPosition('v2:900:100:0', 280, true);
    const second = getPostcardStampPosition('v2:900:200:0', 280, true);
    expect(first.top).toBeGreaterThan(112);
    expect(second.top).toBeGreaterThan(first.top as number);
    expect(getPostcardStampPosition('v2:900:100:0', 280, false).top).toBeLessThan(112);
  });

  test.each(['', '-1', '4', '0.5', 'unexpected', undefined,
    'v2:1001:1:0', 'v2:1:1001:0', 'v2:1:1:19', 'v2:-1:1:0', 'v2:NaN:0:0',
  ])('rejects invalid placement %s', value => {
    expect(isPostcardStampPlacement(value)).toBe(false);
  });
});
