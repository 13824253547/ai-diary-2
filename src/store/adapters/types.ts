import type { CoreDiaryRepository } from '../../repositories/core-diary-repository';
import type { DiaryDraft } from '../../types/diary';

export type PersistedDraftsSnapshot = {
  version: 1;
  activeDraftId?: string;
  drafts: Record<string, DiaryDraft>;
};

export type DraftSnapshotStore = {
  load: () => Promise<unknown>;
  save: (snapshot: PersistedDraftsSnapshot) => Promise<void>;
  clear: () => Promise<void>;
};

export type AppStoreAdapters = {
  diaryRepository?: CoreDiaryRepository;
  memoriesRepository?: CoreDiaryRepository;
  draftSnapshotStore?: DraftSnapshotStore;
};
