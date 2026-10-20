export type ChatReplyRequest = {
  conversationId: string;
  requestId: string;
  attempt: number;
  text: string;
};

export type ChatReply = {
  text: string;
  source: 'mock' | 'provider';
  providerRequestId?: string;
};

export type ChatReplyProvider = {
  reply: (request: ChatReplyRequest) => ChatReply | Promise<ChatReply>;
};

export function createMockChatReplyProvider(): ChatReplyProvider {
  return {
    reply: ({ text }) => {
      const reply = /累|难过|伤心|烦|压力/.test(text)
        ? '辛苦啦。先停下来，深呼吸一下吧。我会陪着你，慢慢说就好。🍊'
        : /旅行|台南|照片|日记/.test(text)
          ? '听起来是一段值得收藏的回忆！把照片和小故事放进日记，下次翻开时，快乐还会再来一次。🍊'
          : /谢谢|开心|快乐|喜欢/.test(text)
            ? '听到你这样说，我也好开心。把这份小小的幸福记下来吧！🍊'
            : '嗯嗯，我在认真听。今天还有哪个瞬间，让你想多停留一会儿呢？🍊';

      return { text: reply, source: 'mock' };
    },
  };
}

export function createUnconfiguredChatReplyProvider(): ChatReplyProvider {
  return {
    reply: () => {
      throw new Error('chat reply provider is not configured');
    },
  };
}
