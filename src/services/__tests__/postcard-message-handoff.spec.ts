import {
  consumePostcardMessageHandoff,
  createPostcardMessageHandoff,
} from '../postcard-message-handoff';

describe('postcard message handoff', () => {
  test('delivers a greeting only once for the matching photo and location', () => {
    const token = createPostcardMessageHandoff('photo-1', '苏州', '湖畔晚风');

    expect(consumePostcardMessageHandoff(token, 'photo-1', '苏州')).toBe('湖畔晚风');
    expect(consumePostcardMessageHandoff(token, 'photo-1', '苏州')).toBeUndefined();
  });

  test('rejects a handoff for a different photo or location', () => {
    const token = createPostcardMessageHandoff('photo-1', '苏州', '湖畔晚风');

    expect(consumePostcardMessageHandoff(token, 'photo-2', '苏州')).toBeUndefined();
    expect(consumePostcardMessageHandoff(token, 'photo-1', '杭州')).toBeUndefined();
  });

  test('expires unused greetings from the in-memory cache', () => {
    jest.useFakeTimers();
    try {
      const token = createPostcardMessageHandoff('photo-1', '苏州', '湖畔晚风');
      jest.advanceTimersByTime(2 * 60 * 1000);
      expect(consumePostcardMessageHandoff(token, 'photo-1', '苏州')).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
