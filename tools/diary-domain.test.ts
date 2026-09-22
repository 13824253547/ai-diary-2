const assert = {
  equal(a: unknown, b: unknown) { if (a !== b) throw new Error(`Expected ${String(a)} === ${String(b)}`); },
  notEqual(a: unknown, b: unknown) { if (a === b) throw new Error(`Expected values to differ: ${String(a)}`); },
  ok(value: unknown) { if (!value) throw new Error('Expected a truthy value'); },
  deepEqual(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected deep equality\n${JSON.stringify(a)}\n${JSON.stringify(b)}`); },
  match(value: unknown, pattern: RegExp) { if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Expected ${String(value)} to match ${pattern}`); },
};
import { getHistoryGroups, projectDiaryForSharing, canGenerate, getDiaryStatistics, getPeopleForPhotos, sanitizePhotoIds } from '../src/store/diary-domain';
import { mockDiaries } from '../src/mocks/diaries';
import { mockPhotos } from '../src/mocks/photos';
import { useAppStore, appSelectors } from '../src/store/use-app-store';

let passed = 0;
function test(name: string, run: () => void) {
  useAppStore.setState(useAppStore.getInitialState(), true);
  run(); passed++; console.log(`✓ ${name}`);
}
const get = () => useAppStore.getState();
function generateNew() {
  const draftId = get().beginCreation();
  const round = get().startGeneration(draftId)!;
  get().finishGeneration(draftId, round);
  return draftId;
}

test('photo selection allows 0/2/3/12 and deduplicates invalid IDs', () => {
  assert.equal(canGenerate([]), false);
  assert.equal(canGenerate(['a', 'b']), false);
  assert.equal(canGenerate(['a', 'b', 'c']), true);
  assert.equal(canGenerate(['a', 'a', 'b']), false);
  const id = get().beginCreation();
  assert.equal(get().drafts[id].selectedPhotoIds.length, 12);
  for (const photoId of get().selectedPhotoIds) get().togglePhoto(photoId);
  assert.equal(get().drafts[id].selectedPhotoIds.length, 0);
  assert.equal(get().startGeneration(id), undefined);
  assert.deepEqual(sanitizePhotoIds(['photo-1', 'photo-1', 'missing'], mockPhotos), ['photo-1']);
});

test('authorization survives a new creation and drafts preserve separate IDs', () => {
  get().grantPhotoPermission();
  const first = get().beginCreation(); const second = get().beginCreation();
  assert.notEqual(first, second); assert.equal(get().hasPhotoPermission, true);
  assert.equal(get().currentStep, 'album');
});

test('generation ignores paused and stale round callbacks, and finishes only once', () => {
  const id = get().beginCreation();
  const firstRound = get().startGeneration(id)!;
  assert.equal(get().startGeneration(id), firstRound);
  get().advanceDraftGeneration(id, firstRound, 60);
  assert.equal(get().drafts[id].generation.progress, 60);
  get().pauseGeneration(id, firstRound);
  get().finishGeneration(id, firstRound);
  assert.equal(get().drafts[id].generation.status, 'idle');
  const secondRound = get().startGeneration(id)!;
  get().advanceDraftGeneration(id, firstRound, 99);
  assert.equal(get().drafts[id].generation.progress, 0);
  get().finishGeneration(id, secondRound);
  const blocks = get().drafts[id].diary.blocks;
  get().finishGeneration(id, secondRound);
  assert.equal(get().drafts[id].diary.blocks, blocks);
  get().setDraftPhotos(id, ['photo-1','photo-2','photo-3']);
  assert.equal(get().drafts[id].generation.status, 'idle');
  assert.equal(get().saveDraft(id), undefined);
});

test('first and second creation save unique diaries idempotently without changing seeds', () => {
  const seed = JSON.stringify(get().diaries[0]);
  const count = get().diaries.length;
  const first = generateNew(); const firstId = get().saveDraft(first);
  assert.ok(firstId); assert.equal(get().saveDraft(first), firstId);
  const second = generateNew(); const secondId = get().saveDraft(second);
  assert.ok(secondId); assert.notEqual(secondId, firstId);
  assert.equal(get().diaries.length, count + 2);
  assert.equal(JSON.stringify(get().diaries.find(diary => diary.id === 'diary-1')), seed);
  assert.equal(getDiaryStatistics(get().diaries).diaries, 49);
  assert.ok(getHistoryGroups(get().diaries).some(group => group.diaryIds.includes(secondId!)));
});

