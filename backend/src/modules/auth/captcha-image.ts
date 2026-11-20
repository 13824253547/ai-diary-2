import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';

export const CAPTCHA_WIDTH = 320;
export const CAPTCHA_HEIGHT = 160;
export const CAPTCHA_PIECE_SIZE = 48;
const PHOTO_IDS = [10, 11, 12, 13, 14, 15, 16, 17, 28, 29, 37, 46];
const SHAPE = 'M4 10 H17 C17 1 31 1 31 10 H44 V44 H4 Z';

export function chooseCaptchaPositions() {
  const left = randomInt(145, 211);
  const right = left + randomInt(16, 25);
  return {
    targetX: randomInt(2) === 0 ? left : right,
    left,
    right,
    targetY: randomInt(30, 101),
  };
}

export async function createCaptchaImage(
  targetX: number, targetY: number, decoyX: number,
  photoPath = join(process.cwd(), 'assets', 'captcha', `${PHOTO_IDS[randomInt(PHOTO_IDS.length)]}.jpg`),
) {
  const original = await sharp(photoPath).resize(CAPTCHA_WIDTH, CAPTCHA_HEIGHT, { fit: 'cover' }).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path d="${SHAPE}" fill="white"/></svg>`);
  const holes = [targetX, decoyX].sort((a, b) => a - b)
    .map(x => `<path d="${SHAPE}" transform="translate(${x} ${targetY})"/>`).join('');
  const holeOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}">
    <defs><mask id="holes"><g fill="white">${holes}</g></mask></defs>
    <rect width="100%" height="100%" fill="#101010" fill-opacity=".48" mask="url(#holes)"/>
    <g fill="none" stroke="white" stroke-opacity=".8" stroke-width="1.5">${holes}</g>
  </svg>`);
  const [piece, background] = await Promise.all([
    sharp(original).extract({ left: targetX, top: targetY, width: CAPTCHA_PIECE_SIZE, height: CAPTCHA_PIECE_SIZE })
      .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(),
    sharp(original).composite([{ input: holeOverlay }]).png().toBuffer(),
  ]);
  return { background, piece };
}
