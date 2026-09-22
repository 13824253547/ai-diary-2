export type DiaryType = 'travel' | 'work' | 'emotion';
export type CharacterTheme = 'blue' | 'green' | 'brown' | 'red';
export type DiaryStatus = 'draft' | 'generating' | 'ready';
export type DiaryPrivacy = 'private' | 'anonymous' | 'public-likes' | 'public-comments';
export type ShareMode = 'save' | 'image' | 'poster' | 'pdf' | 'wechat' | 'moments' | 'xiaohongshu' | 'weibo' | 'x';
export type ContentBlock =
  | { id: string; type: 'text'; title?: string; content: string; photoIds?: string[] }
  | { id: string; type: 'quote'; content: string; photoIds?: string[]; relatedBlockId?: string }
  | { id: string; type: 'photo'; photoId: string; caption: string; relatedBlockId?: string };
/** Normalized rectangles in the original image coordinate space. */
export type FaceRect = { x: number; y: number; width: number; height: number };
export type DiaryPhoto = {
  id: string; title: string; location: string; emoji: string; color: string; date: string;
  image?: number; selected?: boolean; personIds?: string[]; faceRects?: FaceRect[];
};
export type DiaryCharacter = {
  id: string; name: string; roleLabel: string; description: string; theme: CharacterTheme;
  image: number; avatarImage?: number; posterImage?: number;
};
export type DiaryPerson = { id: string; name: string; photoIds: string[]; avatarPhotoId: string; aliases?: string[] };
export type DiaryItem = {
  id: string; type: DiaryType; status: DiaryStatus; title: string; subtitle: string;
  location: string; date: string; summary: string; helperMessage: string; characterId: string;
  companionName: string; privacy: DiaryPrivacy; photoIds: string[]; coverPhotoId: string;
  blocks: ContentBlock[]; exportedImage: boolean; exportedPdf: boolean; shareModes: ShareMode[];
  /** Undefined shares every block; explicit selection contains only paragraph/quote IDs. */
  publicBlockIds?: string[];
  posterPhotoIds?: string[];
  people?: DiaryPerson[];
  /** Export/save demos are distinct from outward platform sharing. */
  exportModes?: ShareMode[];
  createdInSession?: boolean;
  anonymous?: boolean;
};
export type HistoryGroup = { id: string; label: string; diaryIds: string[] };
export type GenerationState = { round: number; progress: number; status: 'idle' | 'running' | 'complete' };
export type DiaryDraft = {
  id: string; sourceDiaryId?: string; diary: DiaryItem; selectedPhotoIds: string[];
  people: DiaryPerson[]; generation: GenerationState; dirty: boolean; savedDiaryId?: string;
};
export type ChatMessage = { id: string; role: 'assistant' | 'user'; text: string };
