import { join } from 'node:path';
import sharp from 'sharp';
import { chooseCaptchaPositions, createCaptchaImage } from './captcha-image';

describe('captcha images', () => {
  test('crops the actual photo and applies the same shaped holes to both locations', async () => {
    const path = join(process.cwd(), 'assets/captcha/10.jpg');
    const { piece, background } = await createCaptchaImage(160, 50, 180, path);
    const source = await sharp(path).resize(320, 160).ensureAlpha().raw().toBuffer();
    const pixels = await sharp(piece).ensureAlpha().raw().toBuffer();
    const result = await sharp(background).ensureAlpha().raw().toBuffer();
    const at = (x: number, y: number, width: number) => (y * width + x) * 4;

    expect(pixels[at(0, 0, 48) + 3]).toBe(0);
    for (const [x, y] of [[10, 20], [30, 20], [35, 35]]) {
      const originalIndex = at(160 + x, 50 + y, 320);
      const pieceIndex = at(x, y, 48);
      expect([...pixels.subarray(pieceIndex, pieceIndex + 4)])
        .toEqual([...source.subarray(originalIndex, originalIndex + 4)]);
      for (const holeX of [160, 180]) {
        const index = at(holeX + x, 50 + y, 320);
        expect(Math.abs(result[index] - (source[index] * 0.52 + 16 * 0.48))).toBeLessThan(2);
      }
    }
  });

  test('overlaps the holes outside the validation tolerance and randomly chooses either side', () => {
    const sides = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const positions = chooseCaptchaPositions();
      expect(positions.right - positions.left).toBeGreaterThan(10);
      expect(positions.right - positions.left).toBeLessThan(40);
      expect(positions.right + 48).toBeLessThanOrEqual(320);
      expect(positions.targetY + 48).toBeLessThanOrEqual(160);
      sides.add(positions.targetX === positions.left ? 'left' : 'right');
    }
    expect(sides.size).toBe(2);
  });
});
