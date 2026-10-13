import { art } from '../theme/assets';
import type { DiaryPhoto } from '../types/diary';
export const mockPhotos: DiaryPhoto[] = [
  { id: 'photo-1', title: '赤崁楼的午后', location: '台南 · 赤崁楼', emoji: '⛩', color: '#ECE2CF', date: '2024.09.12', image: art.temple },
  { id: 'photo-2', title: '神农街慢慢走', location: '台南 · 神农街', emoji: '🏮', color: '#DFD6B8', date: '2024.09.12', image: art.street },
  { id: 'photo-3', title: '夕阳落在海上', location: '台南 · 安平', emoji: '🌅', color: '#F2D6BD', date: '2024.09.12', image: art.sunset },
  { id: 'photo-4', title: '一碗台南味道', location: '台南 · 老街', emoji: '🍜', color: '#F4E1D1', date: '2024.09.13', image: art.food },
  { id: 'photo-5', title: '巷子里的咖啡馆', location: '台南 · 中西区', emoji: '☕', color: '#DBD2C6', date: '2024.09.13', image: art.cafe },
  { id: 'photo-6', title: '一束小小的花', location: '台南 · 花店', emoji: '🌼', color: '#E7DDB8', date: '2024.09.13', image: art.flowers },
  { id: 'photo-7', title: '远山与云', location: '台南 · 郊外', emoji: '⛰', color: '#D4DFD8', date: '2024.09.13', image: art.mountain },
  { id: 'photo-8', title: '把海风装进口袋', location: '台南 · 渔光岛', emoji: '🌊', color: '#CDDFE2', date: '2024.09.14', image: art.sea },
  { id: 'photo-9', title: '城市的晚灯', location: '台南 · 夜市', emoji: '✨', color: '#D9CCD4', date: '2024.09.14', image: art.night },
  { id: 'photo-10', title: '下一站，回忆', location: '台南 · 火车站', emoji: '🚃', color: '#CFE0D7', date: '2024.09.14', image: art.train },
  { id: 'photo-11', title: '镜头里的自己', location: '台南 · 老街', emoji: '📷', color: '#ECD5C8', date: '2024.09.14', image: art.personSelf, personIds: ['person-self'], faceRects: [{ x: 0.28, y: 0.09, width: 0.45, height: 0.48 }] },
  { id: 'photo-12', title: '一起旅行的人', location: '台南 · 老街', emoji: '📸', color: '#E8DCD0', date: '2024.09.14', image: art.personFriend, personIds: ['person-friend'], faceRects: [{ x: 0.28, y: 0.07, width: 0.46, height: 0.49 }] },
  { id: 'photo-13', title: '蓝白色的夏天', location: '圣托里尼', emoji: '🏝', color: '#D9E8EC', date: '2026.08.20', image: art.santorini },
  { id: 'photo-14', title: '清晨的热气球', location: '卡帕多奇亚', emoji: '🎈', color: '#E9D7C9', date: '2026.08.15', image: art.balloons },
  { id: 'photo-15', title: '湖边的小镇', location: '因特拉肯', emoji: '🏞', color: '#D7E7E4', date: '2026.08.10', image: art.lake },
  { id: 'photo-16', title: '黄昏海岸线', location: '高雄 · 西子湾', emoji: '🌇', color: '#EAD6C3', date: '2026.08.09', image: art.coastalSunset },
  { id: 'photo-17', title: '蓝色小屋前', location: '海边小镇', emoji: '🏠', color: '#DDE7F2', date: '2026.08.08', image: art.blueHouse },
  { id: 'photo-18', title: '一起吃晚饭', location: '台南 · 餐馆', emoji: '🍽', color: '#E7D8CC', date: '2026.08.07', image: art.restaurant },
  { id: 'photo-19', title: '甜点收尾', location: '台南 · 甜品店', emoji: '🍮', color: '#F1DFC9', date: '2026.08.07', image: art.dessert },
  { id: 'photo-20', title: '清晨问候', location: '旅途清晨', emoji: '☀️', color: '#F3E2C7', date: '2026.08.06', image: art.morning },
];
