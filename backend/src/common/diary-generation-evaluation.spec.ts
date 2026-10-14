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
});
