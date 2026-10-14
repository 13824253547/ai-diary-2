import React from 'react';
import {Alert} from 'react-native';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import AlbumScreen from '../album/select';
import {createTestStore} from '../../src/test-utils/create-test-store';
import {useAppStore} from '../../src/store/use-app-store';
import type {AppStore} from '../../src/store/use-app-store';

const mockRouter={push:jest.fn(),replace:jest.fn(),back:jest.fn(),canGoBack:jest.fn(()=>false)};
const mockListDevicePhotoAlbums=jest.fn();
const mockListDevicePhotos=jest.fn();
const mockValidateReadableDevicePhotoIds=jest.fn();
const mockGetPhotoPermissionStatus=jest.fn();

let mockDraftId='';
let mockMode: string | undefined;

jest.mock('expo-router',()=>({
  useRouter:()=>mockRouter,
  useLocalSearchParams:()=>({draftId:mockDraftId,mode:mockMode}),
}));

jest.mock('../../src/services/photo-library',()=>({
  ALL_PHOTOS_ALBUM_ID:'__all__',
  listDevicePhotoAlbums:(...args: unknown[])=>mockListDevicePhotoAlbums(...args),
  listDevicePhotos:(...args: unknown[])=>mockListDevicePhotos(...args),
  validateReadableDevicePhotoIds:(...args: unknown[])=>mockValidateReadableDevicePhotoIds(...args),
}));

jest.mock('../../src/services/photo-permission',()=>({
  getPhotoPermissionStatus:(...args: unknown[])=>mockGetPhotoPermissionStatus(...args),
}));

