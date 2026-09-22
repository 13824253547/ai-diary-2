import { create } from 'zustand';
import { companionCandidates } from '../mocks/companions';
import { diaryTypeOptions, generationPhases } from '../mocks/creation';
import { mockCharacters } from '../mocks/characters';
import { mockDiaries, historyGroups } from '../mocks/diaries';
import { mockPhotos } from '../mocks/photos';
import { shareOptions } from '../mocks/share-options';
import type { CreationStep } from '../types/creation';
import type { ChatMessage, DiaryDraft, DiaryItem, DiaryPrivacy, DiaryType, ShareMode } from '../types/diary';
import { buildGeneratedDiary, canGenerate, cloneDiary, getDiaryStatistics, getHistoryGroups, getPeopleForPhotos, MIN_SELECTED_PHOTOS, normalizeDiaryPhotos, publicParagraphs, sanitizePhotoIds } from './diary-domain';
export { projectDiaryForShare, projectDiaryForSharing, getHistoryGroups, getDiaryStatistics, buildHistoryGroups, publicParagraphs, canGenerate } from './diary-domain';
export type { DiaryDraft, DiaryPerson } from '../types/diary';

let nextSequence = 1;
const createId = (prefix: string) => `${prefix}-${Date.now()}-${nextSequence++}`;
const platforms: ShareMode[] = ['wechat', 'moments', 'xiaohongshu', 'weibo', 'x'];
const defaultPhotoIds = () => mockPhotos.slice(0, 12).map(photo => photo.id);
const initialCharacter = mockCharacters[0]?.id ?? 'character-blue';

type AppStore = {
  currentStep: CreationStep; hasPhotoPermission: boolean; selectedType: DiaryType;
  selectedCharacterId: string; selectedPhotoIds: string[]; currentDiaryId: string;
  generationPhaseIndex: number; companionName: string; diaries: DiaryItem[]; issueLog: string[];
  activeDraftId?: string; drafts: Record<string, DiaryDraft>;
  chatMessages: ChatMessage[]; likedDiscoveryIds: string[]; materialPhotoIds: string[];
  correctedAnchors: Record<string, string>; flowerUnlocked: boolean;
  beginCreation: () => string;
  beginEdit: (diaryId: string) => string | undefined;
  updateDraft: (draftId: string, patch: Partial<DiaryItem>) => void;
  setDraftPhotos: (draftId: string, photoIds: string[]) => void;
  setDraftCharacter: (draftId: string, characterId: string, options?: { preserveContent?: boolean }) => void;
  setDraftPersonName: (draftId: string, personId: string, name: string) => void;
  updateDraftBlock: (draftId: string, blockId: string, content: string) => void;
  setDraftBlockPhotos: (draftId: string, blockId: string, photoIds: string[]) => void;
  rewriteDraftBlock: (draftId: string, blockId: string) => void;
  startGeneration: (draftId: string) => number | undefined;
  advanceDraftGeneration: (draftId: string, round: number, progress: number) => void;
  finishGeneration: (draftId: string, round: number) => void;
  pauseGeneration: (draftId: string, round: number) => void;
  saveDraft: (draftId: string) => string | undefined;
  discardDraft: (draftId: string) => void;
  savePrivacy: (diaryId: string, privacy: DiaryPrivacy, publicBlockIds?: string[]) => boolean;
  setDiaryVisibility: (diaryId: string, privacy: DiaryPrivacy, publicBlockIds?: string[]) => boolean;
  recordShareDemo: (diaryId: string, mode: ShareMode) => boolean;
  sendChat: (text: string) => void;
  toggleDiscoveryLike: (id: string) => void;
  addMaterialPhoto: (id: string) => void;
  correctAnchor: (id: string, text: string) => void;
  setFlowerUnlocked: (value: boolean) => void;
  setCurrentStep: (step: CreationStep) => void; grantPhotoPermission: () => void;
  selectType: (type: DiaryType) => void; selectCharacter: (characterId: string) => void;
  togglePhoto: (photoId: string) => void; setCompanionName: (name: string) => void;
  resetCreation: () => void; advanceGeneration: () => void; completeGeneration: () => void;
  setCurrentDiaryId: (diaryId: string) => void; updateDiaryText: (diaryId: string, content: string) => void;
  setDiaryPrivacy: (diaryId: string, privacy: DiaryPrivacy) => void;
  markShared: (diaryId: string, mode: ShareMode) => void; logIssue: (message: string) => void;
};