test('editing and abandoning the second diary leaves both saved records untouched', () => {
  const first = get().saveDraft(generateNew())!;
  const second = get().saveDraft(generateNew())!;
  const firstBefore = JSON.stringify(appSelectors.getDiaryById(first));
  const secondBefore = JSON.stringify(appSelectors.getDiaryById(second));
  const edit = get().beginEdit(second)!;
  get().updateDraft(edit, { title: '未保存的新标题' });
  const block = get().drafts[edit].diary.blocks.find(item => item.type === 'text')!;
  get().updateDraftBlock(edit, block.id, '未保存的段落');
  get().discardDraft(edit);
  assert.equal(JSON.stringify(appSelectors.getDiaryById(first)), firstBefore);
  assert.equal(JSON.stringify(appSelectors.getDiaryById(second)), secondBefore);
  assert.equal(get().beginEdit('missing'), undefined);
  assert.equal(appSelectors.getDiaryById('missing'), undefined);
});

test('editing preserves diary ID, blocks stay editable, character selection does not overwrite text', () => {
  const id = get().beginEdit('diary-1')!;
  const before = get().drafts[id].diary.blocks;
  get().setDraftCharacter(id, 'character-green');
  assert.deepEqual(get().drafts[id].diary.blocks, before);
  get().updateDraftBlock(id, 'block-1', '我改写的第一段。');
  get().setDraftBlockPhotos(id, 'block-1', ['photo-5','photo-12']);
  const count = get().diaries.length;
  assert.equal(get().saveDraft(id), 'diary-1');
  assert.equal(get().diaries.length, count);
  assert.equal(get().diaries[0].summary, '我改写的第一段。');
  const block = get().diaries[0].blocks[0];
  assert.deepEqual('photoIds' in block && block.photoIds, ['photo-5','photo-12']);
});

test('person groups follow selected photos and empty names normalize on save', () => {
  assert.equal(getPeopleForPhotos(['photo-1','photo-2','photo-3'], mockPhotos).length, 0);
  const id = generateNew();
  assert.equal(get().drafts[id].people.length, 2);
  get().setDraftPersonName(id, 'person-friend', '阿云');
  const namedDraft = get().drafts[id];
  assert.ok(namedDraft);
  assert.equal(namedDraft.diary.people?.find(person => person.id === 'person-friend')?.name, '阿云');
  // Typing a short name must not rewrite unrelated prose (e.g. "小巷").
  assert.match(JSON.stringify(get().drafts[id].diary.blocks), /小巷/);
  assert.equal(JSON.stringify(get().drafts[id].diary.blocks).includes('阿云巷'), false);
  get().setDraftPersonName(id, 'person-friend', '   ');
  const saved = get().saveDraft(id)!;
  assert.equal(appSelectors.getDiaryById(saved)?.people?.find(person => person.id === 'person-friend')?.name, '同行人');
});

test('replacing paragraph references removes linked standalone photo blocks, including an empty selection', () => {
  const id = get().beginEdit('diary-1')!;
  const target = get().drafts[id].diary.blocks.find(block => block.id === 'block-3');
  assert.ok(target && 'photoIds' in target);
  get().setDraftBlockPhotos(id, 'block-3', []);
  const draft = get().drafts[id].diary;
  const paragraph = draft.blocks.find(block => block.id === 'block-3');
  assert.deepEqual(paragraph && 'photoIds' in paragraph ? paragraph.photoIds : undefined, []);
  assert.equal(draft.blocks.some(block => block.type === 'photo' && block.relatedBlockId === 'block-3'), false);
});

test('character presets change generated copy', () => {
  const blue = generateNew();
  const green = get().beginCreation(); get().setDraftCharacter(green, 'character-green');
  get().finishGeneration(green, get().startGeneration(green)!);
  assert.notEqual(get().drafts[blue].diary.summary, get().drafts[green].diary.summary);
});

test('layout replacement can preserve generated content while wizard changes invalidate it', () => {
  const editorDraft = generateNew();
  const before = get().drafts[editorDraft];
  get().setDraftCharacter(editorDraft, 'character-green', { preserveContent: true });
  assert.equal(get().drafts[editorDraft].generation.status, 'complete');
  assert.equal(get().drafts[editorDraft].diary.blocks[0].id, before.diary.blocks[0].id);

  const wizardDraft = generateNew();
  get().setDraftCharacter(wizardDraft, 'character-green');
  assert.equal(get().drafts[wizardDraft].generation.status, 'idle');
  assert.equal(get().drafts[wizardDraft].generation.progress, 0);
});

test('all four privacy settings save atomically; empty public selection is rejected', () => {
  const original = appSelectors.getDiaryById('diary-1')!;
  assert.equal(get().savePrivacy('diary-1', 'anonymous', []), false);
  assert.equal(appSelectors.getDiaryById('diary-1'), original);
  for (const privacy of ['private','anonymous','public-likes','public-comments'] as const) {
    assert.equal(get().savePrivacy('diary-1', privacy, ['block-1']), true);
    assert.equal(appSelectors.getDiaryById('diary-1')?.privacy, privacy);
  }
  assert.equal(get().savePrivacy('missing','private'), false);
});

