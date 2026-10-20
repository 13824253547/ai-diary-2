import { CORE_DIARY_CONTRACT_VERSION, isCreateGenerationJobRequestContract, isDiaryContentContract, isDiaryContentContractForPhotoIds, isDraftContract, isGenerationJobContract, isGenerationResultContract, isMemoriesQuery, isPhotoAssetContract, isRewriteBlockResultContract, type MemoriesQuery, type RemoteResult } from '../core-diary-contract';

describe('core diary contract', () => {
  test('CASE-BAS-001-002 validates photo asset and draft examples', () => {
    expect(isPhotoAssetContract({
      id: 'photo-1',
      uri: 'ph://photo-1',
      previewUri: 'ph://photo-1-preview',
      width: 1080,
      height: 1440,
    })).toBe(true);

    expect(isPhotoAssetContract({
      id: '',
      uri: 'ph://photo-1',
      previewUri: 'ph://photo-1-preview',
      width: 1080,
      height: 1440,
    })).toBe(false);

    expect(isDraftContract({
      id: 'draft-1',
      type: 'travel',
      characterId: 'character-blue',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      privacy: 'private',
      version: 1,
    })).toBe(true);

    expect(isDraftContract({
      id: 'draft-legacy-emotion',
      sourceDiaryId: 'diary-3',
      type: 'emotion',
      characterId: 'character-brown',
      selectedPhotoIds: ['photo-5', 'photo-6'],
      privacy: 'private',
      version: 1,
    })).toBe(true);

    expect(isDraftContract({
      id: 'draft-1',
      type: 'unknown',
      characterId: '',
      selectedPhotoIds: [],
      privacy: 'private',
      version: 1,
    })).toBe(false);
  });

  test('CASE-BAS-001-003 models success and failure remote results with one contract version', () => {
    const success: RemoteResult<{ jobId: string }> = {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: { jobId: 'job-1' },
    };
    const failure: RemoteResult<never> = {
      ok: false,
      version: CORE_DIARY_CONTRACT_VERSION,
      error: {
        code: 'timeout',
        message: 'generation request timed out',
        retryable: true,
      },
    };

    expect(success.version).toBe(CORE_DIARY_CONTRACT_VERSION);
    expect(failure.version).toBe(CORE_DIARY_CONTRACT_VERSION);
    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(failure.error.retryable).toBe(true);
  });

  test('CASE-BAS-001-004 validates async job and memories query semantics', () => {
    expect(isGenerationJobContract({
      jobId: 'job-1',
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-v2',
      status: 'running',
      stage: 'drafting',
      progressPercent: 40,
    })).toBe(true);

    expect(isGenerationJobContract({
      jobId: 'job-2',
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-v3',
      status: 'succeeded',
      stage: 'completed',
      progressPercent: 100,
      result: {
        title: '海风吹过的一天',
        summary: '把安静的午后写成了一页日记。',
        location: '台南',
        date: '2026.10.13',
        companionName: '同行人',
        coverPhotoId: 'photo-1',
        posterPhotoIds: ['photo-1', 'photo-2'],
        blocks: [
          { id: 'block-1', type: 'text', content: '阳光落在红墙上。', photoIds: ['photo-1'] },
          { id: 'block-2', type: 'photo', photoId: 'photo-1', caption: '红墙与树影', relatedBlockId: 'block-1' },
        ],
      },
    })).toBe(true);

    expect(isGenerationJobContract({
      jobId: 'job-3',
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-v4',
      status: 'succeeded',
      stage: 'completed',
      progressPercent: 100,
    })).toBe(false);

    const query: MemoriesQuery = { month: '2026-01', page: 1, pageSize: 20 };
    expect(isMemoriesQuery(query)).toBe(true);
    expect(isMemoriesQuery({ page: 0, pageSize: '20' })).toBe(false);
    expect(isMemoriesQuery({ page: 1, pageSize: 15 })).toBe(false);
    expect(isMemoriesQuery({ page: 1.5, pageSize: 20 })).toBe(false);
    expect(isMemoriesQuery({ month: '2024-02', day: '2024-02-29', page: 1, pageSize: 20 })).toBe(true);
    expect(isMemoriesQuery({ month: '2026-13', page: 1, pageSize: 20 })).toBe(false);
    expect(isMemoriesQuery({ day: '2026-02-29', page: 1, pageSize: 20 })).toBe(false);
    expect(isMemoriesQuery({ day: '2024-02-30', page: 1, pageSize: 20 })).toBe(false);
    expect(isMemoriesQuery({ month: '2026/02', page: 1, pageSize: 20 })).toBe(false);
  });

  test('validates rewrite block result payloads', () => {
    expect(isRewriteBlockResultContract({
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 3,
      blockType: 'text',
      content: '把这一段改得更顺了。',
      photoIds: ['photo-1'],
    })).toBe(true);

    expect(isRewriteBlockResultContract({
      draftId: 'draft-1',
      blockId: '',
      draftVersion: 3,
      blockType: 'text',
      content: '',
    })).toBe(false);
    for (const draftVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isRewriteBlockResultContract({
        draftId: 'draft-1',
        blockId: 'block-1',
        draftVersion,
        blockType: 'text',
        content: '改写结果',
      })).toBe(false);
    }
  });

  test('requires positive safe integer versions for generation requests and responses', () => {
    const request = {
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-round-2',
    };
    expect(isCreateGenerationJobRequestContract(request)).toBe(true);
    expect(isCreateGenerationJobRequestContract({ ...request, draftId: ' ' })).toBe(false);
    expect(isCreateGenerationJobRequestContract({ ...request, idempotencyKey: '' })).toBe(false);
    for (const draftVersion of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isCreateGenerationJobRequestContract({ ...request, draftVersion })).toBe(false);
      expect(isGenerationJobContract({
        jobId: 'job-1',
        ...request,
        draftVersion,
        status: 'running',
        stage: 'drafting',
      })).toBe(false);
    }
  });

  test('requires a diary body paragraph and photo references within the diary asset set', () => {
    const content = {
      type: 'travel',
      subtitle: '',
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      coverPhotoId: 'photo-1',
      posterPhotoIds: ['photo-1'],
      blocks: [{ id: 'block-1', type: 'text', content: '真实正文。', photoIds: ['photo-1'] }],
      people: [],
    };

    expect(isDiaryContentContract(content)).toBe(true);
    expect(isDiaryContentContract({ ...content, blocks: [] })).toBe(false);
    expect(isDiaryContentContract({
      ...content,
      blocks: [{ id: 'photo-only', type: 'photo', photoId: 'photo-1', caption: '图片' }],
    })).toBe(false);
    expect(isDiaryContentContractForPhotoIds(content, ['photo-1'])).toBe(true);
    expect(isDiaryContentContractForPhotoIds(content, ['photo-2'])).toBe(false);
    expect(isDiaryContentContractForPhotoIds({
      ...content,
      blocks: [{ id: 'block-1', type: 'text', content: '越界引用。', photoIds: ['photo-2'] }],
    }, ['photo-1'])).toBe(false);
    const duplicatePeople = [
      { id: 'person-1', name: '同行者甲', photoIds: ['photo-1'], avatarPhotoId: 'photo-1' },
      { id: 'person-1', name: '同行者乙', photoIds: ['photo-1'], avatarPhotoId: 'photo-1' },
    ];
    expect(isDiaryContentContract({ ...content, people: duplicatePeople })).toBe(false);
    expect(isGenerationResultContract({
      title: '标题',
      summary: '摘要',
      location: '厦门',
      date: '2026.10.16',
      companionName: '同行人',
      coverPhotoId: 'photo-1',
      posterPhotoIds: ['photo-1'],
      blocks: [{ id: 'block-1', type: 'text', content: '正文。' }],
      people: duplicatePeople,
    })).toBe(false);
  });
});
