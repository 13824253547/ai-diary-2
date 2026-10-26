import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {Button} from '../../src/components/common/button';
import {Screen} from '../../src/components/layout/screen';
import {TopBar} from '../../src/components/layout/top-bar';
import {useDraftRoute} from '../../src/hooks/use-diary-flow';
import {listAvailableCharacters} from '../../src/services/character-catalog';
import type {DiaryCharacter} from '../../src/types/diary';
import {useAppStore} from '../../src/store/use-app-store';
import {colors} from '../../src/theme/tokens';
type CharacterCatalogState={status:'loading'|'ready'|'error';characters:DiaryCharacter[];error?:string};
export default function Character() {
  const { draft, params, router } = useDraftRoute();
  const locked = useRef(false);
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);
  const [catalog, setCatalog] = useState<CharacterCatalogState>({ status: 'loading', characters: [] });
  const currentCharacterId = draft?.diary.characterId;

  const loadCharacters = useCallback(async () => {
    const version = requestVersionRef.current + 1;
    requestVersionRef.current = version;
    setCatalog({ status: 'loading', characters: [] });
    try {
      const nextCharacters = await listAvailableCharacters();
      if (!mountedRef.current || requestVersionRef.current !== version) return;
      setCatalog({ status: 'ready', characters: nextCharacters });
    } catch (error) {
      if (!mountedRef.current || requestVersionRef.current !== version) return;
      setCatalog({
        status: 'error',
        characters: [],
        error: error instanceof Error && error.message
          ? error.message
          : '这次没把排版师目录读出来，请重新加载后再试。',
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadCharacters();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCharacters]);

  async function pick(id: string) {
    if (locked.current) return;
    locked.current = true;
    const store = useAppStore.getState();

    if (params.mode === 'browse' || !draft) {
      const draftId = store.beginCreation();
      store.setDraftCharacter(draftId, id);
      router.push({
        pathname: store.hasPhotoPermission ? '/album/select' : '/permission/photos',
        params: { draftId, characterSelected: 'true' },
      });
      return;
    }

    if (params.mode === 'replace') {
      if (draft.diary.characterId === id) {
        router.back();
        return;
      }
      const synced = await store.restartGenerationWithCharacter(draft.id, id);
      if (!synced) {
        locked.current = false;
        Alert.alert('暂时无法重新生成', '排版师信息未能同步，请检查网络后重试。');
        return;
      }
      router.replace({
        pathname: '/create/generating',
        params: { draftId: draft.id },
      });
      return;
    }

    store.setDraftCharacter(draft.id, id);
    router.push({ pathname: '/create/generating', params: { draftId: draft.id } });
  }

  return (
    <Screen
      header={(
        <TopBar
          title="今天让谁来帮你排？"
          subtitle="不同风格的排版师，帮你定制独一无二的日记"
          onBackPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')}
        />
      )}
    >
      {catalog.status === 'loading' && !catalog.characters.length ? (
        <View style={s.state}>
          <Text style={s.stateTitle}>正在加载排版师...</Text>
          <Text style={s.stateBody}>马上就好，请稍等一下。</Text>
        </View>
      ) : catalog.status === 'error' && !catalog.characters.length ? (
        <View style={s.state}>
          <Text style={s.stateTitle}>排版师目录暂时不可用</Text>
          <Text style={s.stateBody}>{catalog.error}</Text>
          <Button variant="secondary" label="重新加载" onPress={() => void loadCharacters()} />
        </View>
      ) : catalog.characters.map((character, index) => (
        <View key={character.id} style={s.card}>
          <View style={s.left}>
            <View style={s.row}>
              <Image source={character.image} style={s.character} resizeMode="contain" />
              <View style={s.copy}>
                <Text style={s.name}>{character.name}</Text>
                <Text style={[s.tag, { backgroundColor: ['#F8E4C8', '#E0E9EE', '#E7EAD2'][index] }]}>
                  {character.roleLabel}
                </Text>
                <Text style={s.description}>{character.description}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`选择${character.name}`}
              accessibilityState={{ selected: currentCharacterId === character.id }}
              onPress={() => void pick(character.id)}
              style={[s.choose, { backgroundColor: [colors.brandStrong, colors.blue, colors.green][index] }]}
            >
              <Text style={s.chooseText}>选择他</Text>
            </Pressable>
          </View>
          <Image source={character.posterImage} style={s.poster} resizeMode="contain" />
        </View>
      ))}
    </Screen>
  );
}
const s=StyleSheet.create({card:{flexDirection:'row',borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,borderRadius:17,padding:12,gap:7,minHeight:204},left:{flex:1,justifyContent:'space-between'},row:{flexDirection:'row',gap:7,alignItems:'center'},character:{width:78,height:141},copy:{flex:1,gap:10},name:{fontSize:18,fontWeight:'700',color:colors.textPrimary},tag:{fontSize:10,color:colors.textPrimary,borderRadius:8,padding:4,alignSelf:'flex-start'},description:{fontSize:11,lineHeight:19,color:colors.textSecondary},choose:{width:111,paddingVertical:8,borderRadius:18,alignItems:'center',marginLeft:2},chooseText:{color:'white',fontSize:13,fontWeight:'600'},poster:{width:119,height:180},state:{flex:1,justifyContent:'center',alignItems:'center',gap:12,paddingHorizontal:24,paddingVertical:40},stateTitle:{fontSize:18,fontWeight:'700',color:colors.textPrimary,textAlign:'center'},stateBody:{fontSize:13,lineHeight:20,color:colors.textSecondary,textAlign:'center'}});
