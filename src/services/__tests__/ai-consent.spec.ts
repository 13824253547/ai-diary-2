import { Alert } from 'react-native';
import { AI_CONSENT_NOTICES, AI_CONSENT_VERSION, createAIConsentService, requestAIConsent } from '../ai-consent';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async () => undefined),
}));
jest.mock('../device-identity', () => ({ ensureDeviceIdentity: jest.fn(async () => 'device-1') }));

function fixture() {
  let deviceId = 'device-1';
  const records = new Map<string, unknown>();
  const read = jest.fn(async (id: string) => records.get(id));
  const write = jest.fn(async (id: string, record: unknown) => { records.set(id, record); });
  const prompt = jest.fn(async () => true);
  const deps = { getDeviceId: async () => deviceId, service: 'https://api.test', read, write, prompt };
  return { deps, records, prompt, write, setDevice: (id: string) => { deviceId = id; } };
}

describe('AI consent', () => {
  test('keeps each purpose independent and persists the version, service, identity and timestamp', async () => {
    const f = fixture();
    const service = createAIConsentService(f.deps);
    for (const purpose of ['diary', 'chat', 'image', 'insights'] as const) {
      expect(await service.request(purpose)).toBe(true);
    }
    expect(f.prompt).toHaveBeenCalledTimes(4);
    expect(f.records.get('device-1')).toMatchObject({
      deviceId: 'device-1', version: AI_CONSENT_VERSION, service: 'https://api.test',
      grants: { diary: expect.any(String), chat: expect.any(String), image: expect.any(String), insights: expect.any(String) },
    });
    const restarted = createAIConsentService(f.deps);
    expect(await restarted.request('chat')).toBe(true);
    expect(f.prompt).toHaveBeenCalledTimes(4);
  });

  test('does not remember refusal or treat cancellation as permission', async () => {
    const f = fixture();
    f.prompt.mockResolvedValueOnce(false);
    const service = createAIConsentService(f.deps);
    expect(await service.request('diary')).toBe(false);
    expect(f.write).not.toHaveBeenCalled();
    expect(await service.request('diary')).toBe(true);
    const controller = new AbortController();
    controller.abort();
    expect(await service.request('chat', controller.signal)).toBe(false);
    expect(f.prompt).toHaveBeenCalledTimes(2);
  });

  test('serializes simultaneous requests and preserves grants without opening duplicate alerts', async () => {
    const f = fixture();
    const service = createAIConsentService(f.deps);
    expect(await Promise.all([service.request('image'), service.request('image'), service.request('chat')]))
      .toEqual([true, true, true]);
    expect(f.prompt).toHaveBeenCalledTimes(2);
    expect(f.records.get('device-1')).toMatchObject({ grants: { image: expect.any(String), chat: expect.any(String) } });
  });

  test('prompts again for a changed device, endpoint or disclosure version', async () => {
    const f = fixture();
    const service = createAIConsentService(f.deps);
    await service.request('diary');
    f.setDevice('device-2');
    await service.request('diary');
    const otherService = createAIConsentService({ ...f.deps, service: 'https://other.test' });
    await otherService.request('diary');
    f.records.set('device-2', {
      deviceId: 'device-2',
      service: 'https://other.test',
      version: '2026-10-29-v2',
      grants: { diary: '2026-10-29T00:00:00Z' },
    });
    await otherService.request('diary');
    expect(f.prompt).toHaveBeenCalledTimes(4);
  });

  test('keeps prompts short, purpose-specific and free of provider names', () => {
    for (const notice of Object.values(AI_CONSENT_NOTICES)) {
      expect(notice.message.length).toBeLessThan(100);
      expect(notice.message).not.toMatch(/火山|方舟|API/);
      expect(notice.message).not.toMatch(/自研|自主研发/);
    }
    expect(AI_CONSENT_NOTICES.diary.message).toContain('AI创作游记');
    expect(AI_CONSENT_NOTICES.chat.message).toContain('AI会处理');
    expect(AI_CONSENT_NOTICES.image.message).toContain('AI会根据你的描述生成图片');
    expect(AI_CONSENT_NOTICES.insights.message).toContain('AI会分析');
    expect(AI_CONSENT_NOTICES.diary.message).toContain('照片');
    expect(AI_CONSENT_NOTICES.diary.message).toContain('保存后');
    expect(AI_CONSENT_NOTICES.chat.message).toContain('近期日记摘要');
    expect(AI_CONSENT_NOTICES.image.message).toContain('描述');
    expect(AI_CONSENT_NOTICES.insights.message).toContain('日记正文');
  });

  test('does not persist acceptance for a different identity or after leaving the page', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.prompt.mockImplementationOnce(async () => { controller.abort(); return true; });
    const service = createAIConsentService(f.deps);
    expect(await service.request('diary', controller.signal)).toBe(false);
    f.prompt.mockImplementationOnce(async () => { f.setDevice('device-2'); return true; });
    expect(await service.request('chat')).toBe(false);
    expect(f.write).not.toHaveBeenCalled();
  });

  test('fails closed when authorization cannot be read or saved', async () => {
    const f = fixture();
    f.write.mockRejectedValueOnce(new Error('disk failure'));
    const service = createAIConsentService(f.deps);
    expect(await service.request('image')).toBe(false);
    f.deps.read.mockRejectedValueOnce(new Error('read failure'));
    expect(await service.request('image')).toBe(false);
  });

  test('discloses selected photos, saved memory, chat context, prompts and full diary text', () => {
    expect(AI_CONSENT_NOTICES.diary.message).toMatch(/照片.*创作/);
    expect(AI_CONSENT_NOTICES.diary.message).toMatch(/保存后.*记忆整理/);
    expect(AI_CONSENT_NOTICES.chat.message).toContain('近期日记摘要');
    expect(AI_CONSENT_NOTICES.image.message).toContain('描述');
    expect(AI_CONSENT_NOTICES.insights.message).toContain('日记正文');
  });

  test('native alert requires a deliberate choice and does not grant when dismissed', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, _buttons, options) => options?.onDismiss?.());
    expect(await requestAIConsent('chat')).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      AI_CONSENT_NOTICES.chat.title, AI_CONSENT_NOTICES.chat.message,
      [{ text: '暂不使用', style: 'cancel', onPress: expect.any(Function) }, { text: '同意并继续', onPress: expect.any(Function) }],
      { cancelable: true, onDismiss: expect.any(Function) },
    );
    spy.mockRestore();
  });
});
