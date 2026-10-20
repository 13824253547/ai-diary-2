import { MemoryStoreService } from '../../common/memory-store.service';
import { SharingController } from './sharing.controller';

describe('SharingController', () => {
  const store = {
    updateDiaryVisibility: jest.fn(),
  } as unknown as MemoryStoreService;
  const controller = new SharingController(store);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires device identity before reading a malformed sharing body', async () => {
    await expect(controller.project(undefined as never, undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    expect(store.updateDiaryVisibility).not.toHaveBeenCalled();
  });

  test.each([
    null,
    {},
    { diaryId: 'diary-1', privacy: 'public' },
    { diaryId: 'diary-1', privacy: 'private', publicBlockIds: [' '] },
  ])('rejects malformed sharing bodies before calling the store', async (body: unknown) => {
    await expect(controller.project(body, 'device-1'))
      .rejects.toMatchObject({
        response: { error: { code: 'invalid_input', retryable: false } },
      });
    expect(store.updateDiaryVisibility).not.toHaveBeenCalled();
  });
});
