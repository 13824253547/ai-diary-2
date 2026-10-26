import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';

export class BoundedMemoryUploadStorage implements StorageEngine {
  private readonly bytesByRequest = new WeakMap<Request, number>();

  constructor(private readonly maxTotalBytes: number) {}

  _handleFile(
    request: Request,
    file: Express.Multer.File,
    callback: (error?: Error | null, info?: Partial<Express.Multer.File>) => void,
  ) {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;

    file.stream.on('data', (chunk: Buffer | Uint8Array) => {
      if (failed) return;
      const nextTotal = (this.bytesByRequest.get(request) ?? 0) + chunk.length;
      if (nextTotal > this.maxTotalBytes) {
        failed = true;
        chunks.length = 0;
        file.stream.resume();
        callback(new BadRequestException({
          ok: false,
          error: {
            code: 'invalid_input',
            message: '本次照片文件总量超过接口限制。',
            retryable: false,
          },
        }));
        return;
      }

      this.bytesByRequest.set(request, nextTotal);
      const buffer = Buffer.from(chunk);
      chunks.push(buffer);
      size += buffer.length;
    });

    file.stream.on('error', error => {
      if (failed) return;
      failed = true;
      chunks.length = 0;
      callback(error);
    });

    file.stream.on('end', () => {
      if (failed) return;
      callback(null, { buffer: Buffer.concat(chunks, size), size });
    });
  }

  _removeFile(
    request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ) {
    delete (file as unknown as { buffer?: Buffer }).buffer;
    this.bytesByRequest.set(
      request,
      Math.max(0, (this.bytesByRequest.get(request) ?? 0) - (file.size ?? 0)),
    );
    callback(null);
  }
}
