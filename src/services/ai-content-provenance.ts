import type { DiaryPhoto } from '../types/diary';

// All currently supported diary creation templates use AI, including edited drafts.
export const AI_DIARY_NOTICE = '含AI生成内容，可经用户编辑，请核对';

export function isGeneratedPhoto(photo?: DiaryPhoto) {
  return photo?.source === 'generated' && photo.generationSource !== 'mock';
}
