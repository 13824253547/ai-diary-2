import type { DiaryTypeOption, GenerationPhase } from '../types/creation';
export const diaryTypeOptions: DiaryTypeOption[] = [
  { id: 'travel', title: '旅行游记', subtitle: '把足迹写成故事', description: '让散落的照片，成为一段值得回味的旅程。', available: true, badge: '推荐', examples: ['城市漫游', '海边日落', '同伴出行'] },
  { id: 'work', title: '工作反思', subtitle: '即将上线', description: '记录成长的每一步，收集那些闪光的小小成就。', available: false, examples: ['项目复盘', '阶段回顾'] },
  { id: 'emotion', title: '情绪记录', subtitle: '即将上线', description: '好好安放今天的心情，也给自己一个拥抱。', available: false, examples: ['心情片段', '树洞记录'] },
];
export const generationPhases: GenerationPhase[] = [
  { id: 'phase-1', label: '照片整理完成', detail: '把散落的瞬间放在一起' },
  { id: 'phase-2', label: '旅途故事正在成形', detail: '串起风景、心情和同行的人' },
  { id: 'phase-3', label: '为你排版成日记', detail: '留住这份值得珍藏的美好' },
];
