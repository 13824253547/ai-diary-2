const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const SERVICE_CODE = 'orange-glow-ai-diary';

export function createAIFileProvenance(contentId: string) {
  const id = contentId.replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  if (!id) throw new Error('AI export requires a content ID.');
  return {
    Label: '1', ContentProducer: SERVICE_CODE, ProduceID: id, ReservedCode1: '',
    ContentPropagator: SERVICE_CODE, PropagateID: id, ReservedCode2: '',
  };
}

export function createAIFileXmp(contentId: string) {
  const json = JSON.stringify(createAIFileProvenance(contentId)).replace(/"/g, '&quot;');
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:AIGC="http://www.tc260.org.cn/ns/AIGC/1.0/" AIGC:AIGC="${json}"/></rdf:RDF></x:xmpmeta>`;
}

function uint32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function addAIProvenanceToPng(png: Uint8Array, contentId: string): Uint8Array {
  if (!PNG_SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error('AI export must be a PNG.');
  }
  const data = `AIGC\0${JSON.stringify(createAIFileProvenance(contentId))}`;
  const chunk = new Uint8Array(data.length + 12);
  writeUint32(chunk, 0, data.length);
  chunk.set([116, 69, 88, 116], 4);
  chunk.set(Array.from(data, character => character.charCodeAt(0)), 8);
  writeUint32(chunk, chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = uint32(png, offset);
    const end = offset + length + 12;
    if (end > png.length) throw new Error('Invalid PNG chunk.');
    if (png[offset + 4] === 73 && png[offset + 5] === 69
      && png[offset + 6] === 78 && png[offset + 7] === 68) {
      if (length !== 0 || end !== png.length) throw new Error('Invalid PNG end.');
      const output = new Uint8Array(png.length + chunk.length);
      output.set(png.subarray(0, offset));
      output.set(chunk, offset);
      output.set(png.subarray(offset), offset + chunk.length);
      return output;
    }
    offset = end;
  }
  throw new Error('Incomplete PNG export.');
}
