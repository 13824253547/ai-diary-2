/** Development-only deterministic scenes used for simulator visual acceptance. */
import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../src/components/layout/screen';
import { Empty } from '../src/components/common/design-ui';
import { useAppStore } from '../src/store/use-app-store';

export default function Verification() {
  const { scene = 'home' } = useLocalSearchParams<{ scene?: string }>();
  const router = useRouter();
  const last = useRef('');

  useEffect(() => {
    if (!__DEV__ || last.current === scene) return;
    last.current = scene;
    const st = useAppStore.getState();
    const routes: Record<string, string> = {
      home: '/(tabs)/home',
      library: '/library',
      pet: '/(tabs)/pet',
      memories: '/(tabs)/memories',
      postcard: '/postcard',
      discover: '/(tabs)/discover',
      profile: '/(tabs)/profile',
      growth: '/profile/insights',
      anchors: '/profile/anchors',
      flowers: '/profile/flowers',
      report: '/profile/report',
      invalid: '/diary/not-found',
    };
    const existingDiary = st.diaries.find(diary => diary.status === 'ready');
    if (existingDiary) {
      const diaryId = encodeURIComponent(existingDiary.id);
      routes.complete = `/create/complete?diaryId=${diaryId}`;
      routes.detail = `/diary/${diaryId}`;
      routes.privacy = `/share/privacy?diaryId=${diaryId}`;
      routes.share = `/share/result?diaryId=${diaryId}`;
    }

    if (routes[scene]) {
      router.replace(routes[scene] as never);
      return;
    }

    if (scene === 'permission') {
      const id = st.beginCreation();
      router.replace('/(tabs)/home');
      setTimeout(() => router.push({ pathname: '/permission/photos', params: { draftId: id } }), 150);
      return;
    }

    if (['naming', 'edit'].includes(scene)) {
      const draftId = st.activeDraftId;
      const draft = draftId ? st.drafts[draftId] : undefined;
      if (!draft || draft.diary.blocks.length === 0) {
        const id = draftId ?? st.beginCreation();
        router.replace({ pathname: '/album/select', params: { draftId: id } });
        return;
      }
      router.replace({
        pathname: scene === 'naming' ? '/companion/naming' : '/diary/new/edit',
        params: { draftId: draft.id },
      });
      return;
    }

    const id = st.beginCreation();
    if (scene === 'empty-photos') st.setDraftPhotos(id, []);
    const flow: Record<string, string> = {
      album: '/album/select',
      'empty-photos': '/album/select',
      template: '/create/template',
      character: '/create/character',
      generating: '/create/generating',
    };
    if (flow[scene]) {
      router.replace({ pathname: flow[scene] as never, params: { draftId: id } });
    } else {
      router.replace('/(tabs)/home');
    }
  }, [scene, router]);

  return (
    <Screen>
      <Empty title={__DEV__ ? '正在准备验收页面' : '页面不存在'} home />
    </Screen>
  );
}
