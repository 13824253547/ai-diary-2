import type { PrivacyOption } from '../types/share';
export const privacyOptions: PrivacyOption[] = [
  { id: 'private', title: '私密', description: '只留给自己，珍藏每一个真实的瞬间' },
  { id: 'anonymous', title: '匿名公开', description: '隐藏你的名字与照片中的人物面容' },
  { id: 'public-likes', title: '公开 · 仅点赞', description: '让美好被看见，只接收温柔的点赞' },
  { id: 'public-comments', title: '公开 · 可评论', description: '分享你的故事，也听听大家的声音' },
];
