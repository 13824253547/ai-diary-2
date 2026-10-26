import type { GenerationInputSnapshot, GenerationResultRecord } from './diary-generation.service';

export type DiaryGenerationFixture = {
  id: string;
  title: string;
  description: string;
  input: GenerationInputSnapshot;
  expected: {
    requirePeople: boolean;
    requirePhotoBlock: boolean;
  };
};

export type DiaryGenerationStructureCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type DiaryGenerationManualDimension = {
  id: string;
  label: string;
  guidance: string;
};

export type DiaryGenerationEvaluationResult = {
  fixtureId: string;
  fixtureTitle: string;
  structureChecks: DiaryGenerationStructureCheck[];
  structurePassed: boolean;
  result?: GenerationResultRecord;
  failureMessage?: string;
};

export const DIARY_GENERATION_FIXTURES: DiaryGenerationFixture[] = [
  {
    id: 'travel-green-people',
    title: '台南双人出行',
    description: '验证有人物场景下的结构、照片引用和人物候选。',
    input: {
      draftId: 'fixture-travel-green-people',
      draftVersion: 3,
      type: 'travel',
      characterId: 'character-green',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-11', 'photo-12'],
      privacy: 'private',
    },
    expected: {
      requirePeople: true,
      requirePhotoBlock: true,
    },
  },
  {
    id: 'travel-blue-landscape',
    title: '圣托里尼风景组',
    description: '验证无人物场景下的风景日记结构和照片归属。',
    input: {
      draftId: 'fixture-travel-blue-landscape',
      draftVersion: 4,
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-13', 'photo-14', 'photo-15', 'photo-17'],
      privacy: 'private',
    },
    expected: {
      requirePeople: false,
      requirePhotoBlock: true,
    },
  },
  {
    id: 'travel-brown-city',
    title: '城市夜行与街景',
    description: '验证另一种排版师与城市题材下的正文组织。',
    input: {
      draftId: 'fixture-travel-brown-city',
      draftVersion: 2,
      type: 'travel',
      characterId: 'character-brown',
      selectedPhotoIds: ['photo-4', 'photo-5', 'photo-8', 'photo-9'],
      privacy: 'private',
    },
    expected: {
      requirePeople: false,
      requirePhotoBlock: true,
    },
  },
];

export const DIARY_GENERATION_MANUAL_DIMENSIONS: DiaryGenerationManualDimension[] = [
  {
    id: 'grounding',
    label: '照片贴合度',
    guidance: '标题、摘要与整篇内容是否共同来自输入照片，而不是泛化空话。',
  },
  {
    id: 'per-photo-grounding',
    label: '单图事实贴合度',
    guidance: '第 i 个正文块是否准确描述第 i 张照片可见的内容，没有串图或添加画面无法证明的事实。',
  },
  {
    id: 'continuity',
    label: '跨段连贯性',
    guidance: '所有段落是否形成同一趟旅程的起承转合，前后自然衔接，没有重复或自相矛盾。',
  },
  {
    id: 'character-tone',
    label: '排版师文风区分度',
    guidance: '不同 `characterId` 是否带来可感知的语气差异，同时仍保持自然中文表达。',
  },
  {
    id: 'editability',
    label: '可编辑性',
    guidance: '正文块长度、标题和摘要是否适合进入编辑页继续修改，而非一次性长文堆叠。',
  },
];

