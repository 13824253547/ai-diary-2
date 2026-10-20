import { HttpAnchorCorrectionRepository } from '../http-anchor-correction-repository';
import { AnchorCorrectionRepositoryError } from '../anchor-correction-repository';
import type { ApiClient } from '../../services/api-client';

const record = {
  id: 'correction-1',
  diaryId: 'diary-1',
  diaryVersion: 3,
  anchorId: 'anchor/one',
  sourceBlockId: 'block-1',
  correction: 'More accurate meaning',
  version: 1,
  source: 'user' as const,
  updatedAt: '2026-10-16T00:00:00.000Z',
};

describe('HttpAnchorCorrectionRepository', () => {
  const client = {
    request: jest.fn(),
  } as unknown as ApiClient;
  const repository = new HttpAnchorCorrectionRepository(client);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reads a source-versioned correction and accepts an explicit empty result', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'anchor-correction-v1', data: null },
    });

    await expect(repository.getCorrection({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor/one',
    })).resolves.toBeNull();
    expect(client.request).toHaveBeenCalledWith(
      '/anchors/anchor%2Fone/correction?diaryId=diary-1&diaryVersion=3',
      { method: 'GET' },
      undefined,
    );
  });

  test('rejects malformed inputs and correction records for another request target', async () => {
    await expect(repository.getCorrection(null as never)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(repository.saveCorrection(null as never)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(client.request).not.toHaveBeenCalled();

    jest.mocked(client.request).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        ok: true,
        version: 'anchor-correction-v1',
        data: { ...record, diaryId: 'diary-other' },
      },
    });
    await expect(repository.getCorrection({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor/one',
    })).rejects.toMatchObject({ code: 'provider_failed', retryable: false });

    jest.mocked(client.request).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        ok: true,
        version: 'anchor-correction-v1',
        data: { ...record, correction: 'Not the submitted correction' },
      },
    });
    await expect(repository.saveCorrection({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor/one',
      sourceBlockId: 'block-1',
      correction: 'More accurate meaning',
      expectedVersion: 0,
      idempotencyKey: 'request-1',
    })).rejects.toMatchObject({ code: 'provider_failed', retryable: false });
  });

  test('trims correction text and sends the expected source and concurrency fields', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'anchor-correction-v1', data: record },
    });

    await expect(repository.saveCorrection({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor/one',
      sourceBlockId: 'block-1',
      correction: '  More accurate meaning  ',
      expectedVersion: 0,
      idempotencyKey: 'request-1',
    })).resolves.toEqual(record);
    expect(client.request).toHaveBeenCalledWith(
      '/anchors/anchor%2Fone/correction',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diaryId: 'diary-1',
          diaryVersion: 3,
          sourceBlockId: 'block-1',
          correction: 'More accurate meaning',
          expectedVersion: 0,
          idempotencyKey: 'request-1',
        }),
      },
      undefined,
    );
  });

  test('rejects blank and malformed successful responses', async () => {
    await expect(repository.saveCorrection({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor-1',
      sourceBlockId: 'block-1',
      correction: ' \n ',
      expectedVersion: 0,
      idempotencyKey: 'request-1',
    })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(client.request).not.toHaveBeenCalled();

    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'wrong-version', data: record },
    });
    await expect(repository.getCorrection({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor-1',
    })).rejects.toBeInstanceOf(AnchorCorrectionRepositoryError);
  });
});
