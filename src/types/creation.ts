import type { DiaryType } from './diary';

export type CreationStep =
  | 'home'
  | 'permission'
  | 'album'
  | 'template'
  | 'preview'
  | 'character'
  | 'generating'
  | 'naming'
  | 'edit'
  | 'detail';

export type GenerationPhase = {
  id: string;
  label: string;
  detail: string;
};

export type DiaryTypeOption = {
  id: DiaryType;
  title: string;
  subtitle: string;
  description: string;
  available: boolean;
  badge?: string;
  examples?: string[];
};
