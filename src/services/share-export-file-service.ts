import * as FileSystem from 'expo-file-system/legacy';
import type { DiaryItem } from '../types/diary';
import type { PreparedShareAsset } from './share-asset-preparation';

export type ShareExportMode = 'save' | 'pdf';

export type ShareExportSuccess = {
  ok: true;
  fileUri: string;
};

export type ShareExportFailure = {
  ok: false;
  reason: 'unsupported' | 'permission_denied' | 'delivery_failed';
  message: string;
};

export type ShareExportFileResult = ShareExportSuccess | ShareExportFailure;

type ShareExportFileInput = {
  diary: DiaryItem;
  mode: ShareExportMode;
  assets: PreparedShareAsset[];
  operationId: string;
};

type ShareExportFileDeps = {
  getOutputDirectory?: () => string | undefined;
};

const EXPORT_DIRECTORY = 'share-exports';
const IMAGE_WIDTH = 1080;
const PAGE_PADDING = 64;
const PAGE_INNER_WIDTH = IMAGE_WIDTH - PAGE_PADDING * 2;
const IMAGE_BACKGROUND = 0xfffbf4ff;
const IMAGE_TEXT = 0x422b17ff;
const IMAGE_TEXT_SOFT = 0x9d8878ff;
const IMAGE_MUTED = 0x8e7e6fff;
const IMAGE_ACCENT = 0xd4864bff;
const IMAGE_PANEL = 0xffffffff;
const IMAGE_PANEL_SOFT = 0xfff0e0ff;

function getDefaultOutputDirectory() {
  if (FileSystem.cacheDirectory ?? FileSystem.documentDirectory) {
    return FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? undefined;
  }
  try {
    const os = require('os');
    return `file://${os.tmpdir()}/`;
  } catch {
    return undefined;
  }
}

