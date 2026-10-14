import { createAppSelectors, createAppStore, createDefaultAppStoreDeps } from './create-app-store';

export { projectDiaryForShare, projectDiaryForSharing, getHistoryGroups, getDiaryStatistics, buildHistoryGroups, publicParagraphs, canGenerate } from './diary-domain';
export type { DiaryDraft, DiaryPerson } from '../types/diary';
export type { AppStore, AppStoreDeps, AppStoreHook } from './create-app-store';
export { createAppSelectors, createAppStore, createDefaultAppStoreDeps } from './create-app-store';

const appStoreDeps = createDefaultAppStoreDeps();

export const useAppStore = createAppStore(appStoreDeps);

export const appSelectors = createAppSelectors(useAppStore, appStoreDeps);
