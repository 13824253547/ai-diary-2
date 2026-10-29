import { ArkPostcardMessageProvider, PostcardMessageProviderError } from './ark-postcard-message-provider';

describe('ArkPostcardMessageProvider', () => {
  const previousEnvironment = {
    provider: process.env.PET_CHAT_PROVIDER,
    baseUrl: process.env.PET_CHAT_BASE_URL,
    model: process.env.PET_CHAT_MODEL,
    apiKey: process.env.PET_CHAT_API_KEY,
  };
  let fetchSpy: jest.SpyInstance;
  let provider: ArkPostcardMessageProvider;

  beforeEach(() => {
    process.env.PET_CHAT_PROVIDER = 'ark-openai-compatible';
    process.env.PET_CHAT_BASE_URL = 'https://model.example.test/v1/';
    process.env.PET_CHAT_MODEL = 'postcard-test-model';
    process.env.PET_CHAT_API_KEY = 'test-only-key';
    fetchSpy = jest.spyOn(global, 'fetch');
    provider = new ArkPostcardMessageProvider();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (previousEnvironment.provider === undefined) delete process.env.PET_CHAT_PROVIDER;
    else process.env.PET_CHAT_PROVIDER = previousEnvironment.provider;
    if (previousEnvironment.baseUrl === undefined) delete process.env.PET_CHAT_BASE_URL;
    else process.env.PET_CHAT_BASE_URL = previousEnvironment.baseUrl;
    if (previousEnvironment.model === undefined) delete process.env.PET_CHAT_MODEL;
    else process.env.PET_CHAT_MODEL = previousEnvironment.model;
    if (previousEnvironment.apiKey === undefined) delete process.env.PET_CHAT_API_KEY;
    else process.env.PET_CHAT_API_KEY = previousEnvironment.apiKey;
  });

  test('sends the selected photo and place as data, then returns a concise phrase', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '“海风轻吻落日”' } }] }),
    } as Response);

    await expect(provider.generate({
      buffer: Buffer.from('photo-bytes'),
      mimeType: 'image/jpeg',
    }, '苏州')).resolves.toBe('海风轻吻落日');

    const [url, request] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://model.example.test/v1/chat/completions');
    const body = JSON.parse(String(request.body));
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('苏州') }),
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from('photo-bytes').toString('base64')}`, detail: 'high' } },
    ]);
  });

  test.each([
    ['too many characters', '一二三四五六七八九十一二三'],
    ['multiple lines', '海风轻吻\n落日'],
  ])('rejects %s instead of returning invalid copy', async (_label, content) => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as Response);

    await expect(provider.generate({ buffer: Buffer.from('photo'), mimeType: 'image/jpeg' }, ''))
      .rejects.toMatchObject({ code: 'invalid_response' });
  });

  test('fails closed when the server model is not configured', async () => {
    delete process.env.PET_CHAT_API_KEY;

    await expect(provider.generate({ buffer: Buffer.from('photo'), mimeType: 'image/jpeg' }, ''))
      .rejects.toBeInstanceOf(PostcardMessageProviderError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
