import sharp from 'sharp';
import { createHash } from 'node:crypto';

const SERVICE_CODE = 'orange-glow-ai-diary';
const MARKER = 'orange-glow-visible-ai-label-v1';

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[character]!));
}

export async function labelGeneratedImage(buffer: Buffer, contentId: string): Promise<Buffer> {
  const metadata = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata();
  const existingXmp = metadata.xmp?.toString('utf8') ?? '';
  if (existingXmp.includes(MARKER)) return buffer;
  if (!metadata.width || !metadata.height || !['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) {
    throw new Error('Generated image cannot be labelled.');
  }
  const width = metadata.width;
  const height = metadata.height;
  const fontSize = Math.max(8, Math.min(32, Math.round(Math.min(width, height) * 0.022)));
  const labelWidth = Math.min(width, Math.ceil(fontSize * 8.5));
  const labelHeight = Math.min(height, fontSize * 2);
  const inset = Math.min(Math.round(fontSize / 2), Math.max(0, width - labelWidth), Math.max(0, height - labelHeight));
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth}" height="${labelHeight}">`
    + `<rect width="100%" height="100%" rx="${fontSize / 3}" fill="#fffaf0" fill-opacity=".94"/>`
    + `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#38291e">AI GENERATED</text></svg>`,
  );
  const id = createHash('sha256').update(contentId).digest('hex').slice(0, 32);
  const provenance = JSON.stringify({
    Label: '1',
    ContentProducer: SERVICE_CODE,
    ProduceID: id,
    ReservedCode1: '',
    ContentPropagator: SERVICE_CODE,
    PropagateID: id,
    ReservedCode2: MARKER,
  });
  const description = `<rdf:Description rdf:about="" xmlns:AIGC="http://www.tc260.org.cn/ns/AIGC/1.0/" AIGC:AIGC="${escapeXml(provenance)}"/>`;
  // Retain the provider's existing XMP descriptions rather than erase its origin.
  const xmp = existingXmp.includes('</rdf:RDF>')
    ? existingXmp.replace('</rdf:RDF>', `${description}</rdf:RDF>`)
    : `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${description}</rdf:RDF></x:xmpmeta>`;
  return sharp(buffer, { limitInputPixels: 50_000_000 })
    .composite([{ input: overlay, left: width - labelWidth - inset, top: height - labelHeight - inset }])
    .keepMetadata()
    .withXmp(xmp)
    .toBuffer();
}
