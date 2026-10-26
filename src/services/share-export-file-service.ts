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
  writeFile?: (uri: string, buffer: Buffer | Uint8Array) => Promise<void>;
};

const EXPORT_DIRECTORY = 'share-exports';

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

async function renderSharePdfFile(
  input: ShareExportFileInput,
  outputUri: string,
  writeFile: (uri: string, buffer: Buffer | Uint8Array) => Promise<void>,
) {
  const lines = buildPdfLines(input.diary, input.assets);
  await writeFile(outputUri, buildSimplePdf(lines));
}

export function createShareExportFileService(deps: ShareExportFileDeps = {}) {
  const getOutputDirectory = deps.getOutputDirectory ?? getDefaultOutputDirectory;
  const writeFile = deps.writeFile ?? writeBufferFile;

  return {
    async exportFile(input: ShareExportFileInput): Promise<ShareExportFileResult> {
      if (input.mode === 'save') {
        return {
          ok: false,
          reason: 'unsupported',
          message: '长图导出尚未接入真实文字渲染和系统相册保存。',
        };
      }
      const root = getOutputDirectory();
      if (!root) {
        return {
          ok: false,
          reason: 'unsupported',
          message: '当前环境暂时无法生成导出文件。',
        };
      }
      const baseDir = `${root}${EXPORT_DIRECTORY}/`;
      const fileUri = `${baseDir}${encodeURIComponent(`${input.diary.id}::${input.diary.version ?? 0}::${input.operationId}::${input.mode}`)}.pdf`;

      try {
        await ensureDirectory(baseDir);
        await renderSharePdfFile(input, fileUri, writeFile);
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
