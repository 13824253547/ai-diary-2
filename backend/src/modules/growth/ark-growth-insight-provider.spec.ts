import {
  ArkGrowthInsightProvider,
  GrowthInsightProviderError,
  type GrowthSourceDiary,
} from './ark-growth-insight-provider';

describe('ArkGrowthInsightProvider', () => {
  const originalEnvironment = {
    provider: process.env.PET_CHAT_PROVIDER,
    baseUrl: process.env.PET_CHAT_BASE_URL,
    model: process.env.PET_CHAT_MODEL,
    apiKey: process.env.PET_CHAT_API_KEY,
    timeout: process.env.PET_CHAT_TIMEOUT_MS,
  };
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const diaries: GrowthSourceDiary[] = [{
    id: 'diary-1',
    version: 2,
    title: '海边散步',
    blocks: [{ id: 'block-1', type: 'text', content: '多年未见的朋友陪我走到海边，我觉得很安心。' }],
  }];

  beforeAll(() => {
    global.fetch = fetchMock as typeof fetch;
  });

  beforeEach(() => {
    process.env.PET_CHAT_PROVIDER = 'ark-openai-compatible';
    process.env.PET_CHAT_BASE_URL = 'https://example.test/v1';
    process.env.PET_CHAT_MODEL = 'pet-model';
    process.env.PET_CHAT_API_KEY = 'test-only-key';
    process.env.PET_CHAT_TIMEOUT_MS = '240000';
    fetchMock.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalEnvironment.provider === undefined) delete process.env.PET_CHAT_PROVIDER;
    else process.env.PET_CHAT_PROVIDER = originalEnvironment.provider;
    if (originalEnvironment.baseUrl === undefined) delete process.env.PET_CHAT_BASE_URL;
    else process.env.PET_CHAT_BASE_URL = originalEnvironment.baseUrl;
    if (originalEnvironment.model === undefined) delete process.env.PET_CHAT_MODEL;
    else process.env.PET_CHAT_MODEL = originalEnvironment.model;
    if (originalEnvironment.apiKey === undefined) delete process.env.PET_CHAT_API_KEY;
    else process.env.PET_CHAT_API_KEY = originalEnvironment.apiKey;
    if (originalEnvironment.timeout === undefined) delete process.env.PET_CHAT_TIMEOUT_MS;
    else process.env.PET_CHAT_TIMEOUT_MS = originalEnvironment.timeout;
  });

  function respond(content: unknown) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    } as Response);
  }

  test('uses the chat model configuration with an isolated flower-recognition prompt', async () => {
    respond({
      flowers: [{
        flowerId: 'pathfinder',
        summary: '你愿意和老朋友一起走向新的风景。',
        sourceDiaryIds: ['diary-1'],
      }],
      tripDiaryIds: [],
    });

    const result = await new ArkGrowthInsightProvider().recognizeFlowers(diaries);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const request = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };

    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(request.model).toBe('pet-model');
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].content).toContain('pathfinder');
    expect(request.messages[0].content).not.toContain('陪伴上下文');
    expect(request.messages[1].content).toContain('diary-1');
    expect(request.messages[1].content).toContain('海边');
    expect(result.flowers[0].flowerId).toBe('pathfinder');
  });

  test('rejects flowers with foreign source IDs or overlong summaries', async () => {
    const provider = new ArkGrowthInsightProvider();
    respond({
      flowers: [{
        flowerId: 'healing',
        summary: '有据可查',
        sourceDiaryIds: ['another-device-diary'],
      }],
      tripDiaryIds: [],
    });
    await expect(provider.recognizeFlowers(diaries))
      .rejects.toBeInstanceOf(GrowthInsightProviderError);

    respond({
      flowers: [{
        flowerId: 'healing',
        summary: '字'.repeat(61),
        sourceDiaryIds: ['diary-1'],
      }],
      tripDiaryIds: [],
    });
    await expect(provider.recognizeFlowers(diaries))
      .rejects.toMatchObject({ code: 'invalid_response' });
  });

  test('requires evidence-bound report dimensions and all fixed report sections', async () => {
    const provider = new ArkGrowthInsightProvider();
    respond({
      dimensions: [
        {
          dimensionId: 'inner-contrast',
          observation: '你在探索新事物时，也会珍惜熟悉的陪伴。',
          sourceDiaryIds: ['diary-1'],
        },
        {
          dimensionId: 'cherished-connections',
          observation: '你珍惜朋友的陪伴。',
          sourceDiaryIds: ['diary-1'],
        },
        {
          dimensionId: 'personality-traits',
          observation: '目前材料不足以进一步判断。',
          sourceDiaryIds: [],
        },
      ],
    });
    await expect(provider.summarizeReportChunk(diaries)).resolves.toHaveLength(3);

    respond({
      dimensions: [
        {
          id: 'inner-contrast',
          content: '有时你会同时期待变化与安心。',
          sourceDiaryIds: ['diary-1'],
        },
        {
          id: 'cherished-connections',
          content: '你珍惜长久关系。',
          sourceDiaryIds: ['diary-1'],
        },
        {
          id: 'personality-traits',
          content: '目前材料不足以概括这一面。',
          sourceDiaryIds: [],
        },
      ],
    });
    const report = await provider.synthesizeReport([
      {
        dimensionId: 'inner-contrast',
        observation: '你既期待变化，也珍惜熟悉的陪伴。',
        sourceDiaryIds: ['diary-1'],
      },
    ], ['diary-1']);
    expect(report).toHaveLength(3);
    const request = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)) as {
      messages: Array<{ content: string }>;
    };
    expect(request.messages[1].content).toContain('"id":"inner-contrast"');

    respond({
      dimensions: [
        {
          id: 'inner-contrast',
          content: '有时你会同时期待变化与安心。',
          sourceDiaryIds: ['diary-1'],
        },
        {
          id: 'cherished-connections',
          content: '你珍惜长久关系。',
          sourceDiaryIds: ['not-in-request'],
        },
        {
          id: 'personality-traits',
          content: '你保持好奇。',
          sourceDiaryIds: ['diary-1'],
        },
      ],
    });
    await expect(provider.synthesizeReport([], ['diary-1']))
      .rejects.toMatchObject({ code: 'invalid_response' });
  });

  test('fails closed when the pet-chat provider is not configured', async () => {
    delete process.env.PET_CHAT_API_KEY;
    await expect(new ArkGrowthInsightProvider().recognizeFlowers(diaries))
      .rejects.toMatchObject({ code: 'unconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
