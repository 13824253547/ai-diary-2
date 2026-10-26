import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import {
  devRequestDiagnostics,
  normalizeBackendDiagnosticRoute,
} from './dev-request-diagnostics.middleware';

describe('development request diagnostics', () => {
  it('normalizes resource IDs and strips query strings', () => {
    expect(normalizeBackendDiagnosticRoute(
      '/api/chat/conversations/9a7b2d4e-7712-4b63-a827-f89067dca221?cursor=private',
    )).toBe('/api/chat/conversations/:id');
  });

  it('does not install request logging in production', () => {
    const originalEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const next = jest.fn();
    const response = {
      setHeader: jest.fn(),
      once: jest.fn(),
    };

    try {
      devRequestDiagnostics(
        { header: jest.fn() } as never,
        response as never,
        next,
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(response.setHeader).not.toHaveBeenCalled();
      expect(response.once).not.toHaveBeenCalled();
    } finally {
      if (originalEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment;
    }
  });

  it('writes only request metadata in development and echoes the correlation ID', () => {
    const originalEnvironment = process.env.NODE_ENV;
    const originalLogDirectory = process.env.ORANGE_GLOW_DIAGNOSTICS_DIR;
    const logDirectory = mkdtempSync(join(tmpdir(), 'orange-glow-diagnostics-'));
    process.env.NODE_ENV = 'development';
    process.env.ORANGE_GLOW_DIAGNOSTICS_DIR = logDirectory;
    let finishRequest: (() => void) | undefined;
    const request = {
      header: jest.fn(() => 'diag-request-123'),
      method: 'POST',
      baseUrl: '/api',
      route: { path: '/chat/conversations/:id/turns' },
      path: '/api/chat/conversations/private-id/turns',
      body: { text: 'private message' },
    } as unknown as Request;
    const response = {
      statusCode: 201,
      setHeader: jest.fn(),
      once: jest.fn((_event: string, listener: () => void) => {
        finishRequest = listener;
      }),
    } as unknown as Response;

    try {
      devRequestDiagnostics(request, response, jest.fn());
      expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'diag-request-123');
      finishRequest?.();
      const output = readFileSync(join(logDirectory, 'backend.jsonl'), 'utf8');
      expect(output).toContain('"route":"/api/chat/conversations/:id/turns"');
      expect(output).toContain('"requestId":"diag-request-123"');
      expect(output).not.toContain('private message');
    } finally {
      rmSync(logDirectory, { recursive: true, force: true });
      if (originalEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment;
      if (originalLogDirectory === undefined) delete process.env.ORANGE_GLOW_DIAGNOSTICS_DIR;
      else process.env.ORANGE_GLOW_DIAGNOSTICS_DIR = originalLogDirectory;
    }
  });
});
