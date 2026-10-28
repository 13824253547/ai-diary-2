import type { CoreDiaryRepository } from '../../repositories/core-diary-repository';
import type { DiscoveryRepository } from '../../repositories/discovery-repository';
import type { AnchorCorrectionRepository } from '../../repositories/anchor-correction-repository';
import type { AnchorReadRepository } from '../../repositories/anchor-read-model-repository';
import type { PetChatRepository } from '../../repositories/pet-chat-repository';
import type { GrowthInsightRepository } from '../../repositories/growth-insight-repository';
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
  discoveryRepository?: DiscoveryRepository;
  anchorCorrectionRepository?: AnchorCorrectionRepository;
  anchorReadRepository?: AnchorReadRepository;
  petChatRepository?: PetChatRepository;
  growthInsightRepository?: GrowthInsightRepository;
  draftSnapshotStore?: DraftSnapshotStore;
};
