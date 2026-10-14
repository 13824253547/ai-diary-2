import { formatExecutionReportMarkdown, formatExecutionReportRow } from '../execution-report';

describe('execution report formatting', () => {
  test('formats a single row for plain text logs', () => {
    expect(
      formatExecutionReportRow({
        caseId: 'CASE-BAS-004-004',
        acceptanceId: 'T-BAS-004-A04',
        environment: 'jest',
        result: 'passed',
        evidence: 'npm run test',
      }),
    ).toBe('CASE-BAS-004-004 | T-BAS-004-A04 | jest | passed | npm run test');
  });

  test('formats markdown report with code paths and notes', () => {
    const markdown = formatExecutionReportMarkdown([
      {
        caseId: 'CASE-BAS-004-004',
        acceptanceId: 'T-BAS-004-A04',
        environment: 'jest',
        result: 'passed',
        codePath: 'src/store/__tests__/diary-domain.spec.ts',
        evidence: 'npm run test',
        note: '替身通过',
      },
      {
        caseId: 'CASE-BAS-003-001',
        acceptanceId: 'T-BAS-003-A01',
        environment: 'docker+mysql',
        result: 'blocked',
        evidence: '等待真实资产恢复',
      },
    ]);

    expect(markdown).toContain('| CASE ID | 验收 ID | 环境 | 结果 | 代码位置 | 证据 | 备注 |');
    expect(markdown).toContain('| CASE-BAS-004-004 | T-BAS-004-A04 | jest | passed | src/store/__tests__/diary-domain.spec.ts | npm run test | 替身通过 |');
    expect(markdown).toContain('| CASE-BAS-003-001 | T-BAS-003-A01 | docker+mysql | blocked | - | 等待真实资产恢复 | - |');
  });
});
