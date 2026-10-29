import sharp from 'sharp';
import { labelGeneratedImage } from './ai-image-label';

describe('generated image labels', () => {
  test.each(['png', 'jpeg', 'webp'] as const)('preserves %s dimensions and adds visible pixels plus XMP', async format => {
    const original = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#123456' },
    }).toFormat(format).toBuffer();
    const result = await labelGeneratedImage(original, 'content-1');
    const metadata = await sharp(result).metadata();
    expect(metadata).toMatchObject({ width: 400, height: 300, format });
    expect(metadata.xmp?.toString()).toContain('orange-glow-ai-diary');
    expect(metadata.xmp?.toString()).toContain('ContentProducer');
    expect(result.equals(original)).toBe(false);
    const { data } = await sharp(result).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = ((300 - 8) * 400 + (400 - 12)) * 3;
    expect(data[corner]).toBeGreaterThan(150);
    expect(await labelGeneratedImage(result, 'content-1')).toBe(result);
  });

  test('retains existing provider XMP', async () => {
    const original = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#123456' },
    }).png().withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:source="provider-origin"/></rdf:RDF></x:xmpmeta>').toBuffer();
    const metadata = await sharp(await labelGeneratedImage(original, 'content-2')).metadata();
    expect(metadata.xmp?.toString()).toContain('provider-origin');
    expect(metadata.xmp?.toString()).toContain('orange-glow-visible-ai-label-v1');
  });

  test('rejects corrupt files instead of returning an unlabelled success', async () => {
    await expect(labelGeneratedImage(Buffer.from('invalid'), 'id')).rejects.toThrow();
  });
});