test('selection projection removes excluded paragraphs, photos, cover and summary', () => {
  const diary = mockDiaries[0];
  const projected = projectDiaryForSharing({ ...diary, privacy: 'public-comments', publicBlockIds: ['block-5'] });
  assert.deepEqual(projected.blocks.map(block => block.id), ['block-5']);
  assert.deepEqual(projected.photoIds, ['photo-3']);
  assert.equal(projected.coverPhotoId, 'photo-3');
  assert.deepEqual(projected.posterPhotoIds, ['photo-3']);
  assert.equal(projected.summary.includes('赤崁楼'), false);
  assert.match(projected.summary, /安平/);
  assert.equal(projected.helperMessage, '');
  const quote = projectDiaryForSharing({ ...diary, privacy: 'public-comments', publicBlockIds: ['block-6'] });
  assert.equal(quote.coverPhotoId, ''); assert.equal(quote.photoIds.length, 0);
  assert.deepEqual(quote.posterPhotoIds, []);
});

test('anonymous projection redacts companion names including captions and retains face metadata', () => {
  const diary = mockDiaries[0];
  const projected = projectDiaryForSharing({ ...diary, title: '和小林的台南日记', privacy: 'anonymous', publicBlockIds: ['block-1'] });
  assert.equal(projected.anonymous, true); assert.equal(projected.people?.length, 0);
  assert.equal(projected.companionName, '同行人');
  assert.equal(JSON.stringify(projected).includes('小林'), false);
  assert.deepEqual(projected.photoIds, ['photo-1','photo-11']);
  assert.ok(mockPhotos.find(photo => photo.id === 'photo-11')?.faceRects?.length);
  const selfNamed = projectDiaryForSharing({ ...diary, privacy: 'anonymous', title: '我叫小美，和云一起旅行', companionName: '云', people: [{ id: 'person-self', name: '小美', avatarPhotoId: 'photo-11', photoIds: ['photo-11'] }] });
  assert.equal(selfNamed.title.includes('小美'), false);
  assert.equal(selfNamed.title.includes('云'), false);
  const punctuationNamed = projectDiaryForSharing({ ...diary, privacy: 'anonymous', title: 'a+b 的台南日记', companionName: 'a+b', publicBlockIds: ['block-1'] });
  assert.equal(punctuationNamed.title.includes('a+b'), false);
});

test('private preview remains whole; platform shares and exports use separate history', () => {
  const diary = mockDiaries[0];
  const projected = projectDiaryForSharing({ ...diary, privacy: 'private', publicBlockIds: ['block-5'] });
  assert.equal(projected.blocks.length, diary.blocks.length);
  assert.equal(get().recordShareDemo('diary-1','wechat'), false);
  assert.equal(get().recordShareDemo('diary-1','x'), false);
  assert.equal(get().recordShareDemo('diary-1','save'), true);
  assert.equal(get().recordShareDemo('diary-1','pdf'), true);
  let saved = appSelectors.getDiaryById('diary-1')!;
  assert.deepEqual(saved.shareModes, []); assert.equal(saved.exportedPdf, true); assert.equal(saved.exportedImage, true);
  get().savePrivacy('diary-1','public-likes');
  assert.equal(get().recordShareDemo('diary-1','wechat'), true);
  saved = appSelectors.getDiaryById('diary-1')!;
  assert.deepEqual(saved.shareModes, ['wechat']); assert.deepEqual(saved.exportModes, ['save','pdf']);
});

test('history derives groups from current records, baseline is central, helper interactions are local', () => {
  assert.equal(getHistoryGroups([]).length, 0);
  assert.deepEqual(getDiaryStatistics(mockDiaries), { diaries: 47, photos: 128, days: 86, companions: 3 });
  const groups = getHistoryGroups(mockDiaries);
  assert.equal(groups.flatMap(group => group.diaryIds).length, mockDiaries.length);
  const messages = get().chatMessages.length; get().sendChat('今天很累'); assert.equal(get().chatMessages.length, messages + 2);
  get().sendChat('  '); assert.equal(get().chatMessages.length, messages + 2);
  get().toggleDiscoveryLike('post-1'); assert.deepEqual(get().likedDiscoveryIds, ['post-1']); get().toggleDiscoveryLike('post-1'); assert.deepEqual(get().likedDiscoveryIds, []);
  get().correctAnchor('anchor-1','更喜欢安静的海边'); assert.equal(get().correctedAnchors['anchor-1'],'更喜欢安静的海边');
  get().setFlowerUnlocked(true); assert.equal(get().flowerUnlocked, true);
});
console.log(`\n${passed} domain/store scenarios passed.`);
