import {Alert} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useAppStore} from '../store/use-app-store';
export function useDraftRoute(){const params=useLocalSearchParams<{draftId?:string;id?:string;mode?:string;openPhotos?:string}>();const router=useRouter();const draft=useAppStore(s=>params.draftId?s.drafts[params.draftId]:undefined);return {params,router,draft};}
export function useDiaryRoute(){const params=useLocalSearchParams<{id?:string;diaryId?:string}>();const id=params.id??params.diaryId;const diary=useAppStore(s=>s.diaries.find(d=>d.id===id));return {diary,diaryId:id,router:useRouter()};}
export function leaveDraft(draftId:string,done:()=>void){const s=useAppStore.getState();if(!s.drafts[draftId]||s.drafts[draftId].savedDiaryId)return done();Alert.alert('放弃未保存的日记？','这次编辑尚未保存。',[{text:'继续编辑',style:'cancel'},{text:'放弃',style:'destructive',onPress:()=>{s.discardDraft(draftId);done()}}]);}
