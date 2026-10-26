import { createAppSelectors, createAppStore, createDefaultAppStoreDeps, type AppStoreDeps } from '../store/create-app-store';
import { mockDiaries } from '../mocks/diaries';
import { mockPhotos } from '../mocks/photos';
import { createMockChatReplyProvider } from '../services/chat-reply-provider';
import { createMockAIImageGenerationProvider } from '../services/ai-image-generation-provider';
import { createMockInsightReportProvider } from '../services/insight-report-provider';

export function createTestStore(overrides: Partial<AppStoreDeps> = {}) {
  let nextSequence = 1;
  const deps = createDefaultAppStoreDeps({
    ...overrides,
    photos: overrides.photos ?? mockPhotos,
    diaries: overrides.diaries ?? mockDiaries,
    chatReplyProvider: overrides.chatReplyProvider ?? createMockChatReplyProvider(),
    aiImageGenerationProvider: overrides.aiImageGenerationProvider ?? createMockAIImageGenerationProvider(),
    insightReportProvider: overrides.insightReportProvider ?? createMockInsightReportProvider(),
    now: overrides.now ?? (() => 1_700_000_000_000),
    createId: overrides.createId ?? (prefix => `${prefix}-test-${nextSequence++}`),
    diaryPhotoUploadPreparer: overrides.diaryPhotoUploadPreparer ?? (async (photoIds, photos) =>
      photoIds.map(photoId => {
        const photo = photos.find(item => item.id === photoId);
        if (!photo) throw new Error(`missing photo fixture: ${photoId}`);
        return {
          photoId,
          uri: `file:///synthetic-test-photos/${encodeURIComponent(photoId)}.jpg`,
          mimeType: 'image/jpeg',
          title: photo.title,
          location: photo.location,
          date: photo.date,
        };
      })),
  });
  const store = createAppStore(deps);
  const selectors = createAppSelectors(store, deps);

  return { store, selectors, deps };
}
