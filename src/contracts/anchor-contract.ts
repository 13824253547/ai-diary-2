import type { ContentBlock } from '../types/diary';

export const ANCHOR_CONTRACT_VERSION = 'anchor-extraction-v1';

export type AnchorSourceBlock = Extract<ContentBlock, { type: 'text' | 'quote' }>;

export type AnchorExtractionSnapshot = {
  diaryId: string;
  diaryVersion: number;
  blocks: AnchorSourceBlock[];
};

export type AnchorExtractionRequest = {
  requestId: string;
  attempt: number;
  snapshot: AnchorExtractionSnapshot;
  signal?: AbortSignal;
};

export type ExtractedAnchor = {
  id: string;
  tagId: string;
  sourceBlockId: string;
  excerpt: string;
};

export type AnchorExtractionResult = {
  requestId: string;
  diaryId: string;
  diaryVersion: number;
  source: 'mock' | 'provider';
  anchors: ExtractedAnchor[];
};

export function isAnchorExtractionSnapshot(value: unknown): value is AnchorExtractionSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.diaryId !== 'string' || !snapshot.diaryId.trim()) return false;
  if (!Number.isSafeInteger(snapshot.diaryVersion) || (snapshot.diaryVersion as number) < 1) return false;
  if (!Array.isArray(snapshot.blocks)) return false;

  const ids = new Set<string>();
  for (const block of snapshot.blocks) {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) return false;
    const candidate = block as Record<string, unknown>;
    if (
      typeof candidate.id !== 'string'
      || !candidate.id.trim()
      || ids.has(candidate.id)
      || (candidate.type !== 'text' && candidate.type !== 'quote')
      || typeof candidate.content !== 'string'
      || !candidate.content.trim()
    ) return false;
    ids.add(candidate.id);
  }
  return true;
}

export function isAnchorExtractionResult(value: unknown): value is AnchorExtractionResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (
    typeof result.requestId !== 'string'
    || !result.requestId.trim()
    || typeof result.diaryId !== 'string'
    || !result.diaryId.trim()
    || !Number.isSafeInteger(result.diaryVersion)
    || (result.diaryVersion as number) < 1
    || (result.source !== 'mock' && result.source !== 'provider')
    || !Array.isArray(result.anchors)
  ) return false;

  const anchorIds = new Set<string>();
  return result.anchors.every(anchor => {
    if (typeof anchor !== 'object' || anchor === null || Array.isArray(anchor)) return false;
    const candidate = anchor as Record<string, unknown>;
    if (
      typeof candidate.id !== 'string'
      || !candidate.id.trim()
      || anchorIds.has(candidate.id)
      || typeof candidate.tagId !== 'string'
      || !candidate.tagId.trim()
      || typeof candidate.sourceBlockId !== 'string'
      || !candidate.sourceBlockId.trim()
      || typeof candidate.excerpt !== 'string'
      || !candidate.excerpt.trim()
    ) return false;
    anchorIds.add(candidate.id);
    return true;
  });
}