export const useAppStore = create<AppStore>((set, get) => {
  const mutateDraft = (draftId: string, transform: (draft: DiaryDraft) => DiaryDraft) => {
    const draft = get().drafts[draftId];
    if (!draft || draft.savedDiaryId) return;
    set(state => ({ drafts: { ...state.drafts, [draftId]: transform(draft) } }));
  };
  return {
    currentStep: 'home', hasPhotoPermission: false, selectedType: 'travel',
    selectedCharacterId: initialCharacter, selectedPhotoIds: defaultPhotoIds(), currentDiaryId: 'diary-1',
    generationPhaseIndex: 0, companionName: '', diaries: mockDiaries.map(cloneDiary), issueLog: [], drafts: {},
    chatMessages: [{ id: 'chat-welcome', role: 'assistant', text: '嘿，今天过得怎么样？\n我一直在这里，想听听你的小故事。' }],
    likedDiscoveryIds: [], materialPhotoIds: mockPhotos.slice(0, 6).map(photo => photo.id), correctedAnchors: {}, flowerUnlocked: false,
    beginCreation: () => {
      const id = createId('draft');
      const photoIds = defaultPhotoIds();
      const diary = cloneDiary(mockDiaries[0]);
      const people = getPeopleForPhotos(photoIds, mockPhotos);
      const draft: DiaryDraft = { id, diary: { ...diary, id: '', status: 'draft', photoIds, people, companionName: '', privacy: 'private', shareModes: [], exportModes: [], exportedImage: false, exportedPdf: false, publicBlockIds: undefined, createdInSession: true, blocks: [] }, selectedPhotoIds: photoIds, people, generation: { round: 0, progress: 0, status: 'idle' }, dirty: false };
      set(state => ({ activeDraftId: id, drafts: { ...state.drafts, [id]: draft }, selectedPhotoIds: photoIds, selectedCharacterId: initialCharacter, selectedType: 'travel', companionName: '', generationPhaseIndex: 0, currentStep: state.hasPhotoPermission ? 'album' : 'permission' }));
      return id;
    },
    beginEdit: diaryId => {
      const diary = get().diaries.find(item => item.id === diaryId);
      if (!diary) return undefined;
      const existing = Object.values(get().drafts).find(draft => draft.sourceDiaryId === diaryId && !draft.savedDiaryId);
      if (existing) { set({ activeDraftId: existing.id, currentStep: 'edit' }); return existing.id; }
      const id = createId('draft');
      const people = getPeopleForPhotos(diary.photoIds, mockPhotos, diary.people);
      const draft: DiaryDraft = { id, sourceDiaryId: diaryId, diary: cloneDiary(diary), selectedPhotoIds: [...diary.photoIds], people, generation: { round: 0, progress: 100, status: 'complete' }, dirty: false };
      set(state => ({ activeDraftId: id, currentDiaryId: diaryId, currentStep: 'edit', selectedPhotoIds: [...diary.photoIds], selectedCharacterId: diary.characterId, drafts: { ...state.drafts, [id]: draft } }));
      return id;
    },
    updateDraft: (id, patch) => mutateDraft(id, draft => ({ ...draft, dirty: true, diary: cloneDiary({ ...draft.diary, ...patch, id: draft.diary.id }) })),
    setDraftPhotos: (id, incoming) => {
      const photoIds = sanitizePhotoIds(incoming, mockPhotos);
      mutateDraft(id, draft => {
        if (photoIds.join('|') === draft.selectedPhotoIds.join('|')) return draft;
        const people = getPeopleForPhotos(photoIds, mockPhotos, draft.people);
        const diary = normalizeDiaryPhotos({ ...draft.diary, photoIds, people }, photoIds);
        return { ...draft, selectedPhotoIds: photoIds, people, diary: { ...diary, status: draft.sourceDiaryId ? diary.status : 'draft' }, dirty: true, generation: draft.sourceDiaryId ? draft.generation : { round: draft.generation.round + 1, progress: 0, status: 'idle' } };
      });
      if (get().activeDraftId === id) set({ selectedPhotoIds: photoIds });
    },
    setDraftCharacter: (id, characterId, options) => {
      if (!mockCharacters.some(character => character.id === characterId)) return;
      mutateDraft(id, draft => {
        if (draft.diary.characterId === characterId) return draft;
        const invalidate = !draft.sourceDiaryId && !options?.preserveContent && draft.generation.status !== 'idle';
        return { ...draft, dirty: true, diary: { ...draft.diary, characterId, status: invalidate ? 'draft' : draft.diary.status }, generation: invalidate ? { round: draft.generation.round + 1, progress: 0, status: 'idle' } : draft.generation };
      });
      if (get().activeDraftId === id) set({ selectedCharacterId: characterId });
    },
    setDraftPersonName: (id, personId, name) => mutateDraft(id, draft => {
      const old = draft.people.find(person => person.id === personId);
      if (!old) return draft;
      const people = draft.people.map(person => person.id === personId ? { ...person, name, aliases: [...new Set([...(person.aliases ?? []), person.name.trim(), name.trim()].filter(Boolean))] } : person);
      const nextName = name.trim() || '同行人';
      // Names are metadata. Do not rewrite prose while the input is still being
      // typed: replacing a one-character name can corrupt ordinary words such as
      // "小巷". Generated prose picks up the final name on the next generation;
      // existing user-edited prose remains exactly as authored.
      return { ...draft, people, dirty: true, diary: { ...draft.diary, people, companionName: personId === 'person-self' ? draft.diary.companionName : nextName } };
    }),
    updateDraftBlock: (id, blockId, content) => mutateDraft(id, draft => {
      const blocks = draft.diary.blocks.map(block => block.id !== blockId ? block : block.type === 'photo' ? { ...block, caption: content } : { ...block, content });
      const first = blocks.find(block => block.type === 'text');
      return { ...draft, dirty: true, diary: { ...draft.diary, blocks, summary: first && 'content' in first ? first.content.slice(0, 88) : draft.diary.summary } };
    }),
    setDraftBlockPhotos: (id, blockId, incoming) => mutateDraft(id, draft => {
      if (!draft.diary.blocks.some(block => block.id === blockId && block.type !== 'photo')) return draft;
      const photoIds = sanitizePhotoIds(incoming, mockPhotos);
      const all = [...new Set([...draft.selectedPhotoIds, ...photoIds])];
      const people = getPeopleForPhotos(all, mockPhotos, draft.people);
      // Replacing a paragraph's references replaces its associated photo block too.
      const target = draft.diary.blocks.find(block => block.id === blockId);
      const previousRefs = new Set(target && 'photoIds' in target ? target.photoIds ?? [] : []);
      const blocks = draft.diary.blocks.flatMap(block => {
        if (block.id === blockId && block.type !== 'photo') return [{ ...block, photoIds }];
        if (block.type === 'photo' && block.relatedBlockId === blockId) return photoIds[0] ? [{ ...block, photoId: photoIds[0] }] : [];
        if (block.type === 'photo' && !block.relatedBlockId && previousRefs.has(block.photoId) && !photoIds.includes(block.photoId)) return [];
        return [block];
      });
      return { ...draft, dirty: true, selectedPhotoIds: all, people, diary: normalizeDiaryPhotos({ ...draft.diary, people, photoIds: all, blocks }) };
    }),
    rewriteDraftBlock: (id, blockId) => {
      const draft = get().drafts[id];
      const block = draft?.diary.blocks.find(item => item.id === blockId);
      if (!draft || !block || block.type === 'photo') return;
      const text = draft.diary.characterId === 'character-green' ? '把这一刻寄给未来的自己：风很轻，日子很慢，身边的一切都刚刚好。' : draft.diary.characterId === 'character-brown' ? '一束光。一阵风。一个值得停下来的瞬间。把平凡的美好，留在这一页。' : '阳光落在肩头，像一封温柔的来信。我们把脚步放慢，让这一刻的美好，在心里多住一会儿。';
      get().updateDraftBlock(id, blockId, text);
    },
    startGeneration: id => {
      const draft = get().drafts[id];
      if (!draft || draft.savedDiaryId || !canGenerate(draft.selectedPhotoIds)) return undefined;
      if (draft.generation.status === 'running') return draft.generation.round;
      const round = draft.generation.round + 1;
      mutateDraft(id, current => ({ ...current, diary: { ...current.diary, status: 'generating' }, generation: { round, progress: 0, status: 'running' } }));
      set({ currentStep: 'generating', generationPhaseIndex: 0 });
      return round;
    },
    advanceDraftGeneration: (id, round, progress) => mutateDraft(id, draft => draft.generation.round !== round || draft.generation.status !== 'running' ? draft : { ...draft, generation: { ...draft.generation, progress: Math.max(draft.generation.progress, Math.min(99, progress)) } }),
    finishGeneration: (id, round) => mutateDraft(id, draft => draft.generation.round !== round || draft.generation.status !== 'running' ? draft : { ...draft, diary: buildGeneratedDiary(draft), generation: { round, progress: 100, status: 'complete' }, dirty: true }),
    pauseGeneration: (id, round) => mutateDraft(id, draft => draft.generation.round !== round || draft.generation.status !== 'running' ? draft : { ...draft, diary: { ...draft.diary, status: 'draft' }, generation: { round: round + 1, progress: 0, status: 'idle' } }),
    saveDraft: id => {
      const draft = get().drafts[id];
      if (!draft) return undefined;
      if (draft.savedDiaryId) return draft.savedDiaryId;
      if (!draft.sourceDiaryId && (draft.generation.status !== 'complete' || !canGenerate(draft.selectedPhotoIds))) return undefined;
      if (draft.sourceDiaryId && !get().diaries.some(diary => diary.id === draft.sourceDiaryId)) return undefined;
      const diaryId = draft.sourceDiaryId ?? createId('diary');
      const people = draft.people.map(person => ({ ...person, name: person.name.trim() || (person.id === 'person-self' ? '我' : '同行人') }));
      const diary = cloneDiary(normalizeDiaryPhotos({ ...draft.diary, id: diaryId, status: 'ready', people }, sanitizePhotoIds(draft.selectedPhotoIds, mockPhotos)));
      set(state => ({ diaries: draft.sourceDiaryId ? state.diaries.map(item => item.id === diaryId ? diary : item) : [diary, ...state.diaries], currentDiaryId: diaryId, currentStep: 'detail', activeDraftId: state.activeDraftId === id ? undefined : state.activeDraftId, drafts: { ...state.drafts, [id]: { ...draft, diary, dirty: false, savedDiaryId: diaryId } } }));
      return diaryId;
    },
    discardDraft: id => set(state => {
      const { [id]: discarded, ...drafts } = state.drafts;
      return { drafts, activeDraftId: state.activeDraftId === id ? undefined : state.activeDraftId };
    }),
    savePrivacy: (diaryId, privacy, publicBlockIds) => {
      const diary = get().diaries.find(item => item.id === diaryId);
      if (!diary) return false;
      const allowed = new Set(publicParagraphs(diary).map(block => block.id));
      const ids = publicBlockIds === undefined ? undefined : [...new Set(publicBlockIds)].filter(id => allowed.has(id));
      if (privacy !== 'private' && ids !== undefined && ids.length === 0) return false;
      set(state => ({ diaries: state.diaries.map(item => item.id === diaryId ? { ...item, privacy, publicBlockIds: privacy === 'private' ? undefined : ids } : item) }));
      return true;
    },
    setDiaryVisibility: (id, privacy, ids) => get().savePrivacy(id, privacy, ids),
    recordShareDemo: (diaryId, mode) => {
      const diary = get().diaries.find(item => item.id === diaryId);
      if (!diary || (platforms.includes(mode) && diary.privacy === 'private')) return false;
      set(state => ({ diaries: state.diaries.map(item => item.id !== diaryId ? item : platforms.includes(mode) ? { ...item, shareModes: [...new Set([...item.shareModes, mode])] } : { ...item, exportModes: [...new Set([...(item.exportModes ?? []), mode])], exportedPdf: item.exportedPdf || mode === 'pdf', exportedImage: item.exportedImage || ['save', 'image', 'poster'].includes(mode) }) }));
      return true;
    },
    sendChat: text => {
      const message = text.trim(); if (!message) return;
      const reply = /累|难过|伤心|烦|压力/.test(message) ? '辛苦啦。先停下来，深呼吸一下吧。我会陪着你，慢慢说就好。🍊' : /旅行|台南|照片|日记/.test(message) ? '听起来是一段值得收藏的回忆！把照片和小故事放进日记，下次翻开时，快乐还会再来一次。🍊' : /谢谢|开心|快乐|喜欢/.test(message) ? '听到你这样说，我也好开心。把这份小小的幸福记下来吧！🍊' : '嗯嗯，我在认真听。今天还有哪个瞬间，让你想多停留一会儿呢？🍊';
      set(state => ({ chatMessages: [...state.chatMessages, { id: createId('chat'), role: 'user', text: message }, { id: createId('chat'), role: 'assistant', text: reply }] }));
    },
    toggleDiscoveryLike: id => set(state => ({ likedDiscoveryIds: state.likedDiscoveryIds.includes(id) ? state.likedDiscoveryIds.filter(item => item !== id) : [...state.likedDiscoveryIds, id] })),
    addMaterialPhoto: id => { if (mockPhotos.some(photo => photo.id === id)) set(state => ({ materialPhotoIds: [...new Set([...state.materialPhotoIds, id])] })); },
    correctAnchor: (id, text) => { if (text.trim()) set(state => ({ correctedAnchors: { ...state.correctedAnchors, [id]: text.trim() } })); },
    setFlowerUnlocked: flowerUnlocked => set({ flowerUnlocked }),
    setCurrentStep: currentStep => set({ currentStep }),
    grantPhotoPermission: () => set({ hasPhotoPermission: true, currentStep: 'album' }),
    selectType: selectedType => { if (selectedType !== 'travel') return; set({ selectedType, currentStep: 'template' }); const id = get().activeDraftId; if (id) get().updateDraft(id, { type: selectedType }); },
    selectCharacter: selectedCharacterId => { set({ selectedCharacterId, currentStep: 'character' }); const id = get().activeDraftId; if (id) get().setDraftCharacter(id, selectedCharacterId); },
    togglePhoto: photoId => { const ids = get().selectedPhotoIds; const next = ids.includes(photoId) ? ids.filter(id => id !== photoId) : [...ids, photoId]; const draftId = get().activeDraftId; if (draftId) get().setDraftPhotos(draftId, next); else set({ selectedPhotoIds: sanitizePhotoIds(next, mockPhotos) }); },
    setCompanionName: companionName => { set({ companionName }); const id = get().activeDraftId; if (id) { const person = get().drafts[id]?.people.find(item => item.id !== 'person-self'); if (person) get().setDraftPersonName(id, person.id, companionName); } },
    resetCreation: () => { get().beginCreation(); },
    advanceGeneration: () => set(state => ({ generationPhaseIndex: Math.min(state.generationPhaseIndex + 1, generationPhases.length - 1) })),
    completeGeneration: () => { const id = get().activeDraftId; if (!id) return; const round = get().startGeneration(id); if (round !== undefined) get().finishGeneration(id, round); },
    setCurrentDiaryId: currentDiaryId => { if (get().diaries.some(diary => diary.id === currentDiaryId)) set({ currentDiaryId }); },
    updateDiaryText: (diaryId, content) => { const id = get().beginEdit(diaryId); if (!id) return; const block = get().drafts[id].diary.blocks.find(item => item.type === 'text'); if (block) get().updateDraftBlock(id, block.id, content); get().saveDraft(id); },
    setDiaryPrivacy: (id, privacy) => { get().savePrivacy(id, privacy); },
    markShared: (id, mode) => { get().recordShareDemo(id, mode); },
    logIssue: message => set(state => ({ issueLog: [...state.issueLog, message] })),
  };
});

export const appSelectors = {
  diaryTypes: diaryTypeOptions, characters: mockCharacters, companions: companionCandidates,
  photos: mockPhotos, historyGroups, generationPhases, shareOptions,
  minSelectedPhotos: MIN_SELECTED_PHOTOS, maxSelectedPhotos: mockPhotos.length,
  getDiaryById(diaryId: string) { return useAppStore.getState().diaries.find(diary => diary.id === diaryId); },
  getPhotoById(photoId: string) { return mockPhotos.find(photo => photo.id === photoId); },
  getHistoryGroups, getStats: getDiaryStatistics,
};