jest.mock('../../src/components/common/button',()=>({
  Button:({label,onPress,disabled}:{label:string;onPress?:()=>void;disabled?:boolean})=>{
    const {Pressable,Text}=require('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={disabled?undefined:onPress}><Text>{label}</Text></Pressable>;
  },
}));

jest.mock('../../src/components/common/design-ui',()=>({
  Empty:({title,detail}:{title:string;detail:string})=>{
    const {View,Text}=require('react-native');
    return <View><Text>{title}</Text><Text>{detail}</Text></View>;
  },
  Sheet:({visible,children}:{visible:boolean;children:React.ReactNode})=>{
    const {View}=require('react-native');
    return visible?<View>{children}</View>:null;
  },
}));

jest.mock('../../src/components/layout/screen',()=>({
  Screen:({header,footer,children}:{header?:React.ReactNode;footer?:React.ReactNode;children:React.ReactNode})=>{
    const {View}=require('react-native');
    return <View>{header}{children}{footer}</View>;
  },
}));

jest.mock('../../src/components/diary/photo',()=>({
  Photo:({id}:{id:string})=>{
    const {Text}=require('react-native');
    return <Text>{`图片:${id}`}</Text>;
  },
}));

function buildPhoto(id:string){return{id,title:`照片${id}`,location:'设备相册',emoji:'🖼',color:'#EFE3D5',date:'2026.10.13',localUri:`file://${id}.jpg`,uri:`file://${id}.jpg`,width:100,height:120,source:'device' as const};}
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function resetAppStore(){
  const current=useAppStore.getState() as Record<string,unknown>;
  const fresh=createTestStore().store.getState() as Record<string,unknown>;
  const next=Object.fromEntries(Object.keys(current).map(key=>[key,typeof current[key]==='function'?current[key]:fresh[key]]));
  useAppStore.setState(next as AppStore,true);
}

describe('Album select screen',()=>{
  let alertSpy: jest.SpyInstance;

  beforeEach(()=>{
    resetAppStore();
    jest.clearAllMocks();
    alertSpy=jest.spyOn(Alert,'alert').mockImplementation(jest.fn());
    mockMode=undefined;
    useAppStore.getState().grantPhotoPermission();
    mockDraftId=useAppStore.getState().beginCreation();
    mockGetPhotoPermissionStatus.mockResolvedValue({status:'full',granted:true,canAskAgain:true});
    mockListDevicePhotoAlbums.mockResolvedValue([{id:'__all__',title:'全部照片',assetCount:6},{id:'album-1',title:'旅行',assetCount:3},{id:'album-2',title:'人物',assetCount:3}]);
    mockValidateReadableDevicePhotoIds.mockImplementation((photoIds: string[])=>Promise.resolve({validIds:photoIds,invalidIds:[]}));
    mockListDevicePhotos.mockImplementation(({albumId}:{albumId?:string})=>{
      if(albumId==='album-2')return Promise.resolve({album:{id:'album-2',title:'人物',assetCount:3},photos:[buildPhoto('p4'),buildPhoto('p5'),buildPhoto('p6')],hasNextPage:false,endCursor:undefined});
      return Promise.resolve({album:{id:albumId??'__all__',title:albumId==='album-1'?'旅行':'全部照片',assetCount:3},photos:[buildPhoto('p1'),buildPhoto('p2'),buildPhoto('p3')],hasNextPage:false,endCursor:undefined});
    });
  });

  afterEach(()=>{
    alertSpy.mockRestore();
  });

  test('requires at least three readable photos before continuing',async()=>{
    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p1'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p2'));});

    expect(screen.getByText('至少选择 3 张照片，让回忆更完整')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('生成日记'));
    expect(useAppStore.getState().drafts[mockDraftId].selectedPhotoIds).toEqual([]);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('confirms three selected device photos into the same draft',async()=>{
    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p1'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p2'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p3'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('生成日记'));});

    await waitFor(()=>{
      expect(mockValidateReadableDevicePhotoIds).toHaveBeenCalledWith(['p1','p2','p3']);
      expect(useAppStore.getState().drafts[mockDraftId].selectedPhotoIds).toEqual(['p1','p2','p3']);
      expect(mockRouter.push).toHaveBeenCalledWith({pathname:'/create/template',params:{draftId:mockDraftId}});
    });
  });

  test('removes invalidated photos before confirm and blocks navigation',async()=>{
    mockValidateReadableDevicePhotoIds.mockResolvedValue({validIds:['p1','p2'],invalidIds:['p3']});

    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p1'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p2'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p3'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('生成日记'));});

    await waitFor(()=>{
      expect(screen.getByText('有1张照片已不可用，已从当前选择中移除。')).toBeTruthy();
      expect(screen.getByText('已选 2 张')).toBeTruthy();
    });

    expect(useAppStore.getState().drafts[mockDraftId].selectedPhotoIds).toEqual([]);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('confirms replacement photos into the same draft and returns to edit route',async()=>{
    mockMode='replace';
    useAppStore.getState().setDraftPhotos(mockDraftId,['p1','p2','p3']);

    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByText('全部照片'));});
    await act(async()=>{fireEvent.press(screen.getByText('人物 · 3 张'));});
    await waitFor(()=>expect(screen.getByText('图片:p4')).toBeTruthy());
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p4'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p5'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p6'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('使用这些照片'));});

    await waitFor(()=>{
      expect(useAppStore.getState().drafts[mockDraftId].selectedPhotoIds).toEqual(['p4','p5','p6']);
      expect(mockRouter.back).toHaveBeenCalled();
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('replacement photos invalidate a completed generation before returning to edit',async()=>{
    mockMode='replace';
    useAppStore.getState().setDraftPhotos(mockDraftId,['p1','p2','p3']);
    const round=useAppStore.getState().startGeneration(mockDraftId)!;
    useAppStore.getState().finishGeneration(mockDraftId,round);

    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByText('全部照片'));});
    await act(async()=>{fireEvent.press(screen.getByText('人物 · 3 张'));});
    await waitFor(()=>expect(screen.getByText('图片:p4')).toBeTruthy());
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p4'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p5'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p6'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('使用这些照片'));});

    await waitFor(()=>{
      expect(useAppStore.getState().drafts[mockDraftId].selectedPhotoIds).toEqual(['p4','p5','p6']);
      expect(useAppStore.getState().drafts[mockDraftId].generation.status).toBe('idle');
      expect(useAppStore.getState().drafts[mockDraftId].generation.progress).toBe(0);
      expect(useAppStore.getState().drafts[mockDraftId].diary.status).toBe('draft');
      expect(mockRouter.back).toHaveBeenCalled();
    });
  });

  test('new draft cancel lets the user continue editing without discarding the draft',async()=>{
    useAppStore.getState().setDraftPhotos(mockDraftId,['photo-1','photo-2','photo-3']);
    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByText('取消'));});

    expect(alertSpy).toHaveBeenCalled();
    const buttons=(alertSpy.mock.calls[0]?.[2]??[]) as Array<{text?: string; onPress?: () => void}>;
    expect(buttons.map(button=>button.text??'')).toEqual(['继续编辑','放弃']);
    buttons[0]?.onPress?.();

    expect(useAppStore.getState().drafts[mockDraftId]).toBeDefined();
    expect(useAppStore.getState().drafts[mockDraftId].selectedPhotoIds).toEqual(['photo-1','photo-2','photo-3']);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('new draft cancel can discard the draft and return home',async()=>{
    useAppStore.getState().setDraftPhotos(mockDraftId,['photo-1','photo-2','photo-3']);
    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByText('取消'));});

    const buttons=(alertSpy.mock.calls[0]?.[2]??[]) as Array<{text?: string; onPress?: () => void}>;
    await act(async()=>{buttons[1]?.onPress?.();});

    expect(useAppStore.getState().drafts[mockDraftId]).toBeUndefined();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
  });

  test('replace cancel keeps the original saved selection untouched',async()=>{
    mockMode='replace';
    useAppStore.getState().setDraftPhotos(mockDraftId,['photo-1','photo-2','photo-3']);
    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p1'));});
    await act(async()=>{fireEvent.press(screen.getByText('取消'));});

    expect(useAppStore.getState().drafts[mockDraftId].selectedPhotoIds).toEqual(['photo-1','photo-2','photo-3']);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('late first album response does not overwrite the newer album selection',async()=>{
    let resolveAll!: (value: unknown)=>void;
    const allPromise=new Promise(res=>{resolveAll=res;});
    mockListDevicePhotos.mockImplementationOnce(()=>allPromise).mockImplementation(({albumId}:{albumId?:string})=>{
      if(albumId==='album-2')return Promise.resolve({album:{id:'album-2',title:'人物',assetCount:3},photos:[buildPhoto('p4'),buildPhoto('p5'),buildPhoto('p6')],hasNextPage:false,endCursor:undefined});
      return Promise.resolve({album:{id:'__all__',title:'全部照片',assetCount:3},photos:[buildPhoto('p1'),buildPhoto('p2'),buildPhoto('p3')],hasNextPage:false,endCursor:undefined});
    });

    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('全部照片')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByText('全部照片'));});
    await act(async()=>{fireEvent.press(screen.getByText('人物 · 3 张'));});

    await waitFor(()=>expect(screen.getByText('图片:p4')).toBeTruthy());
    await act(async()=>{resolveAll({album:{id:'__all__',title:'全部照片',assetCount:3},photos:[buildPhoto('p1'),buildPhoto('p2'),buildPhoto('p3')],hasNextPage:false,endCursor:undefined});});

    await waitFor(()=>{
      expect(screen.getByText('图片:p4')).toBeTruthy();
      expect(screen.queryByText('图片:p1')).toBeNull();
    });
  });

  test('late first draft response does not pollute the next draft after route switch',async()=>{
    const firstDraftId=mockDraftId;
    const secondDraftId=useAppStore.getState().beginCreation();
    const deferred=createDeferred<{album:{id:string;title:string;assetCount:number};photos:Array<ReturnType<typeof buildPhoto>>;hasNextPage:false;endCursor:undefined}>();

    mockListDevicePhotos.mockImplementationOnce(()=>deferred.promise).mockImplementation(({albumId}:{albumId?:string})=>Promise.resolve({album:{id:albumId??'__all__',title:'全部照片',assetCount:3},photos:[buildPhoto('q1'),buildPhoto('q2'),buildPhoto('q3')],hasNextPage:false,endCursor:undefined}));

    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('正在读取相册')).toBeTruthy());

    mockDraftId=secondDraftId;
    await act(async()=>{await screen.rerender(<AlbumScreen/>);});
    await waitFor(()=>expect(screen.getByText('图片:q1')).toBeTruthy());

    await act(async()=>{deferred.resolve({album:{id:'__all__',title:'全部照片',assetCount:3},photos:[buildPhoto('p1'),buildPhoto('p2'),buildPhoto('p3')],hasNextPage:false,endCursor:undefined});});

    await waitFor(()=>{
      expect(screen.getByText('图片:q1')).toBeTruthy();
      expect(screen.queryByText('图片:p1')).toBeNull();
    });
    expect(useAppStore.getState().drafts[firstDraftId]).toBeDefined();
    expect(useAppStore.getState().drafts[secondDraftId]).toBeDefined();
  });

  test('load-more merge deduplicates repeated photo ids',async()=>{
    mockListDevicePhotos
      .mockResolvedValueOnce({album:{id:'__all__',title:'全部照片',assetCount:6},photos:[buildPhoto('p1'),buildPhoto('p2'),buildPhoto('p3')],hasNextPage:true,endCursor:'cursor-1'})
      .mockResolvedValueOnce({album:{id:'__all__',title:'全部照片',assetCount:6},photos:[buildPhoto('p3'),buildPhoto('p4'),buildPhoto('p5')],hasNextPage:false,endCursor:undefined});

    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{
      fireEvent.scroll(screen.getByTestId('album-photo-scroll'),{
        nativeEvent:{
          contentOffset:{y:240},
          contentSize:{height:500,width:320},
          layoutMeasurement:{height:200,width:320},
        },
      });
    });

    await waitFor(()=>{
      expect(screen.getAllByText('图片:p3')).toHaveLength(1);
      expect(screen.getByText('图片:p5')).toBeTruthy();
    });
  });

  test('load-more failure keeps existing selections and shows retry feedback',async()=>{
    mockListDevicePhotos
      .mockResolvedValueOnce({album:{id:'__all__',title:'全部照片',assetCount:6},photos:[buildPhoto('p1'),buildPhoto('p2'),buildPhoto('p3')],hasNextPage:true,endCursor:'cursor-1'})
      .mockRejectedValueOnce(new Error('page failed'));

    const screen=await render(<AlbumScreen/>);
    await waitFor(()=>expect(screen.getByText('图片:p1')).toBeTruthy());

    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p1'));});
    await act(async()=>{fireEvent.press(screen.getByLabelText('照片p2'));});
    const scrollView=screen.getByTestId('album-photo-scroll');
    await act(async()=>{
      fireEvent.scroll(scrollView,{
        nativeEvent:{
          contentOffset:{y:240},
          contentSize:{height:500,width:320},
          layoutMeasurement:{height:200,width:320},
        },
      });
    });

    await waitFor(()=>expect(screen.getByText('加载更多失败了，已保留当前选择，可继续下拉重试。')).toBeTruthy());
    expect(screen.getByText('已选 2 张')).toBeTruthy();
    expect(screen.getByText('至少选择 3 张照片，让回忆更完整')).toBeTruthy();
  });

  test('falls back to permission guidance when native permission sync says denied',async()=>{
    mockGetPhotoPermissionStatus.mockResolvedValue({status:'denied',granted:false,canAskAgain:true});

    const screen=await render(<AlbumScreen/>);

    await waitFor(()=>expect(screen.getByText('需要相册权限')).toBeTruthy());
    expect(screen.getByText('请先允许访问相册，再继续选择照片。')).toBeTruthy();
    expect(mockListDevicePhotoAlbums).not.toHaveBeenCalled();
    expect(mockListDevicePhotos).not.toHaveBeenCalled();
  });
});
