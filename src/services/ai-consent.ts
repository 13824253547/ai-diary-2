import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { appConfig } from '../config/app-config';
import { getAccountUserId } from './account-auth';

export type AIConsentPurpose = 'diary' | 'chat' | 'image' | 'insights' | 'postcard';
export const AI_CONSENT_VERSION = '2026-11-09-account-v5';

export const AI_CONSENT_NOTICES: Record<AIConsentPurpose, { title: string; message: string }> = {
  diary: {
    title: '日记创作授权',
    message: '你选择的照片将用于AI创作游记。保存后，这篇日记正文还会用于记忆整理。是否同意？',
  },
  chat: {
    title: '萌宠聊天授权',
    message: 'AI会处理你发送的文字，并参考近期日记摘要生成回复。是否同意？',
  },
  image: {
    title: 'AI配图授权',
    message: 'AI会根据你的描述生成图片，并保存到素材库。是否同意？',
  },
  insights: {
    title: '全库日记分析授权',
    message: 'AI会分析当前账号已保存的日记正文，用于成长记录和个人洞察。新保存或修改的日记也会用于后续分析。是否同意？',
  },
  postcard: {
    title: '明信片寄语授权',
    message: 'AI会读取你选择的素材照片画面，并参考可用地点，生成不超过12字的明信片寄语。是否同意？',
  },
};

type ConsentRecord = {
  userId: string;
  service: string;
  version: string;
  grants: Partial<Record<AIConsentPurpose, string>>;
};

type ConsentDependencies = {
  getUserId: () => Promise<string>;
  service: string;
  read: (userId: string) => Promise<unknown>;
  write: (userId: string, record: ConsentRecord) => Promise<void>;
  prompt: (purpose: AIConsentPurpose, signal?: AbortSignal) => Promise<boolean>;
  now?: () => string;
  onError?: () => void;
};

function readGrants(value: unknown, userId: string, service: string): ConsentRecord['grants'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Partial<ConsentRecord>;
  const allowedPurposes = record.version === AI_CONSENT_VERSION ? Object.keys(AI_CONSENT_NOTICES) : [];
  if (record.userId !== userId || record.service !== service || !allowedPurposes.length
    || !record.grants || typeof record.grants !== 'object' || Array.isArray(record.grants)) return {};
  return Object.fromEntries(Object.entries(record.grants).filter(([purpose, time]) =>
    allowedPurposes.includes(purpose as AIConsentPurpose)
      && typeof time === 'string' && Number.isFinite(Date.parse(time)),
  ));
}

export function createAIConsentService(deps: ConsentDependencies) {
  // Serialize prompts and writes so rapid taps cannot open duplicate dialogs or lose grants.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    request(purpose: AIConsentPurpose, signal?: AbortSignal): Promise<boolean> {
      const operation = queue.then(async () => {
        if (signal?.aborted) return false;
        const userId = await deps.getUserId();
        const grants = readGrants(await deps.read(userId), userId, deps.service);
        if (signal?.aborted) return false;
        if (!grants[purpose]) {
          if (!(await deps.prompt(purpose, signal)) || signal?.aborted) return false;
          if (await deps.getUserId() !== userId || signal?.aborted) return false;
          grants[purpose] = (deps.now ?? (() => new Date().toISOString()))();
          await deps.write(userId, { userId, service: deps.service, version: AI_CONSENT_VERSION, grants });
        }
        return !signal?.aborted && await deps.getUserId() === userId;
      }).catch(() => {
        deps.onError?.();
        return false;
      });
      queue = operation;
      return operation;
    },
  };
}

function fileUri(userId: string) {
  if (!FileSystem.documentDirectory) throw new Error('Consent storage unavailable.');
  return `${FileSystem.documentDirectory}ai-consent-user-${encodeURIComponent(userId)}.json`;
}

function promptForConsent(purpose: AIConsentPurpose, signal?: AbortSignal) {
  return new Promise<boolean>(resolve => {
    let finished = false;
    const complete = (allowed: boolean) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      resolve(allowed && !signal?.aborted);
    };
    const abort = () => complete(false);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { complete(false); return; }
    const notice = AI_CONSENT_NOTICES[purpose];
    Alert.alert(notice.title, notice.message, [
      { text: '暂不使用', style: 'cancel', onPress: () => complete(false) },
      { text: '同意并继续', onPress: () => complete(true) },
    ], { cancelable: true, onDismiss: () => complete(false) });
  });
}

const service = createAIConsentService({
  getUserId: getAccountUserId,
  service: appConfig.backendBaseUrl,
  read: async userId => {
    const uri = fileUri(userId);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return undefined;
    try { return JSON.parse(await FileSystem.readAsStringAsync(uri)); }
    catch { return undefined; }
  },
  write: async (userId, record) => {
    await FileSystem.writeAsStringAsync(fileUri(userId), JSON.stringify(record));
  },
  prompt: promptForConsent,
  onError: () => Alert.alert('授权状态暂不可用', '未提交本次AI处理。请稍后重试授权。'),
});

export const requestAIConsent = (purpose: AIConsentPurpose, signal?: AbortSignal) => service.request(purpose, signal);
