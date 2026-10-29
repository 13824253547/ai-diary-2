import * as FileSystem from 'expo-file-system/legacy';

export type DevDiagnosticLevel = 'info' | 'warn' | 'error';
export type DevDiagnosticFields = Record<string, string | number | boolean | null | string[]>;

const ALLOWED_FIELDS = new Set([
  'requestId',
  'photoId',
  'photoIndex',
  'route',
  'method',
  'status',
  'durationMs',
  'fileSize',
  'httpStatus',
  'errorCode',
  'errorName',
  'errorStack',
  'bodyKind',
  'failureStage',
  'phase',
  'outcome',
  'platform',
  'source',
  'attempt',
  'attemptLimit',
  'progressPercent',
  'retryable',
  'deltaCount',
  'firstDeltaMs',
  'isFatal',
]);
const SAFE_TOKEN = /^[A-Za-z0-9_.:/-]{1,128}$/;
const MAX_LOG_BYTES = 256 * 1024;
const DIAGNOSTICS_FILE_NAME = 'orange-glow-diagnostics.jsonl';

let writeQueue: Promise<void> = Promise.resolve();
let requestSequence = 0;
let errorHandlerInstalled = false;

export function isDevDiagnosticsEnabled() {
  return typeof __DEV__ !== 'undefined' && __DEV__ && !process.env.JEST_WORKER_ID;
}

export function createDiagnosticRequestId() {
  requestSequence += 1;
  const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${requestSequence.toString(36)}`;
  return `diag-${randomPart}`;
}

export function normalizeDiagnosticRoute(value: string) {
  const path = value.split(/[?#]/, 1)[0];
  return path.split('/').map(segment => {
    if (
      /^[0-9]+$/.test(segment)
      || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)
      || /^device-[0-9a-f-]{16,}$/i.test(segment)
    ) {
      return ':id';
    }
    return segment;
  }).join('/');
}

export function sanitizeDiagnosticFields(fields: DevDiagnosticFields = {}) {
  const clean: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (key === 'route' && typeof value === 'string') {
      clean.route = normalizeDiagnosticRoute(value).slice(0, 160);
      continue;
    }
    if (key === 'errorStack' && Array.isArray(value)) {
      clean.errorStack = value
        .filter(line => typeof line === 'string' && /(?:\bat\s+|@).+:\d+:\d+/.test(line))
        .slice(0, 8)
        .map(line => line.replace(/https?:\/\/[^\s)]+/g, '<url>').slice(0, 240));
      continue;
    }
    if (typeof value === 'string' && SAFE_TOKEN.test(value)) {
      clean[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === 'boolean') {
      clean[key] = value;
    }
  }
  return clean;
}

async function appendDiagnosticLine(line: string) {
  const root = FileSystem.documentDirectory;
  if (!root) return;
  const uri = `${root}${DIAGNOSTICS_FILE_NAME}`;
  const backupUri = `${uri}.1`;
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && (info.size ?? 0) + line.length > MAX_LOG_BYTES) {
    await FileSystem.deleteAsync(backupUri, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: backupUri });
  }
  await FileSystem.writeAsStringAsync(uri, line, { encoding: 'utf8', append: true });
}

export function logDevDiagnostic(
  level: DevDiagnosticLevel,
  event: string,
  fields: DevDiagnosticFields = {},
) {
  if (!isDevDiagnosticsEnabled() || !SAFE_TOKEN.test(event)) return;
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeDiagnosticFields(fields),
  };
  const line = `${JSON.stringify(record)}\n`;
  console.log(`[dev-diagnostics] ${line.trimEnd()}`);

  writeQueue = writeQueue
    .then(() => appendDiagnosticLine(line))
    .catch(() => undefined);
}

export async function flushDevDiagnostics() {
  await writeQueue;
}

export function installDevDiagnosticErrorHandler() {
  if (!isDevDiagnosticsEnabled() || errorHandlerInstalled) return;
  const errorUtils = (globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();
  if (!errorUtils?.setGlobalHandler) return;

  errorUtils.setGlobalHandler((error, isFatal) => {
    const stack = typeof error?.stack === 'string'
      ? error.stack.split('\n').slice(1)
      : [];
    logDevDiagnostic('error', 'runtime.unhandled_error', {
      errorName: error?.name || 'Error',
      isFatal: Boolean(isFatal),
      errorStack: stack,
    });
    previousHandler?.(error, isFatal);
  });
  errorHandlerInstalled = true;
}
