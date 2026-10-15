import type { DiaryItem, DiaryPhoto, ShareMode } from '../types/diary';
import type { PreparedShareAsset, ShareAssetPreparationResult } from './share-asset-preparation';
import { exportShareDeliveryFile } from './share-export-file-service';
import { prepareShareAssetsForDiary } from './share-asset-preparation';

const EXTERNAL_SHARE_MODES = ['moments', 'xiaohongshu', 'x'] as const;
const LOCAL_EXPORT_MODES = ['save', 'pdf'] as const;

type ExternalShareMode = (typeof EXTERNAL_SHARE_MODES)[number];
type LocalExportMode = (typeof LOCAL_EXPORT_MODES)[number];
type SupportedShareDeliveryMode = ExternalShareMode | LocalExportMode;

type DeliveryFailureReason =
  | 'privacy_required'
  | 'prepare_failed'
  | 'unsupported'
  | 'permission_denied'
  | 'cancelled'
  | 'delivery_failed';

export type ShareDeliveryResult =
  | {
      ok: true;
      operationId: string;
      mode: SupportedShareDeliveryMode;
      fileUri?: string;
      assets: PreparedShareAsset[];
    }
  | {
      ok: false;
      operationId?: string;
      mode: SupportedShareDeliveryMode;
      reason: DeliveryFailureReason;
      message: string;
    };

type ShareDeliveryInput = {
  diary: DiaryItem;
  mode: SupportedShareDeliveryMode;
  getPhotoById: (photoId: string) => DiaryPhoto | undefined;
};

type PreparedDeliveryPayload = {
  operationId: string;
  diary: DiaryItem;
  mode: SupportedShareDeliveryMode;
  assets: PreparedShareAsset[];
};

type ExternalShareSuccess = { ok: true };
type ExportSuccess = { ok: true; fileUri: string };
type DeliveryFailure = {
  ok: false;
  reason: Exclude<DeliveryFailureReason, 'privacy_required' | 'prepare_failed'>;
  message: string;
};

type ShareDeliveryDeps = {
  createOperationId?: () => string;
  prepareAssets?: (input: {
    diary: DiaryItem;
    target: SupportedShareDeliveryMode;
    getPhotoById: (photoId: string) => DiaryPhoto | undefined;
  }) => Promise<ShareAssetPreparationResult>;
  deliverToPlatform?: (
    payload: PreparedDeliveryPayload & { mode: ExternalShareMode },
  ) => Promise<ExternalShareSuccess | DeliveryFailure>;
  exportToFile?: (
    payload: PreparedDeliveryPayload & { mode: LocalExportMode },
  ) => Promise<ExportSuccess | DeliveryFailure>;
  onConfirmed?: (payload: {
    diaryId: string;
    version: number;
    mode: SupportedShareDeliveryMode;
    operationId: string;
    fileUri?: string;
  }) => void;
};

function isExternalShareMode(mode: SupportedShareDeliveryMode): mode is ExternalShareMode {
  return (EXTERNAL_SHARE_MODES as readonly string[]).includes(mode);
}

function getOperationScope(diary: DiaryItem, mode: SupportedShareDeliveryMode) {
  return `${diary.id}::${diary.version ?? 0}::${mode}`;
}

export function createShareDeliveryOrchestrator(deps: ShareDeliveryDeps = {}) {
  let sequence = 0;
  const createOperationId = deps.createOperationId ?? (() => `share-op-${++sequence}`);
  const prepareAssets = deps.prepareAssets ?? prepareShareAssetsForDiary;
  const deliverToPlatform = deps.deliverToPlatform ?? (async () => ({
    ok: false,
    reason: 'unsupported',
    message: '当前环境暂不支持该分享渠道。',
  }));
  const exportToFile = deps.exportToFile ?? exportShareDeliveryFile;
  const inflightByScope = new Map<string, Promise<ShareDeliveryResult>>();

  async function execute(input: ShareDeliveryInput): Promise<ShareDeliveryResult> {
    if (isExternalShareMode(input.mode) && input.diary.privacy === 'private') {
      return {
        ok: false,
        mode: input.mode,
        reason: 'privacy_required',
        message: '这篇日记还是私密的，请先调整公开范围。',
      };
    }

    const scope = getOperationScope(input.diary, input.mode);
    const existing = inflightByScope.get(scope);
    if (existing) {
      return existing;
    }

    const task = (async (): Promise<ShareDeliveryResult> => {
      const operationId = createOperationId();
      const prepared = await prepareAssets({
        diary: input.diary,
        target: input.mode,
        getPhotoById: input.getPhotoById,
      });
      if (!prepared.ok) {
        return {
          ok: false,
          operationId,
          mode: input.mode,
          reason: 'prepare_failed',
          message: prepared.message,
        };
      }

      const payload: PreparedDeliveryPayload = {
        operationId,
        diary: input.diary,
        mode: input.mode,
        assets: prepared.assets,
      };

      if (isExternalShareMode(input.mode)) {
        const delivery = await deliverToPlatform({
          ...payload,
          mode: input.mode,
        });
        if (!delivery.ok) {
          return {
            ok: false,
            operationId,
            mode: input.mode,
            reason: delivery.reason,
            message: delivery.message,
          };
        }
        deps.onConfirmed?.({
          diaryId: input.diary.id,
          version: input.diary.version ?? 0,
          mode: input.mode,
          operationId,
        });
        return {
          ok: true,
          operationId,
          mode: input.mode,
          assets: prepared.assets,
        };
      }

      const delivery = await exportToFile({
        ...payload,
        mode: input.mode,
      });
      if (!delivery.ok) {
        return {
          ok: false,
          operationId,
          mode: input.mode,
          reason: delivery.reason,
          message: delivery.message,
        };
      }
      deps.onConfirmed?.({
        diaryId: input.diary.id,
        version: input.diary.version ?? 0,
        mode: input.mode,
        operationId,
        fileUri: delivery.fileUri,
      });
      return {
        ok: true,
        operationId,
        mode: input.mode,
        fileUri: delivery.fileUri,
        assets: prepared.assets,
      };
    })();

    inflightByScope.set(scope, task);
    try {
      return await task;
    } finally {
      if (inflightByScope.get(scope) === task) {
        inflightByScope.delete(scope);
      }
    }
  }

  return {
    execute,
  };
}
