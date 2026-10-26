import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { Readable } from 'node:stream';
import { BoundedMemoryUploadStorage } from './bounded-memory-upload-storage';

function streamFile(bytes: string) {
  return {
    stream: Readable.from([Buffer.from(bytes)]),
  } as Express.Multer.File;
}

describe('BoundedMemoryUploadStorage', () => {
  test('enforces the aggregate request limit while file streams are being buffered', async () => {
    const storage = new BoundedMemoryUploadStorage(6);
    const request = {} as Request;
    const firstFile = streamFile('1234');
    const stored = await new Promise<Partial<Express.Multer.File>>((resolve, reject) => {
      storage._handleFile(request, firstFile, (error, info) => error ? reject(error) : resolve(info ?? {}));
    });

    const error = await new Promise<Error | undefined>(resolve => {
      storage._handleFile(request, streamFile('567'), received => resolve(received ?? undefined));
    });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(stored.buffer).toEqual(Buffer.from('1234'));
  });
});