function toNodeFilePath(uri: string) {
  return uri.replace(/^file:\/\//, '');
}

async function ensureDirectory(uri: string) {
  if (uri.startsWith('file://')) {
    try {
      const fs = require('fs');
      fs.mkdirSync(toNodeFilePath(uri), { recursive: true });
      return;
    } catch {}
  }
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

async function writeBufferFile(uri: string, buffer: Buffer | Uint8Array) {
  if (uri.startsWith('file://')) {
    try {
      const fs = require('fs');
      const path = require('path');
      fs.mkdirSync(path.dirname(toNodeFilePath(uri)), { recursive: true });
      fs.writeFileSync(toNodeFilePath(uri), buffer);
      return;
    } catch {}
  }
  await FileSystem.writeAsStringAsync(uri, Buffer.from(buffer).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function readBufferFile(uri: string) {
  const readableUri = uri.startsWith('/') ? `file://${uri}` : uri;
  if (readableUri.startsWith('data:')) {
    return Buffer.from(readableUri.replace(/^data:[^;]+;base64,/, ''), 'base64');
  }
  if (readableUri.startsWith('file://')) {
    try {
      const fs = require('fs');
      return fs.readFileSync(toNodeFilePath(readableUri));
    } catch {}
  }
  const base64 = await FileSystem.readAsStringAsync(readableUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Buffer.from(base64, 'base64');
}

function encodePdfCjkText(value: string) {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0xffff) {
      bytes.push((codePoint >> 8) & 0xff, codePoint & 0xff);
      continue;
    }
    const scalar = codePoint - 0x10000;
    const high = 0xd800 + (scalar >> 10);
    const low = 0xdc00 + (scalar & 0x3ff);
    bytes.push((high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff);
  }
  return `<${bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}>`;
}

function wrapText(value: string, maxChars: number) {
  const source = value.replace(/\s+/g, ' ').trim();
  if (!source) return [''];
  const lines: string[] = [];
  let current = '';
  for (const char of source) {
    if (current.length >= maxChars) {
      lines.push(current);
      current = char;
      continue;
    }
    current += char;
  }
  if (current) lines.push(current);
  return lines;
}

function estimateLineCount(value: string, maxChars: number) {
  return Math.max(1, wrapText(value, maxChars).length);
}

function buildPdfLines(diary: DiaryItem, assets: PreparedShareAsset[]) {
  const lines: string[] = [
    diary.title,
    diary.summary,
    `${diary.date}，${diary.location}`,
  ];
  if (diary.anonymous) {
    lines.push('匿名日记，人物已遮挡');
  }
  if (assets.length) {
    lines.push(`已准备图片 ${assets.length} 张`);
  }
  lines.push('');
  for (const block of diary.blocks) {
    if (block.type === 'photo') {
      lines.push(...wrapText(`[图片] ${block.caption}`, 28));
      continue;
    }
    if (block.type === 'text' && block.title) {
      lines.push(...wrapText(`【${block.title}】`, 28));
    }
    const content = block.type === 'quote' ? `“${block.content}”` : block.content;
    lines.push(...wrapText(content, 28));
    lines.push('');
  }
  return lines.filter((line, index, array) => !(line === '' && array[index - 1] === ''));
}

function buildSimplePdf(lines: string[]) {
  const pageLines = lines.slice(0, 40);
  const commands = [
    'BT',
    '/F1 18 Tf',
    '1 0 0 1 56 792 Tm',
    '24 TL',
    ...pageLines.map((line, index) => `${index === 0 ? '' : 'T* '}${encodePdfCjkText(line)} Tj`),
    'ET',
  ].join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /DW 1000 >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(commands, 'utf8')} >>\nstream\n${commands}\nendstream\nendobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function renderShareImageFile(input: ShareExportFileInput, outputUri: string) {
  const Jimp = require('jimp-compact');
  const createBlock = (width: number, height: number, color: number) => new Jimp(width, height, color);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const drawRect = async (canvas: any, x: number, y: number, width: number, height: number, color: number) => {
    canvas.composite(await createBlock(width, height, color), x, y);
  };
  const drawTextSkeleton = async (canvas: any, x: number, y: number, width: number, lineCount: number, color: number) => {
    for (let index = 0; index < lineCount; index += 1) {
      const ratio = index === lineCount - 1 ? 0.58 : 0.92 - (index % 3) * 0.07;
      const lineWidth = clamp(Math.round(width * ratio), 120, width);
      await drawRect(canvas, x, y + index * 28, lineWidth, 12, color);
    }
  };

  const orderedPhotoIds = input.diary.posterPhotoIds?.length ? input.diary.posterPhotoIds : input.diary.photoIds;
  const orderedAssets = orderedPhotoIds
    .map(photoId => input.assets.find(asset => asset.photoId === photoId))
    .filter((asset): asset is PreparedShareAsset => Boolean(asset));
  const posterAssets = (orderedAssets.length ? orderedAssets : input.assets).slice(0, 2);
  const posterImages = await Promise.all(
    posterAssets.map(async asset => {
      const image = await Jimp.read(await readBufferFile(asset.uri));
      const targetHeight = Math.max(280, Math.min(520, Math.round(PAGE_INNER_WIDTH * (image.bitmap.height / image.bitmap.width))));
      return image.cover(PAGE_INNER_WIDTH, targetHeight);
    }),
  );

  const printableBlocks = input.diary.blocks.slice(0, 6);
  const titleLines = estimateLineCount(input.diary.title, 10);
  const summaryLines = estimateLineCount(input.diary.summary || '生活很美好 值得被记录', 18);
  const metaLines = estimateLineCount(`${input.diary.date} · ${input.diary.location}`, 22);
  const titleHeight = 48 + titleLines * 30;
  const summaryHeight = 28 + summaryLines * 22;
  const metaHeight = 20 + metaLines * 18;
  const blockHeights = printableBlocks.reduce((sum, block) => {
    if (block.type === 'photo') {
      return sum + 298;
    }
    const title = block.type === 'text' && block.title ? 34 : 0;
    const contentLines = estimateLineCount(block.type === 'quote' ? `“${block.content}”` : block.content, 22);
    return sum + 40 + title + contentLines * 28 + 32 + 18;
  }, 0);
  const posterHeight = posterImages.reduce((sum, image) => sum + image.bitmap.height, 0) + Math.max(0, posterImages.length - 1) * 18;
  const footerHeight = input.diary.anonymous ? 60 : 24;
  const totalHeight = 72 + titleHeight + 24 + posterHeight + 24 + summaryHeight + 18 + metaHeight + 28 + blockHeights + footerHeight + 72;
  const canvas = await new Jimp(IMAGE_WIDTH, totalHeight, IMAGE_BACKGROUND);

  let cursorY = 60;
  await drawRect(canvas, PAGE_PADDING, cursorY, PAGE_INNER_WIDTH, titleHeight, IMAGE_PANEL);
  await drawRect(canvas, PAGE_PADDING, cursorY, 18, titleHeight, IMAGE_ACCENT);
  await drawTextSkeleton(canvas, PAGE_PADDING + 40, cursorY + 28, PAGE_INNER_WIDTH - 72, titleLines, IMAGE_TEXT);
  cursorY += titleHeight + 24;

  for (const image of posterImages) {
    canvas.composite(image, PAGE_PADDING, cursorY);
    cursorY += image.bitmap.height + 18;
  }
  cursorY -= posterImages.length ? 18 : 0;
  cursorY += 24;

  await drawRect(canvas, PAGE_PADDING, cursorY, PAGE_INNER_WIDTH, summaryHeight, IMAGE_PANEL_SOFT);
  await drawTextSkeleton(canvas, PAGE_PADDING + 28, cursorY + 18, PAGE_INNER_WIDTH - 56, summaryLines, IMAGE_TEXT);
  cursorY += summaryHeight + 18;

  await drawRect(canvas, PAGE_PADDING, cursorY, PAGE_INNER_WIDTH, metaHeight, IMAGE_PANEL);
  await drawTextSkeleton(canvas, PAGE_PADDING + 24, cursorY + 12, PAGE_INNER_WIDTH - 48, metaLines, IMAGE_MUTED);
  cursorY += metaHeight + 28;

  if (input.diary.anonymous) {
    const badge = await new Jimp(264, 36, IMAGE_ACCENT);
    canvas.composite(badge, PAGE_PADDING, cursorY);
    await drawRect(canvas, PAGE_PADDING + 14, cursorY + 12, 164, 10, 0xffffffff);
    await drawRect(canvas, PAGE_PADDING + 14, cursorY + 24, 108, 6, 0xffffffff);
    cursorY += 54;
  }

  for (const block of printableBlocks) {
    if (block.type === 'photo') {
      await drawRect(canvas, PAGE_PADDING, cursorY, PAGE_INNER_WIDTH, 280, IMAGE_PANEL);
      const asset = input.assets.find(item => item.photoId === block.photoId);
      if (asset) {
        const photo = await Jimp.read(await readBufferFile(asset.uri));
        const visual = photo.cover(PAGE_INNER_WIDTH - 48, 188);
        canvas.composite(visual, PAGE_PADDING + 24, cursorY + 24);
      } else {
        await drawRect(canvas, PAGE_PADDING + 24, cursorY + 24, PAGE_INNER_WIDTH - 48, 188, IMAGE_PANEL_SOFT);
      }
      await drawTextSkeleton(canvas, PAGE_PADDING + 24, cursorY + 228, PAGE_INNER_WIDTH - 80, estimateLineCount(`[图片] ${block.caption}`, 18), IMAGE_TEXT_SOFT);
      cursorY += 298;
      continue;
    }
    const text = block.type === 'quote' ? `“${block.content}”` : block.content;
    const contentLines = estimateLineCount(text, 22);
    const blockHeight = 40 + (block.type === 'text' && block.title ? 34 : 0) + contentLines * 28 + 32;
    await drawRect(canvas, PAGE_PADDING, cursorY, PAGE_INNER_WIDTH, blockHeight, block.type === 'quote' ? IMAGE_PANEL_SOFT : IMAGE_PANEL);
    await drawRect(canvas, PAGE_PADDING, cursorY, 10, blockHeight, block.type === 'quote' ? IMAGE_MUTED : IMAGE_ACCENT);
    if (block.type === 'text' && block.title) {
      await drawTextSkeleton(canvas, PAGE_PADDING + 28, cursorY + 20, PAGE_INNER_WIDTH - 56, 1, IMAGE_TEXT);
      cursorY += 34;
    }
    await drawTextSkeleton(canvas, PAGE_PADDING + 28, cursorY + 18, PAGE_INNER_WIDTH - 72, contentLines, block.type === 'quote' ? IMAGE_MUTED : IMAGE_TEXT_SOFT);
    cursorY += blockHeight + 18;
  }

  await drawRect(canvas, PAGE_PADDING, totalHeight - 30, PAGE_INNER_WIDTH, 8, IMAGE_MUTED);
  await drawRect(canvas, PAGE_PADDING, totalHeight - 18, Math.min(PAGE_INNER_WIDTH, 220 + String(input.diary.version ?? 0).length * 20), 6, IMAGE_TEXT_SOFT);

  const buffer = await canvas.getBufferAsync(Jimp.MIME_PNG);
  await writeBufferFile(outputUri, buffer);
}

async function renderSharePdfFile(input: ShareExportFileInput, outputUri: string) {
  const lines = buildPdfLines(input.diary, input.assets);
  await writeBufferFile(outputUri, buildSimplePdf(lines));
}

export function createShareExportFileService(deps: ShareExportFileDeps = {}) {
  const getOutputDirectory = deps.getOutputDirectory ?? getDefaultOutputDirectory;

  return {
    async exportFile(input: ShareExportFileInput): Promise<ShareExportFileResult> {
      const root = getOutputDirectory();
      if (!root) {
        return {
          ok: false,
          reason: 'unsupported',
          message: '当前环境暂时无法生成导出文件。',
        };
      }
      const baseDir = `${root}${EXPORT_DIRECTORY}/`;
      const extension = input.mode === 'pdf' ? 'pdf' : 'png';
      const fileUri = `${baseDir}${encodeURIComponent(`${input.diary.id}::${input.diary.version ?? 0}::${input.operationId}::${input.mode}`)}.${extension}`;

      try {
        await ensureDirectory(baseDir);
        if (input.mode === 'pdf') {
          await renderSharePdfFile(input, fileUri);
        } else {
          await renderShareImageFile(input, fileUri);
        }
        return { ok: true, fileUri };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        return {
          ok: false,
          reason: 'delivery_failed',
          message: `导出文件生成失败：${message}`,
        };
      }
    },
  };
}

export async function exportShareDeliveryFile(input: ShareExportFileInput): Promise<ShareExportFileResult> {
  return createShareExportFileService().exportFile(input);
}
