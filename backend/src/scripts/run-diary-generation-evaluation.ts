import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DIARY_GENERATION_FIXTURES,
  buildDiaryGenerationEvaluationResult,
  buildDiaryGenerationFailureResult,
  renderDiaryGenerationEvaluationMarkdown,
} from '../common/diary-generation-evaluation';
import { DiaryGenerationService } from '../common/diary-generation.service';

async function main() {
  const provider = process.env.DIARY_GENERATION_EVAL_PROVIDER?.trim() || 'deterministic';
  if (provider !== 'deterministic') {
    throw new Error('The fixture runner has no approved photo files; use a separately authorized evaluation set for real-provider calls.');
  }
  const previousDiaryProvider = process.env.DIARY_GENERATION_PROVIDER;
  process.env.DIARY_GENERATION_PROVIDER = 'deterministic';
  const service = new DiaryGenerationService();
  const generatedAt = new Date().toISOString();
  const results = [];

  try {
    for (const fixture of DIARY_GENERATION_FIXTURES) {
      try {
        const result = await service.generate(fixture.input);
        results.push(buildDiaryGenerationEvaluationResult(fixture, result));
      } catch (error) {
        results.push(buildDiaryGenerationFailureResult(fixture, error));
      }
    }
  } finally {
    if (previousDiaryProvider === undefined) delete process.env.DIARY_GENERATION_PROVIDER;
    else process.env.DIARY_GENERATION_PROVIDER = previousDiaryProvider;
  }

  const reportDir = path.resolve(__dirname, '../../../docs/reference/delivery/reports');
  await mkdir(reportDir, { recursive: true });
  const markdownPath = path.join(reportDir, 'cre-005-quality-baseline.md');
  const jsonPath = path.join(reportDir, 'cre-005-quality-baseline.json');

  await writeFile(
    markdownPath,
    renderDiaryGenerationEvaluationMarkdown({
      provider,
      generatedAt,
      results,
    }),
    'utf8',
  );
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        provider,
        generatedAt,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  const failed = results.filter(result => !result.structurePassed);
  console.log(`wrote ${path.relative(process.cwd(), markdownPath)}`);
  console.log(`wrote ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`provider=${provider} fixtures=${results.length} failed=${failed.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
