import { CORE_DIARY_CONTRACT_VERSION, type RemoteResult } from '../../contracts/core-diary-contract';
import { mockDiaries } from '../../mocks/diaries';
import { mockPhotos } from '../../mocks/photos';
import { createTestStore } from '../../test-utils/create-test-store';
import { createDeferred } from '../../test-utils/fakes/create-deferred';
import { createAsyncFaultPlan } from '../../test-utils/fakes/create-async-fault-plan';
import type { CoreDiaryRepository } from '../../repositories/core-diary-repository';
import { createAppStore, createDefaultAppStoreDeps } from '../create-app-store';
import type { DraftSnapshotStore } from '../adapters/types';
import type { DiaryPhoto } from '../../types/diary';
import { buildGeneratedDiaryFromResult, canGenerate, cloneDiary, getDiaryStatistics, getHistoryGroups, getPeopleForPhotos, projectDiaryForSharing, sanitizePhotoIds } from '../diary-domain';

describe('domain/store regression', () => {
  function defaultSelectablePhotoIds(count = 3) {
    return mockPhotos.slice(0, count).map(photo => photo.id);
  }

  function buildRemoteGenerationResult(draftId: string, photoIds: string[] = ['photo-1', 'photo-2', 'photo-3']) {
    return {
      title: '远端生成的回忆',
      summary: '这是一条来自远端任务的结构化结果。',
      location: '台南 · 验证场景',
      date: '2026.10.13',
      companionName: photoIds.includes('photo-12') ? '同行人' : '自己',
      coverPhotoId: photoIds[0] ?? 'photo-1',
      posterPhotoIds: photoIds.slice(0, 2),
      blocks: [
        { id: `${draftId}-remote-block-1`, type: 'text' as const, content: '远端已经返回可编辑正文。', photoIds: photoIds.slice(0, 2) },
        { id: `${draftId}-remote-block-2`, type: 'quote' as const, content: '把这一刻重新写下来。', relatedBlockId: `${draftId}-remote-block-1` },
        { id: `${draftId}-remote-photo-1`, type: 'photo' as const, photoId: photoIds[0] ?? 'photo-1', caption: '远端选中的照片', relatedBlockId: `${draftId}-remote-block-1` },
      ],
    };
  }

  function createContext() {
    const { store, selectors } = createTestStore();
    const get = () => store.getState();
    const generateNew = () => {
      const draftId = get().beginCreation();
      get().setDraftPhotos(draftId, defaultSelectablePhotoIds(12));
      const round = get().startGeneration(draftId)!;
      get().finishGeneration(draftId, round);
      return draftId;
    };

    return { store, selectors, get, generateNew };
  }

  function createRepository(overrides: Partial<CoreDiaryRepository> = {}): CoreDiaryRepository {
    return {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: `${input.draftId}-job`,
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      rewriteBlock: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          draftId: input.draftId,
          blockId: input.blockId,
          draftVersion: input.draftVersion,
          blockType: input.blockType,
          content: `${input.content}（已重写）`,
          photoIds: input.photoIds,
        },
      }),
      getGenerationJob: async jobId => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId,
          draftId: 'draft-test',
          draftVersion: 1,
          idempotencyKey: 'draft-test-round-1',
          status: 'running',
          stage: 'drafting',
          progressPercent: 45,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-test',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-test',
        },
      }),
      updateDiaryVisibility: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.diaryId,
          privacy: input.privacy,
          publicBlockIds: input.publicBlockIds,
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
      ...overrides,
    };
  }

  async function flushAsyncWork() {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  function createSnapshotStore(initial?: unknown) {
    let snapshot = initial;
    const store: DraftSnapshotStore = {
      load: async () => snapshot === undefined ? undefined : JSON.parse(JSON.stringify(snapshot)),
      save: async next => {
        snapshot = JSON.parse(JSON.stringify(next));
      },
      clear: async () => {
        snapshot = undefined;
      },
    };
    return {
      store,
      getSnapshot: () => snapshot,
      setSnapshot: (next: unknown) => {
        snapshot = JSON.parse(JSON.stringify(next));
      },
    };
  }

  test('E01 CASE-BAS-004-002 photo selection allows 0/2/3/12 and deduplicates invalid IDs', () => {
    const { get } = createContext();
    expect(canGenerate([])).toBe(false);
    expect(canGenerate(['a', 'b'])).toBe(false);
    expect(canGenerate(['a', 'b', 'c'])).toBe(true);
    expect(canGenerate(['a', 'a', 'b'])).toBe(false);

    const id = get().beginCreation();
    expect(get().drafts[id].selectedPhotoIds.length).toBe(0);
    get().setDraftPhotos(id, mockPhotos.slice(0, 12).map(photo => photo.id));
    expect(get().drafts[id].selectedPhotoIds.length).toBe(12);
    for (const photoId of [...get().selectedPhotoIds]) get().togglePhoto(photoId);
    expect(get().drafts[id].selectedPhotoIds.length).toBe(0);
    expect(get().startGeneration(id)).toBeUndefined();
    expect(sanitizePhotoIds(['photo-1', 'photo-1', 'missing'], mockPhotos)).toEqual(['photo-1']);
  });

  test('registered device photos stay isolated per store and can be added to material membership once', () => {
    const { get, selectors } = createContext();
    const devicePhoto: DiaryPhoto = {
      id: 'device-photo-1',
      title: '设备照片',
      location: '苏州',
      emoji: '🖼',
      color: '#EFE3D5',
      date: '2026.10.15',
      uri: 'file:///device-photo-1.jpg',
      localUri: 'file:///device-photo-1.jpg',
      personIds: ['person-friend'],
      faceRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
      source: 'device',
    };
    const originalMockPhotoIds = mockPhotos.map(photo => photo.id);

    get().registerPhotos([devicePhoto]);

    expect(selectors.getPhotoById(devicePhoto.id)).toEqual(devicePhoto);
    expect(selectors.photos.some(photo => photo.id === devicePhoto.id)).toBe(true);
    expect(mockPhotos.map(photo => photo.id)).toEqual(originalMockPhotoIds);
    devicePhoto.title = '外部对象已修改';
    devicePhoto.faceRects![0].x = 0.9;
    expect(selectors.getPhotoById(devicePhoto.id)?.title).toBe('设备照片');
    expect(selectors.getPhotoById(devicePhoto.id)?.faceRects?.[0].x).toBe(0.1);

    const secondStore = createContext();
    expect(secondStore.selectors.getPhotoById(devicePhoto.id)).toBeUndefined();
    expect(secondStore.get().materialPhotoIds).not.toContain(devicePhoto.id);

    get().addMaterialPhoto(devicePhoto.id);
    get().addMaterialPhoto(devicePhoto.id);
    get().addMaterialPhoto('unregistered-device-photo');
    expect(get().materialPhotoIds.filter(id => id === devicePhoto.id)).toEqual([devicePhoto.id]);
    expect(get().materialPhotoIds).not.toContain('unregistered-device-photo');
  });

  test('E02 CASE-BAS-004-002 authorization survives a new creation and drafts preserve separate IDs', () => {
    const { get } = createContext();
    get().grantPhotoPermission();
    const first = get().beginCreation();
    const second = get().beginCreation();
    expect(first).not.toBe(second);
    expect(get().hasPhotoPermission).toBe(true);
    expect(get().currentStep).toBe('album');
  });

  test('CRE-003 only allows creatable diary types to become the active creation type', () => {
    const { get } = createContext();
    const draftId = get().beginCreation();

    get().updateDraft(draftId, { type: 'emotion' });
    expect(get().drafts[draftId].diary.type).toBe('emotion');

    get().selectType('work');
    expect(get().selectedType).toBe('travel');
    expect(get().drafts[draftId].diary.type).toBe('emotion');

    get().selectType('travel');
    expect(get().selectedType).toBe('travel');
    expect(get().drafts[draftId].diary.type).toBe('travel');
  });

  test('CRE-003 beginEdit keeps historical diary type when reopening a saved entry', () => {
    const { get } = createContext();

    const draftId = get().beginEdit('diary-3');

    expect(draftId).toBeTruthy();
    expect(get().selectedType).toBe('emotion');
    expect(draftId ? get().drafts[draftId].diary.type : undefined).toBe('emotion');
    expect(draftId ? get().drafts[draftId].sourceDiaryId : undefined).toBe('diary-3');
  });

  test('CRE-004 rejects unavailable character ids and keeps the current selection', () => {
    const { get } = createContext();
    const draftId = get().beginCreation();

    expect(get().drafts[draftId].diary.characterId).toBe('character-blue');

    get().setDraftCharacter(draftId, 'character-red');
    expect(get().drafts[draftId].diary.characterId).toBe('character-blue');

    get().setDraftCharacter(draftId, 'character-green');
    expect(get().drafts[draftId].diary.characterId).toBe('character-green');
  });

  test('CRE-004 browse flow keeps the chosen character through permission and template steps', () => {
    const { get } = createContext();
    const draftId = get().beginCreation();

    get().setDraftCharacter(draftId, 'character-green');
    get().grantPhotoPermission();
    get().setDraftPhotos(draftId, ['photo-1', 'photo-2', 'photo-3']);
    get().selectType('travel');

    expect(get().activeDraftId).toBe(draftId);
    expect(get().selectedCharacterId).toBe('character-green');
    expect(get().drafts[draftId].diary.characterId).toBe('character-green');
    expect(get().drafts[draftId].selectedPhotoIds).toEqual(['photo-1', 'photo-2', 'photo-3']);
  });

  test('CRE-004 syncs the latest selected character to remote before starting generation', async () => {
    let lastSyncedCharacterId: string | undefined;
    let generationRequestCount = 0;
    const createDraft: CoreDiaryRepository['createDraft'] = async input => {
      lastSyncedCharacterId = input.characterId;
      return {
        ok: true as const,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: input,
      };
    };
    const createGenerationJob: CoreDiaryRepository['createGenerationJob'] = async input => {
      generationRequestCount += 1;
      return {
        ok: true as const,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: `${input.draftId}-job-1`,
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued' as const,
          stage: 'queued' as const,
          progressPercent: 0,
        },
      };
    };
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft,
      createGenerationJob,
      getGenerationJob: async jobId => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId,
          draftId: 'draft-cre-004',
          draftVersion: 1,
          idempotencyKey: 'draft-cre-004-round-1',
          status: 'running',
          stage: 'drafting',
          progressPercent: 30,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-cre-004',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-cre-004',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const draftId = store.getState().beginCreation();
    store.getState().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    await flushAsyncWork();

    store.getState().setDraftCharacter(draftId, 'character-green');
    await flushAsyncWork();
    expect(lastSyncedCharacterId).toBe('character-green');

    store.getState().startGeneration(draftId);
    await flushAsyncWork();

    expect(generationRequestCount).toBe(1);
    expect(lastSyncedCharacterId).toBe('character-green');
  });

  test('E03 CASE-BAS-004-003 generation ignores paused and stale round callbacks, and finishes only once', () => {
    const { get } = createContext();
    const id = get().beginCreation();
    get().setDraftPhotos(id, defaultSelectablePhotoIds());
    const firstRound = get().startGeneration(id)!;
    expect(get().startGeneration(id)).toBe(firstRound);
    get().advanceDraftGeneration(id, firstRound, 60);
    expect(get().drafts[id].generation.progress).toBe(60);
    get().pauseGeneration(id, firstRound);
    get().finishGeneration(id, firstRound);
    expect(get().drafts[id].generation.status).toBe('idle');

    const secondRound = get().startGeneration(id)!;
    get().advanceDraftGeneration(id, firstRound, 99);
    expect(get().drafts[id].generation.progress).toBe(0);
    get().finishGeneration(id, secondRound);
    const blocks = get().drafts[id].diary.blocks;
    get().finishGeneration(id, secondRound);
    expect(get().drafts[id].diary.blocks).toBe(blocks);
    get().setDraftPhotos(id, ['photo-4', 'photo-5', 'photo-6']);
    expect(get().drafts[id].generation.status).toBe('idle');
    expect(get().saveDraft(id)).toBeUndefined();
  });

  test('duplicate generation starts reuse the same remote job creation request', async () => {
    const deferredJob = createDeferred<Awaited<ReturnType<NonNullable<CoreDiaryRepository['createGenerationJob']>>>>();
    const createGenerationJob = jest.fn(() => deferredJob.promise);
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob,
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-duplicate-start',
          draftId: 'draft-test-duplicate-start',
          draftVersion: 1,
          idempotencyKey: 'draft-test-duplicate-start-round-1',
          status: 'running',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-duplicate-start',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-duplicate-start',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-duplicate-start`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    const firstRound = get().startGeneration(draftId)!;
    const secondRound = get().startGeneration(draftId)!;

    expect(secondRound).toBe(firstRound);
    expect(createGenerationJob).toHaveBeenCalledTimes(1);

    deferredJob.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        jobId: 'job-duplicate-start',
        draftId,
        draftVersion: 1,
        idempotencyKey: `${draftId}-round-${firstRound}`,
        status: 'queued',
        stage: 'queued',
        progressPercent: 0,
      },
    });
    await flushAsyncWork();

    expect(get().drafts[draftId].generation.round).toBe(firstRound);
    expect(get().drafts[draftId].generation.remoteJobId).toBe('job-duplicate-start');
    expect(get().drafts[draftId].generation.status).toBe('running');
  });

  test('unsaved drafts persist locally and restore after store recreation', async () => {
    const snapshotStore = createSnapshotStore();
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-persist-1`,
      adapters: {
        draftSnapshotStore: snapshotStore.store,
      },
    });

    let store = createAppStore(deps);
    const draftId = store.getState().beginCreation();
    store.getState().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = store.getState().startGeneration(draftId)!;
    store.getState().finishGeneration(draftId, round);
    const firstBlock = store.getState().drafts[draftId].diary.blocks.find(block => block.type === 'text');
    expect(firstBlock?.type).toBe('text');
    if (firstBlock?.type === 'text') {
      store.getState().updateDraftBlock(draftId, firstBlock.id, '重启后也要保留这一段。');
    }

    await flushAsyncWork();
    expect(snapshotStore.getSnapshot()).toBeTruthy();

    store = createAppStore(deps);
    await store.getState().hydrateDrafts();

    expect(store.getState().hydratedDrafts).toBe(true);
    expect(store.getState().activeDraftId).toBe(draftId);
    expect(store.getState().drafts[draftId]?.diary.blocks.some(block => block.type === 'text' && block.content === '重启后也要保留这一段。')).toBe(true);
    expect(store.getState().selectedCharacterId).toBe(store.getState().drafts[draftId]?.diary.characterId);
    expect(store.getState().selectedPhotoIds).toEqual(store.getState().drafts[draftId]?.selectedPhotoIds);

    expect(store.getState().saveDraft(draftId)).toBeTruthy();
    await flushAsyncWork();
    expect(snapshotStore.getSnapshot()).toBeUndefined();
  });

  test('invalid local draft snapshots isolate broken records and keep valid drafts recoverable', async () => {
    const snapshotStore = createSnapshotStore();
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-persist-2`,
      adapters: {
        draftSnapshotStore: snapshotStore.store,
      },
    });

    const seedStore = createAppStore(deps);
    const validDraftId = seedStore.getState().beginCreation();
    seedStore.getState().setDraftPhotos(validDraftId, defaultSelectablePhotoIds());
    const round = seedStore.getState().startGeneration(validDraftId)!;
    seedStore.getState().finishGeneration(validDraftId, round);
    await flushAsyncWork();

    const rawSnapshot = snapshotStore.getSnapshot() as { version: 1; activeDraftId?: string; drafts: Record<string, unknown> };
    snapshotStore.setSnapshot({
      ...rawSnapshot,
      activeDraftId: validDraftId,
      drafts: {
        ...rawSnapshot.drafts,
        broken: {
          id: 'broken',
          diary: { id: 'broken-diary' },
          generation: {},
        },
      },
    });

    const restoredStore = createAppStore(deps);
    await restoredStore.getState().hydrateDrafts();

    expect(restoredStore.getState().drafts[validDraftId]).toBeTruthy();
    expect(restoredStore.getState().drafts.broken).toBeUndefined();
    expect(restoredStore.getState().issueLog.some(message => message.includes('损坏记录'))).toBe(true);
  });

  test('remote generation polling stores job snapshots and completes only after backend success', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-1',
            draftId: 'draft-test-1',
            draftVersion: 1,
            idempotencyKey: 'draft-test-1-round-1',
            status: 'running',
            stage: 'drafting',
            progressPercent: 48,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-1',
            draftId: 'draft-test-1',
            draftVersion: 1,
            idempotencyKey: 'draft-test-1-round-1',
            status: 'succeeded',
            stage: 'completed',
            progressPercent: 100,
            result: buildRemoteGenerationResult('draft-test-1'),
          },
        }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-remote-1',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-remote-1',
        },
      }),
      getSaveResult: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: 'diary-remote-1',
          draftId: 'draft-test-1',
          savedVersion: 1,
          id: 'diary-remote-1',
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-1`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().drafts[draftId].generation.remoteJobId).toBe('job-1');
    expect(get().drafts[draftId].generation.remoteStage).toBe('queued');

    await get().refreshDraftGeneration(draftId, round);
    expect(get().drafts[draftId].generation.status).toBe('running');
    expect(get().drafts[draftId].generation.progress).toBe(48);
    expect(get().drafts[draftId].generation.remoteStage).toBe('drafting');

    await get().refreshDraftGeneration(draftId, round);
    expect(get().drafts[draftId].generation.status).toBe('complete');
    expect(get().drafts[draftId].generation.progress).toBe(100);
    expect(get().drafts[draftId].diary.blocks.length).toBeGreaterThan(0);
    expect(get().drafts[draftId].diary.title).toBe('远端生成的回忆');
  });

  test('remote generation can advance with stage-only snapshots when backend omits progress percent', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-stage-only',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
        },
      }),
      getGenerationJob: jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-stage-only',
            draftId: 'draft-test-stage-only',
            draftVersion: 1,
            idempotencyKey: 'draft-test-stage-only-round-1',
            status: 'running',
            stage: 'analyzing-photos',
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-stage-only',
            draftId: 'draft-test-stage-only',
            draftVersion: 1,
            idempotencyKey: 'draft-test-stage-only-round-1',
            status: 'running',
            stage: 'structuring',
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-stage-only',
            draftId: 'draft-test-stage-only',
            draftVersion: 1,
            idempotencyKey: 'draft-test-stage-only-round-1',
            status: 'succeeded',
            stage: 'completed',
            result: buildRemoteGenerationResult('draft-test-stage-only'),
          },
        }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-stage-only',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-stage-only',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-stage-only`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(get().drafts[draftId].generation.remoteStage).toBe('queued');
    expect(get().drafts[draftId].generation.progress).toBe(5);

    await get().refreshDraftGeneration(draftId, round);
    expect(get().drafts[draftId].generation.status).toBe('running');
    expect(get().drafts[draftId].generation.remoteStage).toBe('analyzing-photos');
    expect(get().drafts[draftId].generation.progress).toBe(18);

    await get().refreshDraftGeneration(draftId, round);
    expect(get().drafts[draftId].generation.status).toBe('running');
    expect(get().drafts[draftId].generation.remoteStage).toBe('structuring');
    expect(get().drafts[draftId].generation.progress).toBe(82);

    await get().refreshDraftGeneration(draftId, round);
    expect(get().drafts[draftId].generation.status).toBe('complete');
    expect(get().drafts[draftId].generation.remoteStage).toBe('completed');
    expect(get().drafts[draftId].generation.progress).toBe(100);
    expect(get().drafts[draftId].diary.blocks.length).toBeGreaterThan(0);
  });

  test('remote generation fails when backend result references photos outside the selected set', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-invalid-result',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-invalid-result',
          draftId: 'draft-test-invalid-result',
          draftVersion: 1,
          idempotencyKey: 'draft-test-invalid-result-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: {
            ...buildRemoteGenerationResult('draft-test-invalid-result', ['photo-1', 'photo-2', 'photo-3']),
            coverPhotoId: 'photo-999',
            blocks: [
              { id: 'invalid-text', type: 'text', content: '无效照片引用', photoIds: ['photo-1', 'photo-999'] },
            ],
          },
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-invalid-result',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-invalid-result',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-invalid-result`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, round);

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('生成结果结构无效，请重新生成。');
    expect(get().drafts[draftId].diary.status).toBe('draft');
  });

  test('remote generation ignores regressing stage snapshots within the same running round', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-stage-order',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-stage-order',
            draftId: 'draft-stage-order',
            draftVersion: 1,
            idempotencyKey: 'draft-stage-order-round-1',
            status: 'running',
            stage: 'structuring',
            progressPercent: 82,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-stage-order',
            draftId: 'draft-stage-order',
            draftVersion: 1,
            idempotencyKey: 'draft-stage-order-round-1',
            status: 'running',
            stage: 'drafting',
            progressPercent: 48,
          },
        }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-stage-order',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-stage-order',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-stage-order`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, round);
    expect(get().drafts[draftId].generation.remoteStage).toBe('structuring');
    expect(get().drafts[draftId].generation.progress).toBe(82);

    await get().refreshDraftGeneration(draftId, round);
    expect(get().drafts[draftId].generation.remoteStage).toBe('structuring');
    expect(get().drafts[draftId].generation.progress).toBe(82);
    expect(get().drafts[draftId].generation.status).toBe('running');
  });

  test('pauseGeneration cancels the remote generation job and resets local round', async () => {
    const cancelGenerationJob = jest.fn().mockResolvedValue({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        jobId: 'job-pause',
        draftId: 'draft-test-pause',
        draftVersion: 1,
        idempotencyKey: 'draft-test-pause-round-1',
        status: 'cancelled',
        stage: 'cancelled',
        progressPercent: 18,
      },
    });
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-pause',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'running',
          stage: 'analyzing-photos',
          progressPercent: 18,
        },
      }),
      cancelGenerationJob,
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-pause',
          draftId: 'draft-test-pause',
          draftVersion: 1,
          idempotencyKey: 'draft-test-pause-round-1',
          status: 'running',
          stage: 'analyzing-photos',
          progressPercent: 18,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-pause',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-pause',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-pause`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    get().pauseGeneration(draftId, round);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cancelGenerationJob).toHaveBeenCalledWith('job-pause');
    expect(get().drafts[draftId].generation.status).toBe('idle');
    expect(get().drafts[draftId].generation.round).toBe(round + 1);
  });

  test('stale generation job creation is cancelled when the active round is paused before job id returns', async () => {
    const deferredJob = createDeferred<Awaited<ReturnType<NonNullable<CoreDiaryRepository['createGenerationJob']>>>>();
    const cancelGenerationJob = jest.fn().mockResolvedValue({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        jobId: 'job-pause-late',
        draftId: 'draft-test-pause-late',
        draftVersion: 1,
        idempotencyKey: 'draft-test-pause-late-round-1',
        status: 'cancelled',
        stage: 'cancelled',
        progressPercent: 0,
      },
    });
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: () => deferredJob.promise,
      cancelGenerationJob,
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-pause-late',
          draftId: 'draft-test-pause-late',
          draftVersion: 1,
          idempotencyKey: 'draft-test-pause-late-round-1',
          status: 'running',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-pause-late',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-pause-late',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-pause-late`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    get().pauseGeneration(draftId, round);
    deferredJob.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        jobId: 'job-pause-late',
        draftId,
        draftVersion: 1,
        idempotencyKey: `${draftId}-round-1`,
        status: 'queued',
        stage: 'queued',
        progressPercent: 0,
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cancelGenerationJob).toHaveBeenCalledWith('job-pause-late');
    expect(get().drafts[draftId].generation.status).toBe('idle');
    expect(get().drafts[draftId].generation.remoteJobId).toBeUndefined();
    expect(get().drafts[draftId].generation.round).toBe(round + 1);
  });

  test('generation timeout becomes visible failed state and still blocks saving', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-timeout',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'timeout',
          message: 'generation timed out',
          retryable: true,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-timeout',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-timeout',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-timeout`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, round);

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('生成超时，请稍后重试。');
    expect(get().saveDraft(draftId)).toBeUndefined();
  });

  test('failed generation snapshot keeps backend error message and retry metadata semantics', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-provider-failed',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
          attemptCount: 0,
          maxAttempts: 2,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-provider-failed',
          draftId: 'draft-test-provider-failed',
          draftVersion: 1,
          idempotencyKey: 'draft-test-provider-failed-round-1',
          status: 'failed',
          stage: 'failed',
          progressPercent: 0,
          attemptCount: 2,
          maxAttempts: 2,
          errorCode: 'provider_failed' as const,
          errorMessage: 'AI provider request failed with status 400',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-provider-failed',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-provider-failed',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-provider-failed`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, round);

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('AI provider request failed with status 400');
    expect(get().saveDraft(draftId)).toBeUndefined();
  });

  test('generation job creation failure becomes visible failed state instead of spinning forever', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'generation job response is invalid',
          retryable: false,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'job not found',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-create-failed',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-create-failed',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-create-failed`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    get().startGeneration(draftId);
    get().startGeneration(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('生成结果异常，请稍后重试。');
    expect(get().issueLog.at(-1)).toBe('生成任务创建失败：generation job response is invalid');
  });

  test('missing remote draft makes generation start fail with visible recovery message', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'draft not found',
          retryable: false,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'generation job not found',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-create-missing-draft',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-create-missing-draft',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-create-missing-draft`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    get().startGeneration(draftId);
    get().startGeneration(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('当前草稿尚未同步完成，请稍后重试。');
    expect(get().issueLog.at(-1)).toBe('生成任务创建失败：draft not found');
  });

  test('generation start permission loss becomes a visible failed state with the precise startup device warning', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'permission_denied',
          message: 'draft access denied',
          retryable: false,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'generation job not found',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-create-permission-denied',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-create-permission-denied',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-create-permission-denied`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    get().startGeneration(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('当前设备无法发起该生成任务，请返回后重试。');
    expect(get().issueLog.at(-1)).toBe('生成任务创建失败：draft access denied');
  });

  test('generation start timeout becomes a visible failed state with the precise startup timeout warning', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'timeout',
          message: 'AI provider request timed out after 1000ms',
          retryable: true,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'generation job not found',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-create-timeout',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-create-timeout',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-create-timeout`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    get().startGeneration(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('生成超时，请稍后重试。');
    expect(get().issueLog.at(-1)).toBe('生成任务创建失败：AI provider request timed out after 1000ms');
  });

  test('generation start network exception becomes a visible failed state with the precise startup network warning', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => {
        throw new Error('socket hang up');
      },
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'generation job not found',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-create-network-error',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-create-network-error',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-create-network-error`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    get().startGeneration(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('生成启动失败，请检查网络后重试。');
    expect(get().issueLog.at(-1)).toBe('生成任务创建失败：socket hang up');
  });

  test('generation cancellation keeps old result from being marked successful', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-cancelled',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'cancelled',
          message: 'generation cancelled',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-cancelled',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-cancelled',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-cancelled`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, round);

    expect(get().drafts[draftId].generation.status).toBe('cancelled');
    expect(get().drafts[draftId].generation.errorMessage).toBe('本次生成已取消。');
    expect(get().drafts[draftId].generation.progress).toBeLessThan(100);
    expect(get().drafts[draftId].diary.blocks.length).toBe(0);
  });

  test('missing generation job becomes visible failed state instead of spinning forever', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-missing-1',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'generation job not found',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-missing-job',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-missing-job',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-missing-job`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, round);

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('生成任务已失效，请重新生成。');
    expect(get().drafts[draftId].diary.blocks.length).toBe(0);
  });

  test('generation permission loss becomes a visible failed state with the precise device warning', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-permission-denied',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'permission_denied',
          message: 'generation job access denied',
          retryable: false,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-permission-denied',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-permission-denied',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-permission-denied`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, round);

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('当前设备无法继续读取该生成任务，请重新生成。');
    expect(get().drafts[draftId].diary.blocks.length).toBe(0);
  });

  test('failed generation can start a new round and ignore stale refreshes from the old round', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-retry-1',
            draftId: 'draft-test-retry',
            draftVersion: 1,
            idempotencyKey: 'draft-test-retry-round-1',
            status: 'queued',
            stage: 'queued',
            progressPercent: 0,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-retry-2',
            draftId: 'draft-test-retry',
            draftVersion: 2,
            idempotencyKey: 'draft-test-retry-round-2',
            status: 'queued',
            stage: 'queued',
            progressPercent: 0,
          },
        }),
      getGenerationJob: jest.fn()
        .mockResolvedValueOnce({
          ok: false,
          version: CORE_DIARY_CONTRACT_VERSION,
          error: {
            code: 'timeout',
            message: 'generation timed out',
            retryable: true,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          version: CORE_DIARY_CONTRACT_VERSION,
          data: {
            jobId: 'job-retry-2',
            draftId: 'draft-test-retry',
            draftVersion: 2,
            idempotencyKey: 'draft-test-retry-round-2',
            status: 'succeeded',
            stage: 'completed',
            progressPercent: 100,
            result: buildRemoteGenerationResult('draft-test-retry'),
          },
        }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-retry-round',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-retry-round',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-retry`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const firstRound = get().startGeneration(draftId)!;

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, firstRound);

    expect(get().drafts[draftId].generation.status).toBe('failed');
    expect(get().drafts[draftId].generation.errorMessage).toBe('生成超时，请稍后重试。');

    const retriedRound = get().startGeneration(draftId)!;
    expect(retriedRound).toBe(firstRound + 1);
    expect(get().drafts[draftId].generation.status).toBe('running');
    expect(get().drafts[draftId].generation.errorMessage).toBeUndefined();

    await get().refreshDraftGeneration(draftId, firstRound);
    expect(get().drafts[draftId].generation.round).toBe(retriedRound);
    expect(get().drafts[draftId].generation.status).toBe('running');

    await new Promise(resolve => setTimeout(resolve, 0));
    await get().refreshDraftGeneration(draftId, retriedRound);

    expect(get().drafts[draftId].generation.status).toBe('complete');
    expect(get().drafts[draftId].generation.remoteJobId).toBe('job-retry-2');
  });

  test('memories query ignores stale responses and keeps the newest filter result', async () => {
    const first = createDeferred<{
      ok: true;
      version: typeof CORE_DIARY_CONTRACT_VERSION;
      data: {
        items: Array<{
          id: string;
          title: string;
          summary: string;
          location: string;
          date: string;
          privacy: 'private';
          photoIds: string[];
          version: number;
        }>;
        page: number;
        pageSize: number;
        total: number;
      };
    }>();
    const second = createDeferred<{
      ok: true;
      version: typeof CORE_DIARY_CONTRACT_VERSION;
      data: {
        items: Array<{
          id: string;
          title: string;
          summary: string;
          location: string;
          date: string;
          privacy: 'private';
          photoIds: string[];
          version: number;
        }>;
        page: number;
        pageSize: number;
        total: number;
      };
    }>();
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-1',
          draftVersion: 1,
          idempotencyKey: 'draft-test-1-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-1',
          draftVersion: 1,
          idempotencyKey: 'draft-test-1-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-1'),
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-remote-1',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-remote-1',
        },
      }),
      getSaveResult: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: 'diary-remote-1',
          draftId: 'draft-test-1',
          savedVersion: 1,
          id: 'diary-remote-1',
        },
      }),
      listMemories: jest.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-2`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();

    const firstSearch = get().searchMemories({ month: '2026.01', page: 1, pageSize: 100 });
    const secondSearch = get().searchMemories({ month: '2026.02', page: 1, pageSize: 100 });

    second.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        items: [{
          id: 'diary-feb',
          title: '二月回忆',
          summary: '二月的海风',
          location: '厦门',
          date: '2026.02.03',
          privacy: 'private',
          photoIds: ['photo-1'],
          version: 1,
        }],
        page: 1,
        pageSize: 100,
        total: 1,
      },
    });
    await secondSearch;

    first.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        items: [{
          id: 'diary-jan',
          title: '一月回忆',
          summary: '一月的海风',
          location: '青岛',
          date: '2026.01.03',
          privacy: 'private',
          photoIds: ['photo-2'],
          version: 1,
        }],
        page: 1,
        pageSize: 100,
        total: 1,
      },
    });
    await firstSearch;

    expect(get().memoriesStatus).toBe('ready');
    expect(get().memoriesItems.map(item => item.id)).toEqual(['diary-feb']);
    expect(get().memoriesTotal).toBe(1);
  });

  test('empty remote memories do not fall back to local mock diaries', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-empty',
          draftVersion: 1,
          idempotencyKey: 'draft-test-empty-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-empty',
          draftVersion: 1,
          idempotencyKey: 'draft-test-empty-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-empty'),
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-remote-empty',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-remote-empty',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-empty`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
      diaries: mockDiaries,
    });
    const store = createAppStore(deps);
    const get = () => store.getState();

    await get().hydrateMemories();
    await get().searchMemories({ page: 1, pageSize: 100 });

    expect(get().memoriesSourceItems).toEqual([]);
    expect(get().memoriesItems).toEqual([]);
    expect(get().memoriesTotal).toBe(0);
  });

  test('memories filters persist and retry uses the same query after failure', async () => {
    const listMemories = jest.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [{
            id: 'diary-retry',
            title: '重试成功的回忆',
            summary: '海风又回来了',
            location: '厦门',
            date: '2026.02.03',
            privacy: 'private',
            photoIds: ['photo-1'],
            version: 1,
          }],
          page: 1,
          pageSize: 100,
          total: 1,
        },
      });
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-1',
          draftVersion: 1,
          idempotencyKey: 'draft-test-1-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-1',
          draftVersion: 1,
          idempotencyKey: 'draft-test-1-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-1'),
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-remote-1',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-remote-1',
        },
      }),
      getSaveResult: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: 'diary-remote-1',
          draftId: 'draft-test-1',
          savedVersion: 1,
          id: 'diary-remote-1',
        },
      }),
      listMemories,
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-3`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();

    get().setMemoriesFilters({
      month: '2026.02',
      day: 3,
      searchKeyword: '厦门',
      searchVisible: true,
    });

    await get().searchMemories({
      month: '2026.02',
      day: '2026.02.03',
      keyword: '厦门',
      page: 1,
      pageSize: 100,
    });

    expect(get().memoriesStatus).toBe('error');
    expect(get().memoriesFilterMonth).toBe('2026.02');
    expect(get().memoriesFilterDay).toBe(3);
    expect(get().memoriesSearchKeyword).toBe('厦门');
    expect(get().memoriesSearchVisible).toBe(true);

    await get().retryMemoriesSearch();

    expect(listMemories).toHaveBeenLastCalledWith({
      month: '2026.02',
      day: '2026.02.03',
      keyword: '厦门',
      page: 1,
      pageSize: 100,
    });
    expect(get().memoriesStatus).toBe('ready');
    expect(get().memoriesItems.map(item => item.id)).toEqual(['diary-retry']);
  });

  test('saved diary updates remote memories source immediately', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-saved',
          draftVersion: 1,
          idempotencyKey: 'draft-test-saved-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-saved',
          draftVersion: 1,
          idempotencyKey: 'draft-test-saved-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-saved'),
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-remote-saved',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-remote-saved',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-saved`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
      diaries: mockDiaries,
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;
    get().finishGeneration(draftId, round);

    const savedDiaryId = get().saveDraft(draftId)!;
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().memoriesSourceItems.map(item => item.id)).toContain(savedDiaryId);
  });

  test('save recovers by querying the same idempotency result after response loss', async () => {
    const getSaveResult = jest.fn().mockResolvedValue({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: 'diary-recovered',
        draftId: 'draft-test-4',
        savedVersion: 1,
        id: 'diary-recovered',
      },
    });
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-4',
          draftVersion: 1,
          idempotencyKey: 'draft-test-4-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-4',
          draftVersion: 1,
          idempotencyKey: 'draft-test-4-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-4'),
        },
      }),
      saveDiary: async () => {
        throw new Error('network down');
      },
      getSaveResult,
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-4`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;
    get().finishGeneration(draftId, round);

    get().saveDraft(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(getSaveResult).toHaveBeenCalledWith(`${draftId}-save-${round}`);
    expect(get().issueLog).toEqual([]);
  });

  test('E15 CASE-BAS-004-003 injected write failure preserves data and a controlled retry saves once', async () => {
    type SaveResult = Awaited<ReturnType<CoreDiaryRepository['saveDiary']>>;
    const deferredRetry = createDeferred<SaveResult>();
    const faultPlan = createAsyncFaultPlan<SaveResult>([
      { type: 'reject', reason: new Error('simulated write failure') },
      { type: 'deferred', deferred: deferredRetry },
    ]);
    const saveDiary = jest.fn((_input: Parameters<CoreDiaryRepository['saveDiary']>[0]) => faultPlan.next());
    const getSaveResult = jest.fn<
      ReturnType<CoreDiaryRepository['getSaveResult']>,
      Parameters<CoreDiaryRepository['getSaveResult']>
    >(async () => ({
      ok: false as const,
      version: CORE_DIARY_CONTRACT_VERSION,
      error: {
        code: 'not_found' as const,
        message: 'save result not found',
        retryable: false,
      },
    }));
    const repository = createRepository({ saveDiary, getSaveResult });
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-bas004-fault`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
      diaries: mockDiaries,
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;
    get().finishGeneration(draftId, round);
    const initialDiaries = JSON.stringify(get().diaries);
    const initialDraftDiary = JSON.stringify(get().drafts[draftId].diary);
    const idempotencyKey = `${draftId}-save-${round}`;

    const failed = await get().submitDraft(draftId);

    expect(failed).toEqual({
      ok: false,
      reason: 'save_failed',
      message: 'simulated write failure',
    });
    expect(get().savingDraftIds).toEqual([]);
    expect(get().drafts[draftId]).toBeTruthy();
    expect(JSON.stringify(get().drafts[draftId].diary)).toBe(initialDraftDiary);
    expect(JSON.stringify(get().diaries)).toBe(initialDiaries);
    expect(getSaveResult).toHaveBeenCalledWith(idempotencyKey);
    expect(faultPlan.callCount).toBe(1);
    expect(faultPlan.remainingCount).toBe(1);

    const retry = get().submitDraft(draftId);
    expect(get().savingDraftIds).toContain(draftId);
    expect(saveDiary).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey }));

    deferredRetry.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: 'diary-bas004-fault-saved',
        draftId,
        savedVersion: round,
        id: 'diary-bas004-fault-saved',
      },
    });

    await expect(retry).resolves.toEqual({
      ok: true,
      diaryId: 'diary-bas004-fault-saved',
      destination: 'complete',
    });
    expect(get().savingDraftIds).toEqual([]);
    expect(get().diaries).toHaveLength(mockDiaries.length + 1);
    expect(get().diaries.filter(diary => diary.id === 'diary-bas004-fault-saved')).toHaveLength(1);
    expect(faultPlan.callCount).toBe(2);
    expect(faultPlan.remainingCount).toBe(0);
    expect(saveDiary.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([idempotencyKey, idempotencyKey]);
  });

  test('save logs version conflict instead of pretending success', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-5',
          draftVersion: 1,
          idempotencyKey: 'draft-test-5-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-5',
          draftVersion: 1,
          idempotencyKey: 'draft-test-5-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-5'),
        },
      }),
      saveDiary: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'version_conflict',
          message: 'source diary version conflict',
          retryable: false,
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-5`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
      diaries: mockDiaries,
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginEdit('diary-1')!;

    get().saveDraft(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(get().issueLog.at(-1)).toBe('日记保存失败：原日记已有新版本，请重新进入编辑后再处理。');
  });

  test('submitDraft keeps saved diary untouched when edit save hits version conflict', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-6',
          draftVersion: 1,
          idempotencyKey: 'draft-test-6-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-6',
          draftVersion: 1,
          idempotencyKey: 'draft-test-6-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-6'),
        },
      }),
      saveDiary: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'version_conflict',
          message: 'source diary version conflict',
          retryable: false,
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-6`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
      diaries: mockDiaries,
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const original = JSON.stringify(get().diaries.find(diary => diary.id === 'diary-1'));
    const draftId = get().beginEdit('diary-1')!;

    get().updateDraft(draftId, { title: '冲突后的标题' });
    const result = await get().submitDraft(draftId);

    expect(result).toEqual({
      ok: false,
      reason: 'version_conflict',
      message: '这篇日记已经有新版本了，当前草稿已保留，请重新进入编辑后再处理。',
    });
    expect(JSON.stringify(get().diaries.find(diary => diary.id === 'diary-1'))).toBe(original);
    expect(get().drafts[draftId].diary.title).toBe('冲突后的标题');
    expect(get().drafts[draftId].savedDiaryId).toBeUndefined();
    expect(get().savingDraftIds).toEqual([]);
  });

  test('submitDraft waits for remote save success before updating local diary', async () => {
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-7',
          draftVersion: 1,
          idempotencyKey: 'draft-test-7-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-7',
          draftVersion: 1,
          idempotencyKey: 'draft-test-7-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-7'),
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-test-7',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-test-7',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-7`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;
    get().finishGeneration(draftId, round);

    const result = await get().submitDraft(draftId);

    expect(result).toEqual({
      ok: true,
      diaryId: expect.any(String),
      destination: 'complete',
    });
    expect(get().drafts[draftId].savedDiaryId).toBe(result.ok ? result.diaryId : undefined);
    expect(get().diaries.some(diary => diary.id === (result.ok ? result.diaryId : ''))).toBe(true);
    expect(get().savingDraftIds).toEqual([]);
  });

  test('submitDraft rejects a running generation draft without mutating saved diaries or dropping the draft', async () => {
    const { get, selectors } = createContext();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    get().startGeneration(draftId);
    const beforeDiaryTwo = JSON.stringify(selectors.getDiaryById('diary-2'));

    const result = await get().submitDraft(draftId);

    expect(result).toEqual({
      ok: false,
      reason: 'needs_regeneration',
      message: '照片已更新，重新生成后就可以保存。',
    });
    expect(get().drafts[draftId]).toBeTruthy();
    expect(get().drafts[draftId].generation.status).toBe('running');
    expect(get().drafts[draftId].savedDiaryId).toBeUndefined();
    expect(JSON.stringify(selectors.getDiaryById('diary-2'))).toBe(beforeDiaryTwo);
    expect(get().savingDraftIds).toEqual([]);
  });

  test('submitDraft rejects a generated draft with fewer than three valid photos and keeps other saved diaries untouched', async () => {
    const { get, selectors } = createContext();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;
    get().finishGeneration(draftId, round);
    get().setDraftPhotos(draftId, ['photo-1', 'photo-2']);
    const beforeDiaryTwo = JSON.stringify(selectors.getDiaryById('diary-2'));

    const result = await get().submitDraft(draftId);

    expect(result).toEqual({
      ok: false,
      reason: 'needs_regeneration',
      message: '照片已更新，重新生成后就可以保存。',
    });
    expect(get().drafts[draftId]).toBeTruthy();
    expect(get().drafts[draftId].selectedPhotoIds).toEqual(['photo-1', 'photo-2']);
    expect(get().drafts[draftId].savedDiaryId).toBeUndefined();
    expect(JSON.stringify(selectors.getDiaryById('diary-2'))).toBe(beforeDiaryTwo);
    expect(get().savingDraftIds).toEqual([]);
  });

  test('submitDraft rejects editing a missing source diary and preserves the working draft for follow-up handling', async () => {
    const { get, selectors, store } = createContext();
    const draftId = get().beginEdit('diary-1')!;
    const beforeDiaryTwo = JSON.stringify(selectors.getDiaryById('diary-2'));
    const draftTitleBefore = get().drafts[draftId].diary.title;

    store.setState(state => ({
      diaries: state.diaries.filter(diary => diary.id !== 'diary-1'),
      memoriesSourceItems: state.memoriesSourceItems.filter(item => item.id !== 'diary-1'),
      memoriesItems: state.memoriesItems.filter(item => item.id !== 'diary-1'),
    }));

    const result = await get().submitDraft(draftId);

    expect(result).toEqual({
      ok: false,
      reason: 'source_missing',
      message: '原日记已不存在，请返回回忆列表确认后再处理。',
    });
    expect(get().drafts[draftId]).toBeTruthy();
    expect(get().drafts[draftId].diary.title).toBe(draftTitleBefore);
    expect(get().drafts[draftId].savedDiaryId).toBeUndefined();
    expect(JSON.stringify(selectors.getDiaryById('diary-2'))).toBe(beforeDiaryTwo);
    expect(get().savingDraftIds).toEqual([]);
  });

  test('discarding a draft during submit keeps the saved result but does not resurrect the draft', async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<CoreDiaryRepository['saveDiary']>>>();
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-8',
          draftVersion: 1,
          idempotencyKey: 'draft-test-8-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-8',
          draftVersion: 1,
          idempotencyKey: 'draft-test-8-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-8'),
        },
      }),
      saveDiary: () => deferredSave.promise,
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-8`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;
    get().finishGeneration(draftId, round);
    const diaryCountBefore = get().diaries.length;

    const submitPromise = get().submitDraft(draftId);
    expect(get().savingDraftIds).toContain(draftId);
    get().discardDraft(draftId);
    expect(get().activeDraftId).toBeUndefined();

    deferredSave.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: 'diary-test-8',
        draftId,
        savedVersion: round,
        id: 'diary-test-8',
      },
    });
    const result = await submitPromise;

    expect(result).toEqual({
      ok: true,
      diaryId: 'diary-test-8',
      destination: 'complete',
    });
    expect(get().drafts[draftId]).toBeUndefined();
    expect(get().savingDraftIds).toEqual([]);
    expect(get().diaries.length).toBe(diaryCountBefore + 1);
    expect(get().diaries.some(diary => diary.id === 'diary-test-8')).toBe(true);
  });

  test('discarding a draft during failed submit removes the abandoned draft instead of restoring it', async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<CoreDiaryRepository['saveDiary']>>>();
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-9',
          draftVersion: 1,
          idempotencyKey: 'draft-test-9-round-1',
          status: 'queued',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-1',
          draftId: 'draft-test-9',
          draftVersion: 1,
          idempotencyKey: 'draft-test-9-round-1',
          status: 'succeeded',
          stage: 'completed',
          progressPercent: 100,
          result: buildRemoteGenerationResult('draft-test-9'),
        },
      }),
      saveDiary: () => deferredSave.promise,
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-9`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());
    const round = get().startGeneration(draftId)!;
    get().finishGeneration(draftId, round);
    const diaryCountBefore = get().diaries.length;

    const submitPromise = get().submitDraft(draftId);
    get().discardDraft(draftId);
    deferredSave.reject(new Error('network down'));
    const result = await submitPromise;

    expect(result).toEqual({
      ok: false,
      reason: 'save_failed',
      message: 'network down',
    });
    expect(get().drafts[draftId]).toBeUndefined();
    expect(get().savingDraftIds).toEqual([]);
    expect(get().diaries.length).toBe(diaryCountBefore);
    expect(get().issueLog.at(-1)).toBe('日记保存失败：network down');
  });

  test('E04 CASE-BAS-004-002 first and second creation save unique diaries idempotently without changing seeds', () => {
    const { get, generateNew } = createContext();
    const seed = JSON.stringify(get().diaries[0]);
    const count = get().diaries.length;
    const first = generateNew();
    const firstId = get().saveDraft(first);
    expect(firstId).toBeTruthy();
    expect(get().saveDraft(first)).toBe(firstId);

    const second = generateNew();
    const secondId = get().saveDraft(second);
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
    expect(get().diaries.length).toBe(count + 2);
    expect(JSON.stringify(get().diaries.find(diary => diary.id === 'diary-1'))).toBe(seed);
    expect(getDiaryStatistics(get().diaries).diaries).toBe(49);
    expect(getHistoryGroups(get().diaries).some(group => group.diaryIds.includes(secondId!))).toBe(true);
  });

  test('E05 CASE-BAS-004-002 editing and abandoning the second diary leaves both saved records untouched', () => {
    const { get, selectors, generateNew } = createContext();
    const first = get().saveDraft(generateNew())!;
    const second = get().saveDraft(generateNew())!;
    const firstBefore = JSON.stringify(selectors.getDiaryById(first));
    const secondBefore = JSON.stringify(selectors.getDiaryById(second));
    const edit = get().beginEdit(second)!;
    get().updateDraft(edit, { title: '未保存的新标题' });
    const block = get().drafts[edit].diary.blocks.find(item => item.type === 'text')!;
    get().updateDraftBlock(edit, block.id, '未保存的段落');
    get().discardDraft(edit);
    expect(JSON.stringify(selectors.getDiaryById(first))).toBe(firstBefore);
    expect(JSON.stringify(selectors.getDiaryById(second))).toBe(secondBefore);
    expect(get().beginEdit('missing')).toBeUndefined();
    expect(selectors.getDiaryById('missing')).toBeUndefined();
  });

  test('DIA-002 title edits stay inside the working draft until save', () => {
    const { get, selectors } = createContext();
    const originalDiary = selectors.getDiaryById('diary-1')!;
    const siblingDiary = selectors.getDiaryById('diary-2')!;
    const draftId = get().beginEdit('diary-1')!;

    get().updateDraft(draftId, { title: '新的旅行标题' });

    expect(get().drafts[draftId]?.diary.title).toBe('新的旅行标题');
    expect(selectors.getDiaryById('diary-1')).toEqual(originalDiary);
    expect(selectors.getDiaryById('diary-2')).toEqual(siblingDiary);
  });

  test('DIA-002 block edits update only the targeted draft text and quote blocks before save', () => {
    const { get, selectors } = createContext();
    const originalDiary = selectors.getDiaryById('diary-1')!;
    const draftId = get().beginEdit('diary-1')!;
    const draftBefore = get().drafts[draftId];
    const targetTextBlock = draftBefore.diary.blocks.find(block => block.type === 'text')!;
    const targetQuoteBlock = draftBefore.diary.blocks.find(block => block.type === 'quote')!;
    const untouchedTextBlock = draftBefore.diary.blocks.find(
      block => block.type === 'text' && block.id !== targetTextBlock.id,
    )!;

    get().updateDraftBlock(draftId, targetTextBlock.id, '只改正文块的新内容');
    get().updateDraftBlock(draftId, targetQuoteBlock.id, '只改引用块的新内容');

    const currentDraft = get().drafts[draftId];
    const currentTextBlock = currentDraft.diary.blocks.find(block => block.id === targetTextBlock.id);
    const currentQuoteBlock = currentDraft.diary.blocks.find(block => block.id === targetQuoteBlock.id);
    const currentUntouchedTextBlock = currentDraft.diary.blocks.find(block => block.id === untouchedTextBlock.id);

    expect(currentTextBlock && 'content' in currentTextBlock ? currentTextBlock.content : '').toBe('只改正文块的新内容');
    expect(currentQuoteBlock && 'content' in currentQuoteBlock ? currentQuoteBlock.content : '').toBe('只改引用块的新内容');
    expect(currentUntouchedTextBlock).toEqual(untouchedTextBlock);
    expect(selectors.getDiaryById('diary-1')).toEqual(originalDiary);
  });

  test('DIA-002 discard then submit keeps the same saved diary and restores the snapshot correctly', async () => {
    const repository = createRepository();
    const deps = createDefaultAppStoreDeps({
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const beforeDiaries = get().diaries;
    const beforeCount = beforeDiaries.length;
    const beforeDiary = beforeDiaries.find(diary => diary.id === 'diary-1');

    const firstDraftId = get().beginEdit('diary-1')!;
    const firstTextBlock = get().drafts[firstDraftId].diary.blocks.find(block => block.type === 'text')!;
    get().updateDraft(firstDraftId, { title: '第一次编辑后放弃', summary: '第一次修改不应该落盘。' });
    get().updateDraftBlock(firstDraftId, firstTextBlock.id, '第一次编辑后准备放弃的正文');
    get().discardDraft(firstDraftId);

    expect(get().drafts[firstDraftId]).toBeUndefined();
    expect(get().diaries).toHaveLength(beforeCount);
    expect(get().diaries.find(diary => diary.id === 'diary-1')).toEqual(beforeDiary);

    const secondDraftId = get().beginEdit('diary-1')!;
    const secondTextBlock = get().drafts[secondDraftId].diary.blocks.find(block => block.type === 'text')!;
    get().updateDraft(secondDraftId, {
      title: '第二次编辑后正式保存',
      summary: '第二次保存应更新原作品而不是新增列表项。',
    });
    get().updateDraftBlock(secondDraftId, secondTextBlock.id, '第二次编辑后正式保存的正文');

    const result = await get().submitDraft(secondDraftId);
    const afterDiaries = get().diaries;
    const savedDiary = afterDiaries.find(diary => diary.id === 'diary-1');
    const savedTextBlock = savedDiary?.blocks.find(block => block.type === 'text');

    expect(result).toEqual({
      ok: true,
      diaryId: 'diary-1',
      destination: 'detail',
    });
    expect(afterDiaries).toHaveLength(beforeCount);
    expect(afterDiaries.filter(diary => diary.id === 'diary-1')).toHaveLength(1);
    expect(savedDiary?.title).toBe('第二次编辑后正式保存');
    expect(savedDiary?.summary).toBe('第二次编辑后正式保存的正文');
    expect(savedTextBlock && 'content' in savedTextBlock ? savedTextBlock.content : '').toBe('第二次编辑后正式保存的正文');
  });

  test('discarding an edit draft ignores a delayed rewrite result and keeps the saved diary unchanged', async () => {
    const { get, selectors } = createContext();
    const draftId = get().beginEdit('diary-1')!;
    const originalDiary = selectors.getDiaryById('diary-1');
    const originalBlock = get().drafts[draftId].diary.blocks.find(item => item.type === 'text');
    const getDraftTextContent = () => {
      const block = get().drafts[draftId]?.diary.blocks.find(item => item.id === originalBlock!.id);
      return block && 'content' in block ? block.content : undefined;
    };

    expect(originalBlock && 'content' in originalBlock ? originalBlock.content : '').toBeTruthy();

    get().rewriteDraftBlock(draftId, originalBlock!.id);
    expect(getDraftTextContent()).toBe(originalBlock!.content);

    get().discardDraft(draftId);
    await Promise.resolve();

    expect(get().drafts[draftId]).toBeUndefined();
    expect(selectors.getDiaryById('diary-1')).toEqual(originalDiary);
  });

  test('rewrite sends scoped context to the repository and only replaces the target block', async () => {
    const rewriteBlock = jest.fn().mockImplementation(async input => ({
      ok: true as const,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        draftId: input.draftId,
        blockId: input.blockId,
        draftVersion: input.draftVersion,
        blockType: input.blockType,
        content: '服务返回的新段落',
        photoIds: input.photoIds,
      },
    }));
    const repository = createRepository({ rewriteBlock });
    const deps = createDefaultAppStoreDeps({
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginEdit('diary-1')!;
    const targetBlock = get().drafts[draftId].diary.blocks.find(item => item.type === 'text')!;
    const untouchedBlock = get().drafts[draftId].diary.blocks.find(item => item.type === 'quote')!;

    get().setDraftBlockPhotos(draftId, targetBlock.id, ['photo-1', 'photo-2']);
    const sourceBefore = get().drafts[draftId].diary.blocks.find(item => item.id === targetBlock.id);
    const untouchedBefore = get().drafts[draftId].diary.blocks.find(item => item.id === untouchedBlock.id);

    get().rewriteDraftBlock(draftId, targetBlock.id);
    await flushAsyncWork();

    expect(rewriteBlock).toHaveBeenCalledWith(expect.objectContaining({
      draftId,
      blockId: targetBlock.id,
      draftVersion: get().drafts[draftId].generation.round,
      characterId: get().drafts[draftId].diary.characterId,
      blockType: 'text',
      content: 'content' in sourceBefore! ? sourceBefore.content : '',
      selectedPhotoIds: get().drafts[draftId].selectedPhotoIds,
      photoIds: ['photo-1', 'photo-2'],
    }));

    const currentTarget = get().drafts[draftId].diary.blocks.find(item => item.id === targetBlock.id);
    const currentUntouched = get().drafts[draftId].diary.blocks.find(item => item.id === untouchedBlock.id);
    expect(currentTarget && 'content' in currentTarget ? currentTarget.content : '').toBe('服务返回的新段落');
    expect(currentUntouched).toEqual(untouchedBefore);
  });

  test('rewrite failure keeps the original text and records the service error', async () => {
    const repository = createRepository({
      rewriteBlock: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'rewrite provider failed',
          retryable: true,
        },
      }),
    });
    const deps = createDefaultAppStoreDeps({
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginEdit('diary-1')!;
    const targetBlock = get().drafts[draftId].diary.blocks.find(item => item.type === 'text')!;
    const originalContent = 'content' in targetBlock ? targetBlock.content : '';

    get().rewriteDraftBlock(draftId, targetBlock.id);
    await flushAsyncWork();

    const currentTarget = get().drafts[draftId].diary.blocks.find(item => item.id === targetBlock.id);
    expect(currentTarget && 'content' in currentTarget ? currentTarget.content : '').toBe(originalContent);
    expect(get().issueLog.at(-1)).toBe('段落重写失败：rewrite provider failed');
  });

  test('rewrite timeout keeps the original text and records the timeout message', async () => {
    const repository = createRepository({
      rewriteBlock: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'timeout',
          message: 'AI provider request timed out after 1000ms',
          retryable: true,
        },
      }),
    });
    const deps = createDefaultAppStoreDeps({
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginEdit('diary-1')!;
    const targetBlock = get().drafts[draftId].diary.blocks.find(item => item.type === 'text')!;
    const originalContent = 'content' in targetBlock ? targetBlock.content : '';

    get().rewriteDraftBlock(draftId, targetBlock.id);
    await flushAsyncWork();

    const currentTarget = get().drafts[draftId].diary.blocks.find(item => item.id === targetBlock.id);
    expect(currentTarget && 'content' in currentTarget ? currentTarget.content : '').toBe(originalContent);
    expect(get().issueLog.at(-1)).toBe('段落重写失败：AI provider request timed out after 1000ms');
  });

  test('malformed rewrite output keeps the original text and records the contract error', async () => {
    const repository = createRepository({
      rewriteBlock: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'rewrite result response is invalid',
          retryable: false,
        },
      }),
    });
    const deps = createDefaultAppStoreDeps({
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginEdit('diary-1')!;
    const targetBlock = get().drafts[draftId].diary.blocks.find(item => item.type === 'text')!;
    const originalContent = 'content' in targetBlock ? targetBlock.content : '';

    get().rewriteDraftBlock(draftId, targetBlock.id);
    await flushAsyncWork();

    const currentTarget = get().drafts[draftId].diary.blocks.find(item => item.id === targetBlock.id);
    expect(currentTarget && 'content' in currentTarget ? currentTarget.content : '').toBe(originalContent);
    expect(get().issueLog.at(-1)).toBe('段落重写失败：rewrite result response is invalid');
  });

  test('repeated rewrite taps reuse the in-flight request and stale results cannot overwrite new input', async () => {
    const deferred = createDeferred<Awaited<ReturnType<NonNullable<CoreDiaryRepository['rewriteBlock']>>>>();
    const rewriteBlock = jest.fn().mockReturnValue(deferred.promise);
    const repository = createRepository({ rewriteBlock });
    const deps = createDefaultAppStoreDeps({
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginEdit('diary-1')!;
    const targetBlock = get().drafts[draftId].diary.blocks.find(item => item.type === 'text')!;

    get().rewriteDraftBlock(draftId, targetBlock.id);
    get().rewriteDraftBlock(draftId, targetBlock.id);
    expect(rewriteBlock).toHaveBeenCalledTimes(1);

    get().updateDraftBlock(draftId, targetBlock.id, '我先手动改成新内容');

    deferred.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        draftId,
        blockId: targetBlock.id,
        draftVersion: get().drafts[draftId].generation.round,
        blockType: 'text',
        content: '迟到的旧重写结果',
        photoIds: undefined,
      },
    });
    await flushAsyncWork();

    const currentTarget = get().drafts[draftId].diary.blocks.find(item => item.id === targetBlock.id);
    expect(currentTarget && 'content' in currentTarget ? currentTarget.content : '').toBe('我先手动改成新内容');
  });

  test('saved drafts ignore later edits and rewrites, and repeated save keeps the first saved diary unchanged', async () => {
    const { get, selectors } = createContext();
    const draftId = get().beginEdit('diary-1')!;
    const savedDiaryId = get().saveDraft(draftId)!;
    const savedBefore = selectors.getDiaryById(savedDiaryId);
    const savedBlock = savedBefore?.blocks.find(item => item.type === 'text');

    expect(savedBefore).toBeTruthy();
    expect(savedBlock && 'content' in savedBlock ? savedBlock.content : '').toBeTruthy();

    get().updateDraft(draftId, { title: '不应覆盖已保存标题' });
    get().updateDraftBlock(draftId, savedBlock!.id, '不应覆盖已保存正文');
    get().rewriteDraftBlock(draftId, savedBlock!.id);
    await Promise.resolve();

    expect(get().saveDraft(draftId)).toBe(savedDiaryId);
    expect(selectors.getDiaryById(savedDiaryId)).toEqual(savedBefore);
    expect(get().drafts[draftId]?.savedDiaryId).toBe(savedDiaryId);
    expect(get().drafts[draftId]?.diary).toEqual(savedBefore);
  });

  test('discardDraft cancels remote generation job before removing working copy', async () => {
    const cancelGenerationJob = jest.fn().mockResolvedValue({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        jobId: 'job-discard',
        draftId: 'draft-test-discard',
        draftVersion: 1,
        idempotencyKey: 'draft-test-discard-round-1',
        status: 'cancelled',
        stage: 'cancelled',
        progressPercent: 18,
      },
    });
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-discard',
          draftId: input.draftId,
          draftVersion: input.draftVersion,
          idempotencyKey: input.idempotencyKey,
          status: 'running',
          stage: 'analyzing-photos',
          progressPercent: 18,
        },
      }),
      cancelGenerationJob,
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-discard',
          draftId: 'draft-test-discard',
          draftVersion: 1,
          idempotencyKey: 'draft-test-discard-round-1',
          status: 'running',
          stage: 'analyzing-photos',
          progressPercent: 18,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-discard',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-discard',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-discard`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    get().startGeneration(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));
    get().discardDraft(draftId);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cancelGenerationJob).toHaveBeenCalledWith('job-discard');
    expect(get().drafts[draftId]).toBeUndefined();
  });

  test('stale generation job creation is cancelled when draft is discarded before job id returns', async () => {
    const deferredJob = createDeferred<Awaited<ReturnType<NonNullable<CoreDiaryRepository['createGenerationJob']>>>>();
    const cancelGenerationJob = jest.fn().mockResolvedValue({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        jobId: 'job-late',
        draftId: 'draft-test-late',
        draftVersion: 1,
        idempotencyKey: 'draft-test-late-round-1',
        status: 'cancelled',
        stage: 'cancelled',
        progressPercent: 0,
      },
    });
    const repository: CoreDiaryRepository = {
      getIdentity: async () => ({ id: 'device-1', type: 'anonymous-device' }),
      createDraft: async input => ({ ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: input }),
      createGenerationJob: () => deferredJob.promise,
      cancelGenerationJob,
      getGenerationJob: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          jobId: 'job-late',
          draftId: 'draft-test-late',
          draftVersion: 1,
          idempotencyKey: 'draft-test-late-round-1',
          status: 'running',
          stage: 'queued',
          progressPercent: 0,
        },
      }),
      saveDiary: async input => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          diaryId: input.id ?? 'diary-late',
          draftId: input.draftId,
          savedVersion: input.version,
          id: input.id ?? 'diary-late',
        },
      }),
      getSaveResult: async () => ({
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'not_found',
          message: 'save result not found',
          retryable: false,
        },
      }),
      listMemories: async () => ({
        ok: true,
        version: CORE_DIARY_CONTRACT_VERSION,
        data: {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      }),
    };
    const deps = createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-test-late`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();
    const draftId = get().beginCreation();
    get().setDraftPhotos(draftId, defaultSelectablePhotoIds());

    get().startGeneration(draftId);
    get().discardDraft(draftId);
    deferredJob.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        jobId: 'job-late',
        draftId,
        draftVersion: 1,
        idempotencyKey: `${draftId}-round-1`,
        status: 'queued',
        stage: 'queued',
        progressPercent: 0,
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cancelGenerationJob).toHaveBeenCalledWith('job-late');
    expect(get().drafts[draftId]).toBeUndefined();
  });

  test('E06 CASE-BAS-004-002 editing preserves diary ID, blocks stay editable, character selection does not overwrite text', () => {
    const { get } = createContext();
    const id = get().beginEdit('diary-1')!;
    const before = get().drafts[id].diary.blocks;
    get().setDraftCharacter(id, 'character-green');
    expect(get().drafts[id].diary.blocks).toEqual(before);
    get().updateDraftBlock(id, 'block-1', '我改写的第一段。');
    get().setDraftBlockPhotos(id, 'block-1', ['photo-5', 'photo-12']);
    const count = get().diaries.length;
    expect(get().saveDraft(id)).toBe('diary-1');
    expect(get().diaries.length).toBe(count);
    expect(get().diaries[0].summary).toBe('我改写的第一段。');
    const block = get().diaries[0].blocks[0];
    expect('photoIds' in block && block.photoIds).toEqual(['photo-5', 'photo-12']);
  });

  test('E07 CASE-BAS-004-002 person groups follow selected photos and empty names normalize on save', () => {
    const { get, selectors, generateNew } = createContext();
    expect(getPeopleForPhotos(['photo-1', 'photo-2', 'photo-3'], mockPhotos).length).toBe(0);
    const id = generateNew();
    expect(get().drafts[id].people.length).toBe(2);
    get().setDraftPersonName(id, 'person-friend', '阿云');
    expect(get().drafts[id].diary.people?.find(person => person.id === 'person-friend')?.name).toBe('阿云');
    expect(JSON.stringify(get().drafts[id].diary.blocks)).toMatch(/小巷/);
    expect(JSON.stringify(get().drafts[id].diary.blocks).includes('阿云巷')).toBe(false);
    get().setDraftPersonName(id, 'person-friend', '   ');
    const saved = get().saveDraft(id)!;
    expect(selectors.getDiaryById(saved)?.people?.find(person => person.id === 'person-friend')?.name).toBe('同行人');
  });

  test('CRE-006 naming keeps aliases without rewriting paragraph content, and ignores invalid people ids', () => {
    const { get } = createContext();
    const id = get().beginCreation();
    get().setDraftPhotos(id, ['photo-11', 'photo-12', 'photo-1']);
    const beforeBlocks = JSON.stringify(get().drafts[id].diary.blocks);

    get().setDraftPersonName(id, 'person-self', '我本人');
    get().setDraftPersonName(id, 'person-friend', '林可');
    get().setDraftPersonName(id, 'person-missing', '不会生效');

    const draft = get().drafts[id];
    expect(draft.people.find(person => person.id === 'person-self')?.name).toBe('我本人');
    expect(draft.people.find(person => person.id === 'person-friend')?.name).toBe('林可');
    expect(draft.people.find(person => person.id === 'person-friend')?.aliases).toContain('林可');
    expect(JSON.stringify(draft.diary.blocks)).toBe(beforeBlocks);
  });

  test('CRE-006 remote generation result does not fabricate people when provider returns none', () => {
    const { get } = createContext();
    const id = get().beginCreation();
    get().setDraftPhotos(id, ['photo-11', 'photo-12', 'photo-1']);

    const generated = buildGeneratedDiaryFromResult(get().drafts[id], {
      ...buildRemoteGenerationResult(id, ['photo-11', 'photo-12', 'photo-1']),
      companionName: '自己',
      people: [],
    });

    expect(generated?.people).toEqual([]);
    expect(generated?.companionName).toBe('自己');
  });

  test('CRE-006 naming save failure keeps existing inputs and retry can succeed', async () => {
    let shouldFail = false;
    const snapshotStore: DraftSnapshotStore = {
      load: async () => undefined,
      save: async () => {
        if (shouldFail) throw new Error('disk full');
      },
      clear: async () => undefined,
    };
    const deps = createDefaultAppStoreDeps({
      adapters: {
        draftSnapshotStore: snapshotStore,
      },
    });
    const store = createAppStore(deps);
    const get = () => store.getState();

    const id = get().beginCreation();
    get().setDraftPhotos(id, ['photo-11', 'photo-12', 'photo-1']);
    get().setDraftPersonName(id, 'person-friend', '阿云');
    await flushAsyncWork();

    shouldFail = true;

    const failed = await get().finalizeDraftPeopleNaming(id);
    expect(failed).toEqual({
      ok: false,
      message: '名字还没保存成功，请稍后重试。',
    });
    expect(get().drafts[id].people.find(person => person.id === 'person-friend')?.name).toBe('阿云');

    shouldFail = false;
    await expect(get().finalizeDraftPeopleNaming(id)).resolves.toEqual({ ok: true });
    expect(get().drafts[id].people.find(person => person.id === 'person-friend')?.name).toBe('阿云');
  });

  test('E08 CASE-BAS-004-002 replacing paragraph references removes linked standalone photo blocks, including an empty selection', () => {
    const { get } = createContext();
    const id = get().beginEdit('diary-1')!;
    const target = get().drafts[id].diary.blocks.find(block => block.id === 'block-3');
    expect(target && 'photoIds' in target).toBe(true);
    get().setDraftBlockPhotos(id, 'block-3', []);
    const draft = get().drafts[id].diary;
    const paragraph = draft.blocks.find(block => block.id === 'block-3');
    expect(paragraph && 'photoIds' in paragraph ? paragraph.photoIds : undefined).toEqual([]);
    expect(draft.blocks.some(block => block.type === 'photo' && block.relatedBlockId === 'block-3')).toBe(false);
  });

  test('DIA-003 whole-photo replacement normalizes cover, poster, blocks and people without mutating the saved diary', () => {
    const { get, selectors } = createContext();
    const original = cloneDiary(selectors.getDiaryById('diary-1')!);
    const id = get().beginEdit('diary-1')!;

    get().setDraftPhotos(id, ['photo-2', 'photo-3', 'photo-4', 'photo-2', 'photo-999']);

    const draft = get().drafts[id];
    const firstParagraph = draft.diary.blocks.find(block => block.id === 'block-1');
    const secondParagraph = draft.diary.blocks.find(block => block.id === 'block-3');
    const sunsetParagraph = draft.diary.blocks.find(block => block.id === 'block-5');

    expect(draft.selectedPhotoIds).toEqual(['photo-2', 'photo-3', 'photo-4']);
    expect(draft.diary.photoIds).toEqual(['photo-2', 'photo-3', 'photo-4']);
    expect(draft.diary.coverPhotoId).toBe('photo-2');
    expect(draft.diary.posterPhotoIds).toEqual(['photo-2', 'photo-3']);
    expect(firstParagraph && 'photoIds' in firstParagraph ? firstParagraph.photoIds : undefined).toEqual([]);
    expect(secondParagraph && 'photoIds' in secondParagraph ? secondParagraph.photoIds : undefined).toEqual(['photo-2', 'photo-4']);
    expect(sunsetParagraph && 'photoIds' in sunsetParagraph ? sunsetParagraph.photoIds : undefined).toEqual(['photo-3']);
    expect(draft.diary.blocks.some(block => block.id === 'block-2')).toBe(false);
    expect(draft.diary.blocks.every(block => block.type !== 'photo' || draft.diary.photoIds.includes(block.photoId))).toBe(true);
    expect(draft.diary.people).toEqual([]);
    expect(selectors.getDiaryById('diary-1')).toEqual(original);
  });

  test('DIA-003 paragraph photo replacement merges into the whole selection and repoints the linked standalone photo block', () => {
    const { get, selectors } = createContext();
    const original = cloneDiary(selectors.getDiaryById('diary-1')!);
    const id = get().beginEdit('diary-1')!;
    const untouchedBefore = get().drafts[id].diary.blocks.find(block => block.id === 'block-3');

    get().setDraftBlockPhotos(id, 'block-1', ['photo-6', 'photo-2', 'photo-6', 'photo-999']);

    const draft = get().drafts[id];
    const updatedParagraph = draft.diary.blocks.find(block => block.id === 'block-1');
    const linkedPhotoBlock = draft.diary.blocks.find(block => block.id === 'block-2');
    const untouchedParagraph = draft.diary.blocks.find(block => block.id === 'block-3');

    expect(draft.selectedPhotoIds).toEqual(['photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5', 'photo-11', 'photo-12', 'photo-6']);
    expect(updatedParagraph && 'photoIds' in updatedParagraph ? updatedParagraph.photoIds : undefined).toEqual(['photo-6', 'photo-2']);
    expect(linkedPhotoBlock && linkedPhotoBlock.type === 'photo' ? linkedPhotoBlock.photoId : undefined).toBe('photo-6');
    expect(untouchedParagraph).toEqual(untouchedBefore);
    expect(selectors.getDiaryById('diary-1')).toEqual(original);
  });

  test('DIA-003 saving a replaced photo collection persists the latest normalized references without duplicating the diary', () => {
    const { get, selectors } = createContext();
    const beforeCount = get().diaries.length;
    const id = get().beginEdit('diary-1')!;

    get().setDraftPhotos(id, ['photo-2', 'photo-3', 'photo-4']);
    get().setDraftBlockPhotos(id, 'block-5', ['photo-4']);

    const savedId = get().saveDraft(id);
    const saved = selectors.getDiaryById('diary-1')!;
    const block = saved.blocks.find(item => item.id === 'block-5');

    expect(savedId).toBe('diary-1');
    expect(get().diaries.length).toBe(beforeCount);
    expect(saved.photoIds).toEqual(['photo-2', 'photo-3', 'photo-4']);
    expect(saved.coverPhotoId).toBe('photo-2');
    expect(saved.posterPhotoIds).toEqual(['photo-2', 'photo-3']);
    expect(block && 'photoIds' in block ? block.photoIds : undefined).toEqual(['photo-4']);
    expect(saved.blocks.every(item => item.type !== 'photo' || saved.photoIds.includes(item.photoId))).toBe(true);
    expect(saved.people).toEqual([]);
  });

  test('E09 CASE-BAS-004-002 character presets change generated copy', () => {
    const { get, generateNew } = createContext();
    const blue = generateNew();
    const green = get().beginCreation();
    get().setDraftPhotos(green, defaultSelectablePhotoIds());
    get().setDraftCharacter(green, 'character-green');
    get().finishGeneration(green, get().startGeneration(green)!);
    expect(get().drafts[blue].diary.summary).not.toBe(get().drafts[green].diary.summary);
  });

  test('E10 CASE-BAS-004-003 layout replacement can preserve generated content while wizard changes invalidate it', () => {
    const { get, generateNew } = createContext();
    const editorDraft = generateNew();
    const before = get().drafts[editorDraft];
    get().setDraftCharacter(editorDraft, 'character-green', { preserveContent: true });
    expect(get().drafts[editorDraft].generation.status).toBe('complete');
    expect(get().drafts[editorDraft].diary.blocks[0].id).toBe(before.diary.blocks[0].id);

    const wizardDraft = generateNew();
    get().setDraftCharacter(wizardDraft, 'character-green');
    expect(get().drafts[wizardDraft].generation.status).toBe('idle');
    expect(get().drafts[wizardDraft].generation.progress).toBe(0);
  });

  test('DIA-004 replacing the character keeps the working draft content and photo references intact', () => {
    const { get, selectors } = createContext();
    const originalDiary = cloneDiary(selectors.getDiaryById('diary-1')!);
    const draftId = get().beginEdit('diary-1')!;
    const textBlock = get().drafts[draftId].diary.blocks.find(block => block.type === 'text');
    if (!textBlock || !('content' in textBlock)) {
      throw new Error('expected text block in edit draft');
    }

    get().updateDraft(draftId, { title: '换排版师前保留的标题' });
    get().updateDraftBlock(draftId, textBlock.id, '换排版师前保留的正文');
    get().setDraftBlockPhotos(draftId, textBlock.id, ['photo-1', 'photo-2']);
    const before = JSON.parse(JSON.stringify(get().drafts[draftId]));

    get().setDraftCharacter(draftId, 'character-green', { preserveContent: true });

    const updated = get().drafts[draftId];
    const updatedTextBlock = updated.diary.blocks.find(block => block.id === textBlock.id);

    expect(updated.diary.characterId).toBe('character-green');
    expect(updated.diary.title).toBe('换排版师前保留的标题');
    expect(updated.diary.summary).toBe(before.diary.summary);
    expect(updated.selectedPhotoIds).toEqual(before.selectedPhotoIds);
    expect(updated.diary.photoIds).toEqual(before.diary.photoIds);
    expect(updated.diary.coverPhotoId).toBe(before.diary.coverPhotoId);
    expect(updated.diary.posterPhotoIds).toEqual(before.diary.posterPhotoIds);
    expect(updatedTextBlock && 'content' in updatedTextBlock ? updatedTextBlock.content : undefined).toBe('换排版师前保留的正文');
    expect(updatedTextBlock && 'photoIds' in updatedTextBlock ? updatedTextBlock.photoIds : undefined).toEqual(['photo-1', 'photo-2']);
    expect(updated.generation.status).toBe(before.generation.status);
    expect(selectors.getDiaryById('diary-1')).toEqual(originalDiary);
  });

  test('DIA-004 saving a replaced character updates the same diary id without duplicating the entry', () => {
    const { get, selectors } = createContext();
    const beforeCount = get().diaries.length;
    const draftId = get().beginEdit('diary-1')!;
    const beforeSaved = cloneDiary(selectors.getDiaryById('diary-1')!);
    const textBlock = get().drafts[draftId].diary.blocks.find(block => block.type === 'text');
    if (!textBlock || !('content' in textBlock)) {
      throw new Error('expected text block in edit draft');
    }

    get().updateDraft(draftId, { title: '保存后切换到新的排版师' });
    get().updateDraftBlock(draftId, textBlock.id, '保存后仍保留的正文内容');
    get().setDraftCharacter(draftId, 'character-brown', { preserveContent: true });

    const savedId = get().saveDraft(draftId);
    const saved = selectors.getDiaryById('diary-1')!;
    const savedTextBlock = saved.blocks.find(block => block.id === textBlock.id);

    expect(savedId).toBe('diary-1');
    expect(get().diaries.length).toBe(beforeCount);
    expect(saved.characterId).toBe('character-brown');
    expect(saved.title).toBe('保存后切换到新的排版师');
    expect(saved.photoIds).toEqual(beforeSaved.photoIds);
    expect(saved.coverPhotoId).toBe(beforeSaved.coverPhotoId);
    expect(saved.posterPhotoIds).toEqual(beforeSaved.posterPhotoIds);
    expect(savedTextBlock && 'content' in savedTextBlock ? savedTextBlock.content : undefined).toBe('保存后仍保留的正文内容');
    expect(saved.blocks.every(block => block.type !== 'photo' || saved.photoIds.includes(block.photoId))).toBe(true);
  });

  test('E11 CASE-BAS-004-002 all four privacy settings save atomically; empty public selection is rejected', () => {
    const { get, selectors } = createContext();
    const original = selectors.getDiaryById('diary-1')!;
    expect(get().savePrivacy('diary-1', 'anonymous', [])).toBe(false);
    expect(selectors.getDiaryById('diary-1')).toBe(original);
    for (const privacy of ['private', 'anonymous', 'public-likes', 'public-comments'] as const) {
      expect(get().savePrivacy('diary-1', privacy, ['block-1'])).toBe(true);
      expect(selectors.getDiaryById('diary-1')?.privacy).toBe(privacy);
    }
    expect(get().savePrivacy('missing', 'private')).toBe(false);
  });

  test('SHR-001 persists diary visibility through the repository and updates only the target diary on success', async () => {
    const updateDiaryVisibilityHandler: NonNullable<CoreDiaryRepository['updateDiaryVisibility']> = async input => ({
      ok: true as const,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: input.diaryId,
        privacy: input.privacy,
        publicBlockIds: input.publicBlockIds,
      },
    });
    const updateDiaryVisibility = jest.fn(updateDiaryVisibilityHandler);
    const repository = createRepository({ updateDiaryVisibility });
    const isolatedStore = createAppStore(createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-visibility-test`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    }));

    const otherBefore = isolatedStore.getState().diaries.find(item => item.id === 'diary-2');
    const result = await isolatedStore.getState().setDiaryVisibility('diary-1', 'public-comments', ['block-1']);

    expect(result).toEqual({
      ok: true,
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    expect(updateDiaryVisibility).toHaveBeenCalledTimes(1);
    expect(updateDiaryVisibility).toHaveBeenCalledWith({
      diaryId: 'diary-1',
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    expect(isolatedStore.getState().diaries.find(item => item.id === 'diary-1')).toMatchObject({
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    expect(otherBefore).toEqual(isolatedStore.getState().diaries.find(item => item.id === 'diary-2'));
  });

  test('SHR-001 deduplicates repeated visibility saves and keeps the old value when remote saving fails', async () => {
    type VisibilityRemoteResult = RemoteResult<{
      diaryId: string;
      privacy: string;
      publicBlockIds?: string[];
    }>;
    const deferred = createDeferred<VisibilityRemoteResult>();
    const updateDiaryVisibility: NonNullable<CoreDiaryRepository['updateDiaryVisibility']> = jest.fn(() => deferred.promise);
    const repository = createRepository({ updateDiaryVisibility });
    const store = createAppStore(createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-visibility-dedupe`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    }));

    const first = store.getState().setDiaryVisibility('diary-1', 'public-comments', ['block-1']);
    const second = store.getState().setDiaryVisibility('diary-1', 'public-comments', ['block-1']);

    expect(updateDiaryVisibility).toHaveBeenCalledTimes(1);

    deferred.resolve({
      ok: false,
      version: CORE_DIARY_CONTRACT_VERSION,
      error: {
        code: 'provider_failed',
        message: 'sharing save failed',
        retryable: false,
      },
    });

    await expect(first).resolves.toEqual({
      ok: false,
      reason: 'save_failed',
      message: '公开范围保存失败，请稍后重试。',
    });
    await expect(second).resolves.toEqual({
      ok: false,
      reason: 'save_failed',
      message: '公开范围保存失败，请稍后重试。',
    });
    expect(store.getState().diaries.find(item => item.id === 'diary-1')).toMatchObject({
      privacy: 'private',
      publicBlockIds: undefined,
    });
  });

  test('SHR-001 late visibility results stay bound to the original diary and never overwrite another target', async () => {
    type VisibilityRemoteResult = RemoteResult<{
      diaryId: string;
      privacy: string;
      publicBlockIds?: string[];
    }>;
    const deferredDiary1 = createDeferred<VisibilityRemoteResult>();
    const deferredDiary2 = createDeferred<VisibilityRemoteResult>();
    const updateDiaryVisibility: NonNullable<CoreDiaryRepository['updateDiaryVisibility']> = jest.fn(async input => {
      if (input.diaryId === 'diary-1') {
        return deferredDiary1.promise;
      }
      return deferredDiary2.promise;
    });
    const repository = createRepository({ updateDiaryVisibility });
    const store = createAppStore(createDefaultAppStoreDeps({
      now: () => 1_700_000_000_000,
      createId: prefix => `${prefix}-visibility-race`,
      adapters: {
        diaryRepository: repository,
        memoriesRepository: repository,
      },
    }));
    const diary2PublicBlockId = store.getState().diaries
      .find(item => item.id === 'diary-2')
      ?.blocks.find(block => block.type !== 'photo')?.id;

    expect(diary2PublicBlockId).toBeTruthy();

    const diary1Save = store.getState().setDiaryVisibility('diary-1', 'public-comments', ['block-1']);
    const diary2Save = store.getState().setDiaryVisibility('diary-2', 'public-likes', [diary2PublicBlockId!]);

    deferredDiary2.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: 'diary-2',
        privacy: 'public-likes',
        publicBlockIds: [diary2PublicBlockId!],
      },
    });
    await expect(diary2Save).resolves.toEqual({
      ok: true,
      privacy: 'public-likes',
      publicBlockIds: [diary2PublicBlockId!],
    });

    deferredDiary1.resolve({
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: 'diary-1',
        privacy: 'public-comments',
        publicBlockIds: ['block-1'],
      },
    });
    await expect(diary1Save).resolves.toEqual({
      ok: true,
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });

    expect(store.getState().diaries.find(item => item.id === 'diary-1')).toMatchObject({
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    expect(store.getState().diaries.find(item => item.id === 'diary-2')).toMatchObject({
      privacy: 'public-likes',
      publicBlockIds: [diary2PublicBlockId!],
    });
  });

  test('E12 CASE-BAS-004-005 selection projection removes excluded paragraphs, photos, cover and summary', () => {
    const diary = mockDiaries[0];
    const projected = projectDiaryForSharing({ ...diary, privacy: 'public-comments', publicBlockIds: ['block-5'] });
    expect(projected.blocks.map(block => block.id)).toEqual(['block-5']);
    expect(projected.photoIds).toEqual(['photo-3']);
    expect(projected.coverPhotoId).toBe('photo-3');
    expect(projected.posterPhotoIds).toEqual(['photo-3']);
    expect(projected.summary.includes('赤崁楼')).toBe(false);
    expect(projected.summary).toMatch(/安平/);
    expect(projected.helperMessage).toBe('');

    const quote = projectDiaryForSharing({ ...diary, privacy: 'public-comments', publicBlockIds: ['block-6'] });
    expect(quote.coverPhotoId).toBe('');
    expect(quote.photoIds.length).toBe(0);
    expect(quote.posterPhotoIds).toEqual([]);
  });

  test('E12 CASE-SHR-002-005 selection projection deduplicates valid paragraph ids and ignores unknown or photo block ids', () => {
    const diary = mockDiaries[0];
    const projected = projectDiaryForSharing({
      ...diary,
      privacy: 'public-comments',
      publicBlockIds: ['block-1', 'block-1', 'block-2', 'missing-block'],
    });

    expect(projected.publicBlockIds).toEqual(['block-1']);
    expect(projected.blocks.map(block => block.id)).toEqual(['block-1', 'block-2']);
    expect(projected.photoIds).toEqual(['photo-1', 'photo-11']);
    expect(projected.coverPhotoId).toBe('photo-1');
    expect(projected.posterPhotoIds).toEqual(['photo-1', 'photo-11']);
    expect(projected.summary.includes('赤崁楼')).toBe(true);
    expect(projected.summary.includes('安平')).toBe(false);
  });

  test('E13 CASE-BAS-004-005 anonymous projection redacts companion names including captions and retains face metadata', () => {
    const diary = mockDiaries[0];
    const projected = projectDiaryForSharing({ ...diary, title: '和小林的台南日记', privacy: 'anonymous', publicBlockIds: ['block-1'] });
    expect(projected.anonymous).toBe(true);
    expect(projected.people?.length).toBe(0);
    expect(projected.companionName).toBe('同行人');
    expect(JSON.stringify(projected).includes('小林')).toBe(false);
    expect(projected.photoIds).toEqual(['photo-1', 'photo-11']);
    expect(mockPhotos.find(photo => photo.id === 'photo-11')?.faceRects?.length).toBeTruthy();

    const selfNamed = projectDiaryForSharing({ ...diary, privacy: 'anonymous', title: '我叫小美，和云一起旅行', companionName: '云', people: [{ id: 'person-self', name: '小美', avatarPhotoId: 'photo-11', photoIds: ['photo-11'] }] });
    expect(selfNamed.title.includes('小美')).toBe(false);
    expect(selfNamed.title.includes('云')).toBe(false);

    const punctuationNamed = projectDiaryForSharing({ ...diary, privacy: 'anonymous', title: 'a+b 的台南日记', companionName: 'a+b', publicBlockIds: ['block-1'] });
    expect(punctuationNamed.title.includes('a+b')).toBe(false);
  });

  test('E14 CASE-BAS-004-005 private preview remains whole; platform shares and exports use separate history', () => {
    const { get, selectors } = createContext();
    const diary = mockDiaries[0];
    const projected = projectDiaryForSharing({ ...diary, privacy: 'private', publicBlockIds: ['block-5'] });
    expect(projected.blocks.length).toBe(diary.blocks.length);
    expect(get().recordShareDemo('diary-1', 'wechat')).toBe(false);
    expect(get().recordShareDemo('diary-1', 'x')).toBe(false);
    expect(get().recordShareDemo('diary-1', 'save')).toBe(true);
    expect(get().recordShareDemo('diary-1', 'pdf')).toBe(true);
    let saved = selectors.getDiaryById('diary-1')!;
    expect(saved.shareModes).toEqual([]);
    expect(saved.exportedPdf).toBe(true);
    expect(saved.exportedImage).toBe(true);
    get().savePrivacy('diary-1', 'public-likes');
    expect(get().recordShareDemo('diary-1', 'wechat')).toBe(true);
    saved = selectors.getDiaryById('diary-1')!;
    expect(saved.shareModes).toEqual(['wechat']);
    expect(saved.exportModes).toEqual(['save', 'pdf']);
  });

  test('SHR-005 confirmed delivery records once per operation id and keeps share/export history separated', () => {
    const { get, selectors } = createContext();
    const version = selectors.getDiaryById('diary-1')?.version ?? 0;

    expect(get().confirmShareDelivery({
      diaryId: 'diary-1',
      mode: 'save',
      version,
      operationId: 'share-op-save-1',
    })).toBe(true);
    expect(get().confirmShareDelivery({
      diaryId: 'diary-1',
      mode: 'save',
      version,
      operationId: 'share-op-save-1',
    })).toBe(true);
    expect(get().confirmShareDelivery({
      diaryId: 'diary-1',
      mode: 'pdf',
      version,
      operationId: 'share-op-pdf-1',
    })).toBe(true);
    get().savePrivacy('diary-1', 'public-likes');
    expect(get().confirmShareDelivery({
      diaryId: 'diary-1',
      mode: 'wechat',
      version,
      operationId: 'share-op-wechat-1',
    })).toBe(true);

    const saved = selectors.getDiaryById('diary-1')!;
    expect(saved.shareModes).toEqual(['wechat']);
    expect(saved.exportModes).toEqual(['save', 'pdf']);
    expect(saved.exportedImage).toBe(true);
    expect(saved.exportedPdf).toBe(true);
  });

  test('SHR-005 ignores stale or mismatched confirmed delivery callbacks', () => {
    const { get, selectors, store } = createContext();
    const version = selectors.getDiaryById('diary-1')?.version ?? 0;

    expect(get().confirmShareDelivery({
      diaryId: 'diary-1',
      mode: 'save',
      version: version + 1,
      operationId: 'share-op-save-stale',
    })).toBe(false);
    store.setState(state => ({
      diaries: state.diaries.map(item => item.id !== 'diary-1' ? item : {
        ...item,
        privacy: 'public-comments',
      }),
    }));
    expect(get().confirmShareDelivery({
      diaryId: 'diary-1',
      mode: 'wechat',
      version,
      operationId: 'share-op-mismatch',
    })).toBe(true);
    expect(get().confirmShareDelivery({
      diaryId: 'diary-2',
      mode: 'wechat',
      version,
      operationId: 'share-op-mismatch',
    })).toBe(false);

    const diaryOne = selectors.getDiaryById('diary-1')!;
    const diaryTwo = selectors.getDiaryById('diary-2')!;
    expect(diaryOne.shareModes).toEqual(['wechat']);
    expect(diaryTwo.shareModes).toEqual([]);
    expect(diaryOne.exportModes ?? []).toEqual([]);
  });

  test('E15 CASE-BAS-004-002 history derives groups from current records, baseline is central, helper interactions are local', () => {
    const { get } = createContext();
    expect(getHistoryGroups([]).length).toBe(0);
    expect(getDiaryStatistics(mockDiaries)).toEqual({ diaries: 47, photos: 128, days: 86, companions: 3 });
    const groups = getHistoryGroups(mockDiaries);
    expect(groups.flatMap(group => group.diaryIds).length).toBe(mockDiaries.length);
    const messages = get().chatMessages.length;
    get().sendChat('今天很累');
    expect(get().chatMessages.length).toBe(messages + 2);
    get().sendChat('  ');
    expect(get().chatMessages.length).toBe(messages + 2);
    get().toggleDiscoveryLike('post-1');
    expect(get().likedDiscoveryIds).toEqual(['post-1']);
    get().toggleDiscoveryLike('post-1');
    expect(get().likedDiscoveryIds).toEqual([]);
    get().correctAnchor('anchor-1', '更喜欢安静的海边');
    expect(get().correctedAnchors['anchor-1']).toBe('更喜欢安静的海边');
    get().setFlowerUnlocked(true);
    expect(get().flowerUnlocked).toBe(true);
  });
});
