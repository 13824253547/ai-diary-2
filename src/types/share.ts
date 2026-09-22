import type { DiaryPrivacy, ShareMode } from './diary';

export type PrivacyOption = {
  id: DiaryPrivacy;
  title: string;
  description: string;
};

export type ShareOption = {
  id: ShareMode;
  title: string;
  description: string;
};

