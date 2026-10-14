export type ExecutionResult = 'passed' | 'failed' | 'blocked' | 'pending' | 'manual';

export type ExecutionReportRow = {
  caseId: string;
  acceptanceId: string;
  environment: string;
  result: ExecutionResult;
  evidence: string;
  codePath?: string;
  note?: string;
};

export function formatExecutionReportRow(row: ExecutionReportRow) {
  return `${row.caseId} | ${row.acceptanceId} | ${row.environment} | ${row.result} | ${row.evidence}`;
}

export function formatExecutionReportMarkdown(rows: ExecutionReportRow[]) {
  const header = '| CASE ID | 验收 ID | 环境 | 结果 | 代码位置 | 证据 | 备注 |';
  const separator = '| --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map(row =>
    `| ${row.caseId} | ${row.acceptanceId} | ${row.environment} | ${row.result} | ${row.codePath ?? '-'} | ${row.evidence} | ${row.note ?? '-'} |`,
  );

  return [header, separator, ...body].join('\n');
}
