import type { DraftContract, GenerationJobContract, MemoriesQuery, MemoriesQueryResult, RemoteResult, RewriteBlockRequestContract, RewriteBlockResultContract, SaveDraftResult } from '../contracts/core-diary-contract';
import type { DiaryItem } from '../types/diary';

export type IdentityContract = {
  id: string;
  type: 'anonymous-device';
};

export interface CoreDiaryRepository {
  getIdentity(): Promise<IdentityContract>;
  createDraft(input: DraftContract): Promise<RemoteResult<DraftContract>>;
  createGenerationJob(input: {
    draftId: string;
    draftVersion: number;
    idempotencyKey: string;
  }): Promise<RemoteResult<GenerationJobContract>>;
  rewriteBlock?(input: RewriteBlockRequestContract): Promise<RemoteResult<RewriteBlockResultContract>>;
  getGenerationJob(jobId: string): Promise<RemoteResult<GenerationJobContract>>;
  cancelGenerationJob?(jobId: string): Promise<RemoteResult<GenerationJobContract>>;
  saveDiary(input: {
    id?: string;
    draftId: string;
    sourceDiaryId?: string;
    sourceDiaryVersion?: number;
    idempotencyKey: string;
    title: string;
    summary: string;
    location: string;
    date: string;
    privacy: string;
    photoIds: string[];
    publicBlockIds?: string[];
    version: number;
  }): Promise<RemoteResult<SaveDraftResult & { id?: string }>>;
  updateDiaryVisibility?(input: {
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }): Promise<RemoteResult<{
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }>>;
  getSaveResult(idempotencyKey: string): Promise<RemoteResult<SaveDraftResult & { id?: string }>>;
  getDiary?(diaryId: string): Promise<RemoteResult<DiaryItem>>;
  listMemories(query: MemoriesQuery): Promise<RemoteResult<MemoriesQueryResult>>;
}
