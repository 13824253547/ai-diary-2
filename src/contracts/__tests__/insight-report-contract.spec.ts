import {
  INSIGHT_REPORT_CONTRACT_VERSION,
  INSIGHT_REPORT_DIMENSION_IDS,
  isInsightReportRequest,
  isInsightReportResultForRequest,
} from '../insight-report-contract';

const request = {
  version: INSIGHT_REPORT_CONTRACT_VERSION,
  requestId: 'report-request-1',
  sourceVersion: 'source-version-1',
  sourceDiaries: [
    { id: 'diary-1', version: 2, title: '海边散步', summary: '沿海边慢慢走。' },
    { id: 'diary-2', version: 1, title: '雨天咖啡', summary: '在老街喝咖啡。' },
  ],
};

const result = {
  version: INSIGHT_REPORT_CONTRACT_VERSION,
  requestId: request.requestId,
  sourceVersion: request.sourceVersion,
  source: 'mock',
  sourceDiaryIds: ['diary-1', 'diary-2'],
  dimensions: INSIGHT_REPORT_DIMENSION_IDS.map(id => ({
    id,
    title: '示例标题',
    content: '开发态示例内容，不是质量验收结果。',
  })),
};

describe('insight report contract', () => {
  test('accepts a versioned request and matching three-dimension result', () => {
    expect(isInsightReportRequest(request)).toBe(true);
    expect(isInsightReportResultForRequest(result, request)).toBe(true);
  });

  test.each([
    ['unsupported version', { ...request, version: 'insight-report-v0' }],
    ['empty request id', { ...request, requestId: ' ' }],
    ['empty source version', { ...request, sourceVersion: '' }],
    ['empty source diary list', { ...request, sourceDiaries: [] }],
    ['duplicate source diary id', { ...request, sourceDiaries: [request.sourceDiaries[0], request.sourceDiaries[0]] }],
    ['invalid source diary version', {
      ...request,
      sourceDiaries: [{ ...request.sourceDiaries[0], version: -1 }],
    }],
  ])('rejects a request with %s', (_label, value) => {
    expect(isInsightReportRequest(value)).toBe(false);
  });

  test.each([
    ['unsupported version', { ...result, version: 'insight-report-v2' }],
    ['mismatched request id', { ...result, requestId: 'other-request' }],
    ['mismatched source version', { ...result, sourceVersion: 'other-source' }],
    ['unknown source diary', { ...result, sourceDiaryIds: ['diary-private'] }],
    ['duplicate source diary id', { ...result, sourceDiaryIds: ['diary-1', 'diary-1'] }],
    ['missing dimension', { ...result, dimensions: result.dimensions.slice(0, 2) }],
    ['duplicate dimension', { ...result, dimensions: [result.dimensions[0], result.dimensions[0], result.dimensions[2]] }],
    ['blank dimension content', {
      ...result,
      dimensions: result.dimensions.map((dimension, index) => index === 0 ? { ...dimension, content: ' ' } : dimension),
    }],
  ])('rejects a result with %s', (_label, value) => {
    expect(isInsightReportResultForRequest(value, request)).toBe(false);
  });
});
