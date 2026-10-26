import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

type RouteRequest = Request & {
  route?: { path?: string | string[] };
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,96}$/;
const MAX_BACKEND_LOG_BYTES = 512 * 1024;

function getLogDirectory() {
  return process.env.ORANGE_GLOW_DIAGNOSTICS_DIR
    || resolve(__dirname, '../../../.dev-logs');
}

export function normalizeBackendDiagnosticRoute(value: string) {
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

function requestRoute(request: RouteRequest) {
  const routePath = request.route?.path;
  if (typeof routePath === 'string') {
    return normalizeBackendDiagnosticRoute(`${request.baseUrl}${routePath}`);
  }
  return normalizeBackendDiagnosticRoute(request.path);
}

function writeRequestRecord(record: Record<string, string | number>) {
  try {
    const logDirectory = getLogDirectory();
    mkdirSync(logDirectory, { recursive: true });
    const logPath = join(logDirectory, 'backend.jsonl');
    const backupPath = `${logPath}.1`;
    const line = `${JSON.stringify(record)}\n`;
    if (existsSync(logPath) && statSync(logPath).size + line.length > MAX_BACKEND_LOG_BYTES) {
      rmSync(backupPath, { force: true });
      renameSync(logPath, backupPath);
    }
    appendFileSync(logPath, line, 'utf8');
  } catch {
    // Diagnostics must never affect request handling.
  }
}

export function devRequestDiagnostics(request: Request, response: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== 'development') {
    next();
    return;
  }

  const candidate = request.header('x-request-id');
  const requestId = candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : `srv-${randomUUID()}`;
  const startedAt = Date.now();
  response.setHeader('x-request-id', requestId);
  response.once('finish', () => {
    const record = {
      timestamp: new Date().toISOString(),
      level: response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info',
      event: 'http.request.completed',
      requestId,
      method: request.method.toUpperCase(),
      route: requestRoute(request as RouteRequest),
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    };
    writeRequestRecord(record);
    console.log(`[dev-diagnostics] ${JSON.stringify(record)}`);
  });
  next();
}
