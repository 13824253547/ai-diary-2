import type { CreateGenerationJobRequestContract, DraftContract, GenerationJobContract, MemoriesQuery, MemoriesQueryResult, RemoteResult, RewriteBlockRequestContract, RewriteBlockResultContract, SaveDiaryRequestContract, SaveDraftResult } from '../contracts/core-diary-contract';
import type { ApiRequestOptions } from '../services/api-client';
import type { DiaryItem } from '../types/diary';

export type IdentityContract = {
  id: string;
  type: 'anonymous-device';
};

export type GenerationPhotoUpload = {
  photoId: string;
  uri: string;
  mimeType: string;
  date?: string;
  cleanupUri?: string;
};

export interface CoreDiaryRepository {
  getIdentity(options?: ApiRequestOptions): Promise<IdentityContract>;
  createDraft(input: DraftContract, options?: ApiRequestOptions): Promise<RemoteResult<DraftContract>>;
  createGenerationJob(input: CreateGenerationJobRequestContract, options?: ApiRequestOptions, photos?: GenerationPhotoUpload[]): Promise<RemoteResult<GenerationJobContract>>;
  rewriteBlock?(input: RewriteBlockRequestContract, options?: ApiRequestOptions, photos?: GenerationPhotoUpload[]): Promise<RemoteResult<RewriteBlockResultContract>>;
  getGenerationJob(jobId: string, options?: ApiRequestOptions): Promise<RemoteResult<GenerationJobContract>>;
  cancelGenerationJob?(jobId: string, options?: ApiRequestOptions): Promise<RemoteResult<GenerationJobContract>>;
  saveDiary(input: SaveDiaryRequestContract, options?: ApiRequestOptions, photos?: GenerationPhotoUpload[]): Promise<RemoteResult<SaveDraftResult & { id?: string }>>;
  updateDiaryVisibility?(input: {
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }, options?: ApiRequestOptions): Promise<RemoteResult<{
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }>>;
  getSaveResult(idempotencyKey: string, options?: ApiRequestOptions): Promise<RemoteResult<SaveDraftResult & { id?: string }>>;
  getDiary?(diaryId: string, options?: ApiRequestOptions): Promise<RemoteResult<DiaryItem>>;
  deleteDiary?(diaryId: string, options?: ApiRequestOptions): Promise<RemoteResult<{ diaryId: string }>>;
  listMemories(query: MemoriesQuery, options?: ApiRequestOptions): Promise<RemoteResult<MemoriesQueryResult>>;
  listAllMemories?(query: MemoriesQuery, options?: ApiRequestOptions): Promise<RemoteResult<MemoriesQueryResult>>;
}
