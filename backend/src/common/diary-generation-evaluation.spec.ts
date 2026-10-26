import { DiaryGenerationService } from './diary-generation.service';
import {
  DIARY_GENERATION_FIXTURES,
  buildDiaryGenerationEvaluationResult,
  evaluateDiaryGenerationResult,
} from './diary-generation-evaluation';

describe('Diary generation evaluation baseline', () => {
  const service = new DiaryGenerationService();
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('deterministic provider satisfies all baseline fixtures', async () => {
    delete process.env.AI_PROVIDER;

    for (const fixture of DIARY_GENERATION_FIXTURES) {
      const result = await service.generate(fixture.input);
      const evaluation = buildDiaryGenerationEvaluationResult(fixture, result);
      expect(evaluation.structurePassed).toBe(true);
    }
  });

  test('evaluation rejects photo references outside the selected set', () => {
    const fixture = DIARY_GENERATION_FIXTURES[0];
    const checks = evaluateDiaryGenerationResult(fixture, {
      title: '不合法结果',
      summary: '摘要',
      location: '某地',
      date: '2026.10.13',
      companionName: '自己',
      coverPhotoId: fixture.input.selectedPhotoIds[0],
      posterPhotoIds: [fixture.input.selectedPhotoIds[0]],
      blocks: [
        {
          id: 'block-1',
          type: 'text',
          content: '正文',
          photoIds: ['photo-outside'],
        },
      ],
      people: [],
    });

    expect(checks.find(check => check.id === 'photo-reference')?.passed).toBe(false);
  });

  test('evaluation requires one ordered text block per selected image and no quote block', () => {
    const fixture = DIARY_GENERATION_FIXTURES[0];
    const base = {
      title: '旅途的一页',
      summary: '按照片顺序连起来。',
      location: '台南',
      date: '2026.10.20',
      companionName: '同行人',
      coverPhotoId: fixture.input.selectedPhotoIds[0],
      posterPhotoIds: fixture.input.selectedPhotoIds.slice(0, 2),
      people: [],
    };
    const checks = evaluateDiaryGenerationResult(fixture, {
      ...base,
      blocks: fixture.input.selectedPhotoIds.map((photoId, index) => ({
        id: `block-${index + 1}`,
        type: 'text' as const,
        content: `沿着这一站继续前进 ${index + 1}。`,
        photoIds: [photoId],
      })),
    });
    expect(checks.find(check => check.id === 'one-text-per-photo')?.passed).toBe(true);
    expect(checks.find(check => check.id === 'text-photo-order')?.passed).toBe(true);
    expect(checks.find(check => check.id === 'no-quote-blocks')?.passed).toBe(true);

    const malformed = evaluateDiaryGenerationResult(fixture, {
      ...base,
      blocks: [
        { id: 'block-1', type: 'text', content: '段落错序。', photoIds: [fixture.input.selectedPhotoIds[1]] },
        ...fixture.input.selectedPhotoIds.slice(1).map((photoId, index) => ({
          id: `block-${index + 2}`,
          type: 'text' as const,
          content: '其它段落。',
          photoIds: [photoId],
        })),
        { id: 'extra-quote', type: 'quote', content: '多出的引用句。' },
      ],
    });
    expect(malformed.find(check => check.id === 'text-photo-order')?.passed).toBe(false);
    expect(malformed.find(check => check.id === 'no-quote-blocks')?.passed).toBe(false);
  });
});
