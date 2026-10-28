import type { DiaryPhoto } from '../../types/diary';

type MultipartEntry = { name: string; value: unknown };

class TestFormData {
  entries: MultipartEntry[] = [];

  append(name: string, value: unknown) {
    this.entries.push({ name, value });
  }
}

const devicePhoto: DiaryPhoto = {
  id: 'device-photo-1',
  title: '河岸傍晚',
  location: '',
  emoji: '🖼',
  color: '#EFE3D5',
  date: '2026.10.23',
  uri: 'ph://device-photo-1',
  localUri: 'file:///device-photo-1.jpg',
  filename: 'photo-1.jpg',
  width: 1200,
  height: 1600,
  source: 'device',
};

describe('material photo API', () => {
  const originalFormData = global.FormData;
  const originalWorkerId = process.env.JEST_WORKER_ID;
  let client: {
    get: jest.Mock;
    request: jest.Mock;
    buildUrl: jest.Mock;
  };
  let clientOptions: { getHeaders?: () => Promise<Record<string, string>> } | undefined;
  let api: typeof import('../material-photo-api');

  beforeEach(() => {
    jest.resetModules();
    clientOptions = undefined;
    client = {
      get: jest.fn(),
      request: jest.fn(),
      buildUrl: jest.fn(path => `https://api.example.test${path}`),
    };
    jest.doMock('../api-client', () => ({
      ApiClient: jest.fn((options: typeof clientOptions) => {
        clientOptions = options;
        return client;
      }),
    }));
    jest.doMock('../device-identity', () => ({
      getDeviceIdentityHeaders: jest.fn(async () => ({
        'x-device-id': 'device-1',
        Authorization: 'Bearer test-token',
      })),
    }));
    global.FormData = TestFormData as unknown as typeof FormData;
    delete process.env.JEST_WORKER_ID;
    api = require('../material-photo-api') as typeof import('../material-photo-api');
  });

  afterEach(() => {
    global.FormData = originalFormData;
    if (originalWorkerId === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = originalWorkerId;
    jest.dontMock('../api-client');
    jest.dontMock('../device-identity');
    jest.resetModules();
  });

  test('uploads multipart photos with device identity and uses the server asset URL', async () => {
    client.request.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        ok: true,
        data: [{
          id: 'material-1',
          sourceAssetId: 'device-photo-1',
          title: '河岸傍晚',
          date: '2026.10.23',
          filename: 'photo-1.jpg',
          mimeType: 'image/jpeg',
          size: 5,
          width: 1200,
          height: 1600,
        }],
      },
    });

    const result = await api.uploadMaterialPhotosToBackend([devicePhoto]);

    expect(result.ok).toBe(true);
    expect(client.request).toHaveBeenCalledWith(
      '/photos/materials',
      expect.objectContaining({ method: 'POST', body: expect.any(TestFormData) }),
      { transport: 'xhr', timeoutMs: 120_000 },
    );
    await expect(clientOptions?.getHeaders?.()).resolves.toEqual({
      'x-device-id': 'device-1',
      Authorization: 'Bearer test-token',
    });
    const [path, request] = client.request.mock.calls[0] as [string, { body: TestFormData }];
    expect(path).toBe('/photos/materials');
    expect(request.body.entries).toHaveLength(2);
    expect(request.body.entries[0]).toMatchObject({ name: 'photoMetadata' });
    expect(request.body.entries[1]).toMatchObject({
      name: 'photos',
      value: {
        uri: 'file:///device-photo-1.jpg',
        name: 'photo-1.jpg',
        type: 'image/jpeg',
      },
    });
    if (!result.ok) throw new Error('material upload unexpectedly failed');
    expect(result.photos[0]).toMatchObject({
      id: 'material-1',
      sourceAssetId: 'device-photo-1',
      uri: 'https://api.example.test/photos/materials/material-1/content',
      localUri: undefined,
      remoteHeaders: {
        'x-device-id': 'device-1',
        Authorization: 'Bearer test-token',
      },
    });
  });

  test('does not send a request containing more than twelve photos', async () => {
    const result = await api.uploadMaterialPhotosToBackend(
      Array.from({ length: 13 }, (_, index) => ({ ...devicePhoto, id: `device-${index}` })),
    );

    expect(result).toMatchObject({ ok: false });
    expect(client.request).not.toHaveBeenCalled();
  });

  test('maps uploaded and generated assets from the same authenticated material list', async () => {
    client.get.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'generated-1',
          sourceAssetId: 'request-1',
          title: '雨后的老街',
          date: '2026.10.23',
          filename: 'generated-1.jpg',
          mimeType: 'image/jpeg',
          size: 5,
          generationRequestId: 'request-1',
          generationPrompt: '雨后的老街',
          generationSource: 'ark-seedream',
        },
        {
          id: 'uploaded-1',
          sourceAssetId: 'device-1',
          title: '河岸',
          date: '2026.10.23',
          filename: 'uploaded-1.jpg',
          mimeType: 'image/jpeg',
          size: 5,
        },
      ],
    });

    const result = await api.listMaterialPhotosFromBackend();

    expect(client.get).toHaveBeenCalledWith('/photos/materials');
    expect(result).toMatchObject({
      ok: true,
      photos: [
        {
          id: 'generated-1',
          source: 'generated',
          generationSource: 'provider',
          generationRequestId: 'request-1',
          uri: 'https://api.example.test/photos/materials/generated-1/content',
          remoteHeaders: { 'x-device-id': 'device-1' },
        },
        { id: 'uploaded-1', source: 'device' },
      ],
    });
  });

  test('rejects a material list when device identity changes during the request', async () => {
    const identity = require('../device-identity') as { getDeviceIdentityHeaders: jest.Mock };
    identity.getDeviceIdentityHeaders
      .mockResolvedValueOnce({ 'x-device-id': 'device-1' })
      .mockResolvedValueOnce({ 'x-device-id': 'device-2' });
    client.get.mockResolvedValue({ ok: true, data: [] });

    await expect(api.listMaterialPhotosFromBackend())
      .resolves.toMatchObject({ ok: false });
  });

  test('builds a diary-scoped photo URL while preserving each diary-copy pair', async () => {
    client.get.mockResolvedValue({
      ok: true,
      data: [{
        id: 'material-1',
        sourceAssetId: 'material-1',
        diaryId: 'diary-1',
        title: '河岸傍晚',
        date: '2026.10.23',
        filename: 'photo-1.jpg',
        mimeType: 'image/jpeg',
        size: 5,
        width: 1200,
        height: 1600,
      }],
    });

    const copies = await api.listSavedDiaryPhotoAssets(['diary-1']);

    expect(client.get).toHaveBeenCalledWith('/photos/diaries/assets?diaryIds=diary-1');
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({
      id: 'material-1',
      diaryId: 'diary-1',
      uri: 'https://api.example.test/photos/diaries/diary-1/photo-content?photoId=material-1',
    });
    expect(api.getDiaryPhotoContentUrl('diary-2', 'material-1'))
      .toBe('https://api.example.test/photos/diaries/diary-2/photo-content?photoId=material-1');
    expect(api.getDiaryPhotoContentUrl('diary-2', 'asset/L0/001'))
      .toBe('https://api.example.test/photos/diaries/diary-2/photo-content?photoId=asset%2FL0%2F001');
  });
});
