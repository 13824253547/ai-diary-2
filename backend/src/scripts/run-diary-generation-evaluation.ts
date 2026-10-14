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
  const service = new DiaryGenerationService();
  const provider = (process.env.AI_PROVIDER ?? 'deterministic').trim();
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const fixture of DIARY_GENERATION_FIXTURES) {
    try {
      const result = await service.generate(fixture.input);
      results.push(buildDiaryGenerationEvaluationResult(fixture, result));
    } catch (error) {
      results.push(buildDiaryGenerationFailureResult(fixture, error));
    }
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
