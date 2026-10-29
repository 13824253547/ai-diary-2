import { normalizeDiagnosticRoute, sanitizeDiagnosticFields } from '../dev-diagnostics';

describe('development diagnostics sanitization', () => {
  it('normalizes resource IDs and removes query strings from routes', () => {
    expect(normalizeDiagnosticRoute(
      '/chat/conversations/9a7b2d4e-7712-4b63-a827-f89067dca221/turns/req-1?text=private',
    )).toBe('/chat/conversations/:id/turns/req-1');
  });

  it('keeps allowlisted metadata while excluding content, credentials, and unknown fields', () => {
    expect(sanitizeDiagnosticFields({
      route: '/diaries/123?token=private',
      method: 'POST',
      status: 500,
      requestId: 'diag-1234',
      photoId: 'material-123',
      photoIndex: 4,
      fileSize: 2048,
      httpStatus: 200,
      bodyKind: 'multipart',
      failureStage: 'fetch',
      phase: 'analyzing-photos',
      outcome: 'provider_failed',
      attempt: 2,
      attemptLimit: 2,
      progressPercent: 45,
      retryable: true,
      text: 'private diary text',
      accessToken: 'private token',
      responseBody: 'private response',
      errorStack: ['at createDiary (/src/repository.ts:1:2)', 'private body value'],
    })).toEqual({
      route: '/diaries/:id',
      method: 'POST',
      status: 500,
      requestId: 'diag-1234',
      photoId: 'material-123',
      photoIndex: 4,
      fileSize: 2048,
      httpStatus: 200,
      bodyKind: 'multipart',
      failureStage: 'fetch',
      phase: 'analyzing-photos',
      outcome: 'provider_failed',
      attempt: 2,
      attemptLimit: 2,
      progressPercent: 45,
      retryable: true,
      errorStack: ['at createDiary (/src/repository.ts:1:2)'],
    });
  });

  it('persists allowlisted records only when the development runtime is enabled', async () => {
    const originalWorkerId = process.env.JEST_WORKER_ID;
    const originalDevDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
    const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
    const originalConsoleLog = console.log;
    delete process.env.JEST_WORKER_ID;
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
    jest.resetModules();
    jest.doMock('expo-file-system/legacy', () => ({
      documentDirectory: 'file:///documents/',
      getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
      writeAsStringAsync,
    }));
    console.log = jest.fn();

    try {
      let diagnostics: typeof import('../dev-diagnostics') | undefined;
      jest.isolateModules(() => {
        diagnostics = require('../dev-diagnostics') as typeof import('../dev-diagnostics');
      });
      diagnostics!.logDevDiagnostic('info', 'identity.bootstrap.completed', {
        phase: 'identity',
        text: 'private diary body',
      });
      await diagnostics!.flushDevDiagnostics();
      expect(writeAsStringAsync).toHaveBeenCalledTimes(1);
      expect(writeAsStringAsync.mock.calls[0][0]).toBe(
        'file:///documents/orange-glow-diagnostics.jsonl',
      );
      expect(writeAsStringAsync.mock.calls[0][1]).toContain('"phase":"identity"');
      expect(writeAsStringAsync.mock.calls[0][1]).not.toContain('private diary body');
    } finally {
      console.log = originalConsoleLog;
      jest.dontMock('expo-file-system/legacy');
      jest.resetModules();
      if (originalWorkerId === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = originalWorkerId;
      if (originalDevDescriptor) Object.defineProperty(globalThis, '__DEV__', originalDevDescriptor);
      else delete (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__;
    }
  });
});
