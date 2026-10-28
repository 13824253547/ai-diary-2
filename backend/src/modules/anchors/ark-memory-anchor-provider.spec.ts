import { ArkMemoryAnchorProvider, MemoryAnchorProviderError } from './ark-memory-anchor-provider';

describe('ArkMemoryAnchorProvider', () => {
  const originalEnvironment = { ...process.env };
  const provider = new ArkMemoryAnchorProvider();

  beforeEach(() => {
    process.env.PET_CHAT_PROVIDER = 'ark-openai-compatible';
    process.env.PET_CHAT_BASE_URL = 'https://ark.example.test/api/v3/';
    process.env.PET_CHAT_MODEL = 'memory-test-model';
    process.env.PET_CHAT_API_KEY = 'server-test-key';
    process.env.PET_CHAT_TIMEOUT_MS = '240000';
    jest.restoreAllMocks();
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
    jest.restoreAllMocks();
  });

  test('uses a dedicated prompt and only the submitted diary text', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        tagId: 'mountains',
        excerpt: '小橘记得我们沿着海边散步时，你很享受那阵风。',
      }) } }],
    }), { status: 200 }));

    await expect(provider.summarize({
      kind: 'diary',
      blocks: [
        { id: 'block-1', type: 'text', content: '海边的风很舒服。' },
        { id: 'block-2', type: 'quote', content: '我们沿着岸边走了很久。' },
      ],
    })).resolves.toEqual({
      tagId: 'mountains',
      excerpt: '小橘记得我们沿着海边散步时，你很享受那阵风。',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ark.example.test/api/v3/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer server-test-key' }),
        signal: expect.any(AbortSignal),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toContain('只依据本次提供的文本');
    expect(body.messages[0].content).toContain('最多 60 个字符');
    expect(body.messages[1].content).toContain('海边的风很舒服。');
    expect(body.messages[1].content).toContain('我们沿着岸边走了很久。');
    expect(body.messages[1].content).not.toContain('旧聊天');
  });

  test('summarizes only the complete submitted chat turns from the pet perspective', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"tagId":"friends","excerpt":"小橘记得你说起老朋友时，语气里满是珍惜。"}' } }],
    }), { status: 200 }));

    await provider.summarize({
      kind: 'chat',
      messages: [
        { role: 'user', content: '今天碰到了以前的同学。' },
        { role: 'assistant', content: '听起来你们有不少共同回忆。' },
      ],
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].content).toContain('用户：今天碰到了以前的同学。');
    expect(body.messages[1].content).toContain('小橘：听起来你们有不少共同回忆。');
    expect(body.messages[1].content).not.toContain('历史对话');
  });

  test('fails closed when the provider is not configured', async () => {
    delete process.env.PET_CHAT_API_KEY;
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(provider.summarize({
      kind: 'diary',
      blocks: [{ id: 'block-1', type: 'text', content: '今天去散步。' }],
    })).rejects.toMatchObject<Partial<MemoryAnchorProviderError>>({ code: 'unconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    '{"tagId":"other","excerpt":"不支持的主题"}',
    `{"tagId":"friends","excerpt":"${'字'.repeat(61)}"}`,
    'not json',
  ])('rejects malformed or out-of-contract summary output', async content => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200 }));

    await expect(provider.summarize({
      kind: 'chat',
      messages: [{ role: 'user', content: '我喜欢去山里走走。' }],
    })).rejects.toMatchObject<Partial<MemoryAnchorProviderError>>({ code: 'invalid_response' });
  });
});
