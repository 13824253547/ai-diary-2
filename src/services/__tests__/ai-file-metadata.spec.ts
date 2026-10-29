import { addAIProvenanceToPng, createAIFileXmp } from '../ai-file-metadata';
import { isGeneratedPhoto } from '../ai-content-provenance';
import type { DiaryPhoto } from '../../types/diary';

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xkAAAAASUVORK5CYII=', 'base64'));

describe('AI file provenance', () => {
  test('adds an AIGC PNG text chunk without changing image data or end chunk', () => {
    const output = addAIProvenanceToPng(png, 'card-123');
    const text = Buffer.from(output).toString('latin1');
    expect(text).toContain('AIGC\0{"Label":"1"');
    expect(text).toContain('"ContentProducer":"orange-glow-ai-diary"');
    expect(text).toContain('"ProduceID":"card123"');
    expect(output.subarray(0, png.length - 12)).toEqual(png.subarray(0, png.length - 12));
    expect(output.subarray(-12)).toEqual(png.subarray(-12));
    expect(output.length).toBeGreaterThan(png.length);
  });

  test('rejects non-PNG, truncated PNG and missing content IDs', () => {
    expect(() => addAIProvenanceToPng(new Uint8Array([1, 2]), 'id')).toThrow();
    expect(() => addAIProvenanceToPng(png.subarray(0, -2), 'id')).toThrow();
    expect(() => addAIProvenanceToPng(png, '')).toThrow();
  });

  test('generates XMP without copying filenames, prompts or user data', () => {
    const xmp = createAIFileXmp('file:///a<"user>.png');
    expect(xmp).toContain('http://www.tc260.org.cn/ns/AIGC/1.0/');
    expect(xmp).not.toContain('file:///');
    expect(xmp).not.toContain('<"user>');
  });

  test('uses recorded generation provenance, not photo appearance or filenames', () => {
    const base = { id: 'p', title: 'AI生成.jpg', generationPrompt: '场景' } as DiaryPhoto;
    expect(isGeneratedPhoto({ ...base, source: 'device' })).toBe(false);
    expect(isGeneratedPhoto({ ...base, source: 'generated', generationSource: 'provider' })).toBe(true);
    expect(isGeneratedPhoto({ ...base, source: 'generated', generationSource: 'mock' })).toBe(false);
    expect(isGeneratedPhoto(undefined)).toBe(false);
  });
});
