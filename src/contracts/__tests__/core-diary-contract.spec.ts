import { CORE_DIARY_CONTRACT_VERSION, isDraftContract, isGenerationJobContract, isMemoriesQuery, isPhotoAssetContract, isRewriteBlockResultContract, type MemoriesQuery, type RemoteResult } from '../core-diary-contract';

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
  });
});
