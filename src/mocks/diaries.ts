import type { DiaryItem, HistoryGroup } from '../types/diary';

export const mockDiaries: DiaryItem[] = [
  {
    id: 'diary-1', type: 'travel', status: 'ready', title: '台南慢游日记',
    subtitle: '那些被日光晒暖的旧时光', location: '台南', date: '2024.09.12–09.14',
    summary: '在台南的巷弄里，把脚步放慢，也把日子过得柔软。',
    helperMessage: '原来旅行的意义，就藏在这些不经意的小美好里。',
    characterId: 'character-blue', companionName: '小林', privacy: 'private',
    photoIds: ['photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5', 'photo-11', 'photo-12'],
    coverPhotoId: 'photo-1', posterPhotoIds: ['photo-2', 'photo-3'], exportedImage: false, exportedPdf: false, shareModes: [], exportModes: [],
    people: [
      { id: 'person-self', name: '我', avatarPhotoId: 'photo-11', photoIds: ['photo-11'] },
      { id: 'person-friend', name: '小林', avatarPhotoId: 'photo-12', photoIds: ['photo-12'] },
    ],
    blocks: [
      { id: 'block-1', type: 'text', title: '在古城里，把时间放慢', content: '九月的台南，阳光还是暖暖的。和小林沿着赤崁楼的红墙慢慢走，树影落在脚边，连风都有了老城的味道。', photoIds: ['photo-1', 'photo-11'] },
      { id: 'block-2', type: 'photo', photoId: 'photo-1', caption: '红墙、绿树和不着急的午后。', relatedBlockId: 'block-1' },
      { id: 'block-3', type: 'text', title: '巷弄里的小确幸', content: '钻进神农街的小巷，偶遇一家安静的咖啡馆。一碗热热的担仔面，一杯冰拿铁，就是今天最满足的时刻。小林说，这样不赶路的旅行真好。', photoIds: ['photo-2', 'photo-4', 'photo-5', 'photo-12'] },
      { id: 'block-4', type: 'photo', photoId: 'photo-2', caption: '把巷子里的日常，装进相机。', relatedBlockId: 'block-3' },
      { id: 'block-5', type: 'text', title: '日落之前，再走一小段', content: '傍晚去了安平，海风轻轻吹过来。我们坐在堤岸边看太阳一点点落下，没说什么，却觉得这一天已经很完整。', photoIds: ['photo-3'] },
      { id: 'block-6', type: 'quote', content: '旅行不是走了多远，而是把日子过慢了一点。', relatedBlockId: 'block-5' },
    ],
  },
  {
    id: 'diary-2', type: 'travel', status: 'ready', title: '沿着海岸，听一整天的风', subtitle: '一封寄给夏天的明信片',
    location: '北海银滩', date: '2026.09.18', summary: '海风和日落，是今天最温柔的礼物。', helperMessage: '你总能发现日常里闪光的瞬间。',
    characterId: 'character-green', companionName: '阿欣', privacy: 'public-likes', photoIds: ['photo-8', 'photo-3'], coverPhotoId: 'photo-8',
    exportedImage: false, exportedPdf: false, shareModes: [], exportModes: [],
    blocks: [
      { id: 'sea-1', type: 'text', title: '海风来信', content: '和阿欣坐在海边，看浪花一遍遍抚过沙滩。不必安排什么，今天就交给海风。', photoIds: ['photo-8'] },
      { id: 'sea-2', type: 'photo', photoId: 'photo-8', caption: '蓝色的海，慢慢的我们。', relatedBlockId: 'sea-1' },
      { id: 'sea-3', type: 'quote', content: '有些日子，只要记得快乐就好。', photoIds: ['photo-3'] },
    ],
  },
  {
    id: 'diary-3', type: 'emotion', status: 'ready', title: '给平凡日子的一束花', subtitle: '生活感悟', location: '上海', date: '2026.09.15',
    summary: '路过花店的时候，给自己买了一束小雏菊。', helperMessage: '照顾好自己的小情绪，也是一件了不起的事。',
    characterId: 'character-brown', companionName: '自己', privacy: 'private', photoIds: ['photo-6', 'photo-5'], coverPhotoId: 'photo-6',
    exportedImage: false, exportedPdf: false, shareModes: [], exportModes: [],
    blocks: [{ id: 'flower-1', type: 'text', title: '一点小小的仪式感', content: '下班时路过花店，给自己带回一束小雏菊。泡一杯咖啡，把窗户打开，疲惫的心也慢慢松了下来。', photoIds: ['photo-6', 'photo-5'] }],
  },
  {
    id: 'diary-4', type: 'travel', status: 'ready', title: '夜市灯光和晚霞一起亮起来', subtitle: '平凡的热闹最动人', location: '杭州', date: '2026.08.27',
    summary: '没有特别赶路的一晚，却把快乐收得很满。', helperMessage: '把这一晚的烟火气，好好收藏。', characterId: 'character-green', companionName: '小宇',
    privacy: 'public-comments', photoIds: ['photo-9', 'photo-4'], coverPhotoId: 'photo-9', exportedImage: false, exportedPdf: false, shareModes: [], exportModes: [],
    blocks: [{ id: 'night-1', type: 'text', title: '人间烟火', content: '和小宇穿过亮起灯的街道，买了喜欢的小吃。在人声鼎沸的夜市里，快乐也变得具体起来。', photoIds: ['photo-9', 'photo-4'] }],
  },

  {
    id: 'diary-5', type: 'travel', status: 'ready', title: '蓝白之间，住着一个夏天', subtitle: '圣托里尼的海风来信', location: '圣托里尼', date: '2026.08.20',
    summary: '沿着白色的阶梯走向海，蓝色穹顶下，阳光落满了肩头。', helperMessage: '你把世界的色彩，好好收进了回忆。', characterId: 'character-green', companionName: '阿欣',
    privacy: 'public-likes', photoIds: ['photo-13', 'photo-8'], coverPhotoId: 'photo-13', exportedImage: false, exportedPdf: false, shareModes: [], exportModes: [],
    blocks: [{ id: 'island-1', type: 'text', title: '蓝与白', content: '圣托里尼的午后有一种明亮的安静。白墙、蓝顶和海浪，一起组成了夏天的样子。和阿欣坐在露台上，直到太阳染红了海。', photoIds: ['photo-13', 'photo-8'] }],
  },
  {
    id: 'diary-6', type: 'travel', status: 'ready', title: '追着热气球，迎接清晨', subtitle: '在云端遇见新的自己', location: '卡帕多奇亚', date: '2026.08.15',
    summary: '在黎明里升起的热气球，像一个个轻盈的愿望。', helperMessage: '每一次出发，都是一次新的生长。', characterId: 'character-brown', companionName: '自己',
    privacy: 'public-comments', photoIds: ['photo-14', 'photo-7'], coverPhotoId: 'photo-14', exportedImage: false, exportedPdf: false, shareModes: [], exportModes: [],
    blocks: [{ id: 'balloon-1', type: 'text', title: '清晨出发', content: '天还没有完全亮，热气球已经缓缓升空。山谷被晨光染成金色，忽然觉得那些烦恼都变小了。新的一天，也要轻盈一点。', photoIds: ['photo-14', 'photo-7'] }],
  },


  {
    id: 'diary-7', type: 'travel', status: 'ready', title: '在阿尔卑斯山，把心放空', subtitle: '瑞士山间的三日来信', location: '瑞士', date: '2026.08.10',
    summary: '沿着山间小路慢慢走，远山、湖水和牛铃，让心安静下来。', helperMessage: '安静也是一种力量。', characterId: 'character-brown', companionName: '自己',
    privacy: 'public-likes', photoIds: ['photo-7', 'photo-8'], coverPhotoId: 'photo-7', exportedImage: false, exportedPdf: false, shareModes: [], exportModes: [],
    blocks: [{ id: 'swiss-1', type: 'text', title: '山间呼吸', content: '晨雾慢慢散开，远山露出了轮廓。一个人沿着山路走，听风吹过草地和远处的牛铃。那些想不明白的事，好像也不急着找到答案了。', photoIds: ['photo-7', 'photo-8'] }],
  },

];

/** Legacy snapshot; live screens derive their groups from the current diaries. */
export const historyGroups: HistoryGroup[] = [
  { id: 'history-2026-09', label: '2026年9月', diaryIds: ['diary-2', 'diary-3'] },
  { id: 'history-2026-08', label: '2026年8月', diaryIds: ['diary-4'] },
  { id: 'history-2024-09', label: '2024年9月', diaryIds: ['diary-1'] },
];