function hasNonEmptyString(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatCheck(id: string, label: string, passed: boolean, detail: string): DiaryGenerationStructureCheck {
  return { id, label, passed, detail };
}

export function evaluateDiaryGenerationResult(
  fixture: DiaryGenerationFixture,
  result: GenerationResultRecord,
): DiaryGenerationStructureCheck[] {
  const selectedPhotoIds = new Set(fixture.input.selectedPhotoIds);
  const photoBlocks = result.blocks.filter(block => block.type === 'photo');
  const textBlocks = result.blocks.filter(block => block.type === 'text');
  const quoteBlocks = result.blocks.filter(block => block.type === 'quote');
  const hasOneTextPerPhoto = textBlocks.length === fixture.input.selectedPhotoIds.length;
  const textPhotoOrderValid = hasOneTextPerPhoto && textBlocks.every((block, index) =>
    block.type === 'text'
    && block.photoIds?.length === 1
    && block.photoIds[0] === fixture.input.selectedPhotoIds[index]);
  const referencedPhotoIds = result.blocks.flatMap(block => {
    if (block.type === 'photo') {
      return [block.photoId];
    }
    if ('photoIds' in block && Array.isArray(block.photoIds)) {
      return block.photoIds;
    }
    return [];
  });
  const invalidReferencedPhotoIds = referencedPhotoIds.filter(photoId => !selectedPhotoIds.has(photoId));
  const invalidPosterPhotoIds = result.posterPhotoIds.filter(photoId => !selectedPhotoIds.has(photoId));
  const people = result.people ?? [];
  const invalidPeoplePhotoIds = people.flatMap(person => {
    const invalid = person.photoIds.filter(photoId => !selectedPhotoIds.has(photoId));
    if (!selectedPhotoIds.has(person.avatarPhotoId)) {
      invalid.push(person.avatarPhotoId);
    }
    return invalid;
  });

  return [
    formatCheck(
      'title',
      '标题存在且非空',
      hasNonEmptyString(result.title),
      hasNonEmptyString(result.title) ? `标题长度 ${result.title.trim().length}` : '标题缺失或为空',
    ),
    formatCheck(
      'summary',
      '摘要存在且非空',
      hasNonEmptyString(result.summary),
      hasNonEmptyString(result.summary) ? `摘要长度 ${result.summary.trim().length}` : '摘要缺失或为空',
    ),
    formatCheck(
      'location-date',
      '地点与日期存在',
      hasNonEmptyString(result.location) && hasNonEmptyString(result.date),
      `location=${result.location || 'missing'}, date=${result.date || 'missing'}`,
    ),
    formatCheck(
      'cover-photo',
      '封面照片来自输入集合',
      selectedPhotoIds.has(result.coverPhotoId),
      `coverPhotoId=${result.coverPhotoId}`,
    ),
    formatCheck(
      'poster-photos',
      '海报照片集合合法',
      invalidPosterPhotoIds.length === 0 && result.posterPhotoIds.length <= 2,
      invalidPosterPhotoIds.length
        ? `非法海报照片: ${invalidPosterPhotoIds.join(', ')}`
        : `posterPhotoIds=${result.posterPhotoIds.join(', ') || '(empty)'}`,
    ),
    formatCheck(
      'blocks',
      '至少包含一个正文块',
      textBlocks.length > 0,
      `text=${textBlocks.length}, quote=${quoteBlocks.length}, photo=${photoBlocks.length}`,
    ),
    formatCheck(
      'one-text-per-photo',
      '正文块数量与所选照片数量一致',
      hasOneTextPerPhoto,
      `text=${textBlocks.length}, selectedPhotos=${fixture.input.selectedPhotoIds.length}`,
    ),
    formatCheck(
      'text-photo-order',
      '每段只绑定选择顺序对应的一张照片',
      textPhotoOrderValid,
      textPhotoOrderValid
        ? `ordered=${textBlocks.map(block => block.type === 'text' ? block.photoIds?.[0] : '').join(', ')}`
        : '正文块照片引用缺失、多图、错序或数量不匹配',
    ),
    formatCheck(
      'no-quote-blocks',
      '没有额外的独立引用句块',
      quoteBlocks.length === 0,
      `quote=${quoteBlocks.length}`,
    ),
    formatCheck(
      'photo-reference',
      '所有照片引用均来自输入集合',
      invalidReferencedPhotoIds.length === 0,
      invalidReferencedPhotoIds.length
        ? `非法照片引用: ${invalidReferencedPhotoIds.join(', ')}`
        : `共引用 ${referencedPhotoIds.length} 次`,
    ),
    formatCheck(
      'photo-block',
      '包含至少一个配图块',
      fixture.expected.requirePhotoBlock ? photoBlocks.length > 0 : true,
      `photoBlocks=${photoBlocks.length}`,
    ),
    formatCheck(
      'people',
      '人物候选符合场景预期',
      fixture.expected.requirePeople ? people.length > 0 && invalidPeoplePhotoIds.length === 0 : invalidPeoplePhotoIds.length === 0,
      fixture.expected.requirePeople
        ? `people=${people.length}, invalidRefs=${invalidPeoplePhotoIds.join(', ') || 'none'}`
        : `people=${people.length}, invalidRefs=${invalidPeoplePhotoIds.join(', ') || 'none'}`,
    ),
  ];
}

export function buildDiaryGenerationEvaluationResult(
  fixture: DiaryGenerationFixture,
  result: GenerationResultRecord,
): DiaryGenerationEvaluationResult {
  const structureChecks = evaluateDiaryGenerationResult(fixture, result);
  return {
    fixtureId: fixture.id,
    fixtureTitle: fixture.title,
    structureChecks,
    structurePassed: structureChecks.every(check => check.passed),
    result,
  };
}

export function buildDiaryGenerationFailureResult(
  fixture: DiaryGenerationFixture,
  error: unknown,
): DiaryGenerationEvaluationResult {
  return {
    fixtureId: fixture.id,
    fixtureTitle: fixture.title,
    structureChecks: [],
    structurePassed: false,
    failureMessage: error instanceof Error ? error.message : String(error),
  };
}

export function renderDiaryGenerationEvaluationMarkdown(input: {
  provider: string;
  generatedAt: string;
  results: DiaryGenerationEvaluationResult[];
}) {
  const header = [
    '# CRE-005 生成质量基线报告',
    '',
    `- 生成时间：${input.generatedAt}`,
    `- Provider：\`${input.provider}\``,
    `- 说明：本报告用于执行 \`CASE-BAS-001-004\` 与 \`CASE-CRE-005-010\` 的前置质量基线。自动部分只校验结构与照片归属；人工维度仍需结合截图或页面结果复核。`,
    '',
    '## 自动结果汇总',
    '',
    '| 夹具 | 结构结果 | 失败信息 |',
    '| --- | --- | --- |',
    ...input.results.map(result => `| ${result.fixtureTitle} | ${result.structurePassed ? 'passed' : 'failed'} | ${result.failureMessage ?? '-'} |`),
    '',
    '## 人工评分说明',
    '',
    '- 评分建议：`2=满足基线`，`1=可用但需要润色`，`0=明显不合格`。',
    '- 本评分仅作为第一阶段工程基线，不替代 Q-002 的正式产品阈值。',
    '',
  ];

  const manualSection = DIARY_GENERATION_MANUAL_DIMENSIONS.flatMap(dimension => ([
    `### ${dimension.label}`,
    '',
    `- 关注点：${dimension.guidance}`,
    '',
  ]));

  const fixturesSection = input.results.flatMap(result => {
    const checks = result.structureChecks.length
      ? [
          '| 检查项 | 结果 | 说明 |',
          '| --- | --- | --- |',
          ...result.structureChecks.map(check => `| ${check.label} | ${check.passed ? 'passed' : 'failed'} | ${check.detail} |`),
        ]
      : ['- 本次未生成结构结果。'];

    const resultPreview = result.result
      ? [
          '',
          '**结果预览**',
          '',
          `- 标题：${result.result.title}`,
          `- 摘要：${result.result.summary}`,
          `- 地点：${result.result.location}`,
          `- 日期：${result.result.date}`,
          `- 封面：${result.result.coverPhotoId}`,
          `- 海报照片：${result.result.posterPhotoIds.join(', ') || '(empty)'}`,
          `- 正文块数：${result.result.blocks.filter(block => block.type === 'text').length}`,
          `- 图片块数：${result.result.blocks.filter(block => block.type === 'photo').length}`,
          `- 人物候选：${result.result.people?.map(person => person.name).join(', ') || '(none)'}`,
        ]
      : [];

    const scoreTable = [
      '',
      '**人工评分记录**',
      '',
      '| 维度 | 建议分值 | 备注 |',
      '| --- | --- | --- |',
      ...DIARY_GENERATION_MANUAL_DIMENSIONS.map(dimension => `| ${dimension.label} | 待填写 | 待填写 |`),
      '',
    ];

    return [
      `## 夹具：${result.fixtureTitle}`,
      '',
      `- fixtureId：\`${result.fixtureId}\``,
      result.failureMessage ? `- 失败信息：${result.failureMessage}` : '- 失败信息：-',
      '',
      ...checks,
      ...resultPreview,
      ...scoreTable,
    ];
  });

  return [...header, ...manualSection, ...fixturesSection, ''].join('\n');
}
