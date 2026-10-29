import {
  computeCurrentConsecutiveDays,
  computeLongestConsecutiveDays,
  resolveGrowthDiaryDate,
} from './growth-insights.service';

describe('growth milestone dates', () => {
  test('uses the newest continuous run only and deduplicates multiple diaries on one day', () => {
    expect(computeCurrentConsecutiveDays([
      '2026-10-01',
      '2026-10-02',
      '2026-10-02',
      '2026-10-04',
      '2026-10-05',
      'invalid',
    ])).toBe(2);
    expect(computeCurrentConsecutiveDays(['2026-10-01', '2026-10-02', '2026-10-03'])).toBe(3);
  });

  test('retains historical 30-day eligibility while reporting the newest streak separately', () => {
    const firstThirtyDays = Array.from({ length: 30 }, (_, index) =>
      new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10));
    const values = [...firstThirtyDays, '2026-03-12'];

    expect(computeCurrentConsecutiveDays(values)).toBe(1);
    expect(computeLongestConsecutiveDays(values)).toBe(30);
  });

  test('prefers device-local publish date, then persisted publish time, then ingestion time', () => {
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: '2026-10-25',
      date: new Date('2026-10-24T23:30:00.000Z'),
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    })).toBe('2026-10-25');
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: null,
      date: new Date('2026-10-24T23:30:00.000Z'),
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    })).toBe('2026-10-24');
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: 'invalid',
      date: null as never,
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    })).toBe('2026-10-26');
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: null,
      date: null as never,
      createdAt: null as never,
    })).toBeUndefined();
  });
});
