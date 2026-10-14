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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new MonthlyExportAbortedError();
  }
}

export async function exportMonthlyCollection(
  snapshot: MonthlyExportSnapshot,
  options: MonthlyExportOptions = {},
): Promise<MonthlyExportResult> {
  throwIfAborted(options.signal);
  await Promise.resolve();
  throwIfAborted(options.signal);
  return {
    monthLabel: snapshot.monthLabel,
    diaryCount: snapshot.diaryIds.length,
    previewMessage: `${snapshot.monthLabel} 的 ${snapshot.diaryIds.length} 篇日记已整理为合集预览。本次为本地演示，没有写入文件。`,
  };
}
