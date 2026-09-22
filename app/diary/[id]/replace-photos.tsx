import {useEffect} from 'react';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useAppStore} from '../../../src/store/use-app-store';
import {Screen} from '../../../src/components/layout/screen';
import {Empty} from '../../../src/components/common/design-ui';
export default function ReplacePhotos(){const {id,draftId}=useLocalSearchParams<{id:string;draftId?:string}>();const router=useRouter();useEffect(()=>{const d=draftId??useAppStore.getState().beginEdit(id);if(d)router.replace({pathname:'/diary/[id]/edit',params:{id,draftId:d,openPhotos:'1'}})},[id,draftId]);return <Screen><Empty title="正在打开日记" home/></Screen>}
