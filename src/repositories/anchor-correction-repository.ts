import type { ApiRequestOptions } from '../services/api-client';
import type {
  AnchorCorrectionRecord,
  ChatAnchorCorrectionQuery,
  ChatAnchorCorrectionRecord,
  GetAnchorCorrectionQuery,
  SaveChatAnchorCorrectionInput,
  SaveAnchorCorrectionInput,
} from '../contracts/anchor-correction-contract';

export type AnchorCorrectionRepositoryErrorCode =
  | 'permission_denied'
  | 'device_identity_required'
  | 'timeout'
  | 'cancelled'
  | 'not_found'
  | 'invalid_input'
  | 'version_conflict'
  | 'provider_failed';

export class AnchorCorrectionRepositoryError extends Error {
  constructor(
    readonly code: AnchorCorrectionRepositoryErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AnchorCorrectionRepositoryError';
  }
}

export interface AnchorCorrectionRepository {
  getCorrection(
    query: GetAnchorCorrectionQuery,
    options?: ApiRequestOptions,
  ): Promise<AnchorCorrectionRecord | null>;
  saveCorrection(
    input: SaveAnchorCorrectionInput,
    options?: ApiRequestOptions,
  ): Promise<AnchorCorrectionRecord>;
  getChatCorrection(
    query: ChatAnchorCorrectionQuery,
    options?: ApiRequestOptions,
  ): Promise<ChatAnchorCorrectionRecord | null>;
  saveChatCorrection(
    input: SaveChatAnchorCorrectionInput,
    options?: ApiRequestOptions,
  ): Promise<ChatAnchorCorrectionRecord>;
}
