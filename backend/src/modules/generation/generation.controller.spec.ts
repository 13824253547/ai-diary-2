import { BadRequestException, ConflictException } from '@nestjs/common';
import { GenerationJobError, MemoryStoreService } from '../../common/memory-store.service';
import { GenerationController } from './generation.controller';

describe('GenerationController', () => {
  const store = {
    createGenerationJob: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
    rewriteDraftBlock: jest.fn().mockResolvedValue({ draftId: 'draft-1', blockId: 'block-1' }),
  } as unknown as MemoryStoreService;
  const controller = new GenerationController(store);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    null,
    {},
    { draftId: 'draft-1', draftVersion: 0, idempotencyKey: 'draft-1-round-1' },
    { draftId: 'draft-1', draftVersion: 1.5, idempotencyKey: 'draft-1-round-1' },
    { draftId: 'draft-1', draftVersion: Number.MAX_SAFE_INTEGER + 1, idempotencyKey: 'draft-1-round-1' },
    { draftId: 'draft-1', draftVersion: 1, idempotencyKey: ' ' },
  ])('rejects malformed generation requests before touching the store', async body => {
    await expect(controller.createJob(body)).rejects.toBeInstanceOf(BadRequestException);
    expect(store.createGenerationJob).not.toHaveBeenCalled();
  });

  test('requires device identity before reporting malformed generation input', async () => {
    try {
      await controller.createJob(null);
      fail('expected missing device identity to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        error: { code: 'device_identity_required' },
      });
    }
    expect(store.createGenerationJob).not.toHaveBeenCalled();
  });

  test('passes a valid versioned request to the device-scoped store', async () => {
    await expect(controller.createJob({
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-round-2',
    }, ' device-1 ')).resolves.toEqual({
      ok: true,
      data: { jobId: 'job-1' },
    });

    expect(store.createGenerationJob).toHaveBeenCalledWith({
      draftId: 'draft-1',
      draftVersion: 2,
      idempotencyKey: 'draft-1-round-2',
    }, 'device-1');
  });

  test('maps idempotency payload conflicts to a non-retryable version conflict', async () => {
    (store.createGenerationJob as jest.Mock).mockRejectedValueOnce(
      new GenerationJobError('version_conflict', '生成任务幂等键已绑定到其他草稿版本。'),
    );

    try {
      await controller.createJob({
        draftId: 'draft-1',
        draftVersion: 2,
        idempotencyKey: 'draft-1-round-2',
      }, 'device-1');
      fail('expected idempotency payload conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        error: { code: 'version_conflict', retryable: false },
      });
    }
  });

  test.each([
    null,
    {},
    { draftId: 'draft-1', blockId: 'block-1', draftVersion: 0 },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'photo',
      content: 'paragraph',
      selectedPhotoIds: [],
    },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'text',
      content: ' ',
      selectedPhotoIds: [],
    },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'quote',
      content: 'paragraph',
      selectedPhotoIds: 'photo-1',
    },
    {
      draftId: 'draft-1',
      blockId: 'block-1',
      draftVersion: 1,
      characterId: 'character-blue',
      blockType: 'text',
      content: 'paragraph',
      selectedPhotoIds: ['photo-1'],
      photoIds: [' '],
    },
  ])('rejects malformed rewrite requests before touching the store', async body => {
    await expect(controller.rewriteBlock(body, 'device-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(store.rewriteDraftBlock).not.toHaveBeenCalled();
  });

  test('requires device identity before reporting malformed rewrite input', async () => {
    await expect(controller.rewriteBlock(null)).rejects.toMatchObject({
      response: { error: { code: 'device_identity_required' } },
    });
    expect(store.rewriteDraftBlock).not.toHaveBeenCalled();
  });
});
