export type MonthlyExportDiarySnapshot = {
  id: string;
  title: string;
  date: string;
  version?: number;
};

export type MonthlyExportSnapshot = {
  groupId: string;
  monthLabel: string;
  diaryIds: string[];
  diaries: MonthlyExportDiarySnapshot[];
};

export type MonthlyExportResult = {
  monthLabel: string;
  diaryCount: number;
  previewMessage: string;
};

export type MonthlyExportOptions = {
  signal?: AbortSignal;
};

export type MonthlyExportService = (
  snapshot: MonthlyExportSnapshot,
  options?: MonthlyExportOptions,
) => Promise<MonthlyExportResult>;

export class MonthlyExportAbortedError extends Error {
  constructor() {
    super('monthly export aborted');
    this.name = 'MonthlyExportAbortedError';
  }
}

export class MonthlyExportUnavailableError extends Error {
  constructor() {
    super('月度合集文件导出服务尚未接入。');
    this.name = 'MonthlyExportUnavailableError';
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new MonthlyExportAbortedError();
  }
}

export async function exportMonthlyCollection(
  _snapshot: MonthlyExportSnapshot,
  options: MonthlyExportOptions = {},
): Promise<MonthlyExportResult> {
  throwIfAborted(options.signal);
  throw new MonthlyExportUnavailableError();
}
