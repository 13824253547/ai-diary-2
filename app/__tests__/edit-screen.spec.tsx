import React from "react";
import { Alert } from "react-native";
import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react-native";
import EditScreen from "../diary/[id]/edit";
import { createTestStore } from "../../src/test-utils/create-test-store";
import { useAppStore } from "../../src/store/use-app-store";
import { getCurrentDeviceCity } from "../../src/services/device-city";
import type { AppStore } from "../../src/store/use-app-store";
import type { DiaryDraft } from "../../src/types/diary";
import { requestAIConsent } from "../../src/services/ai-consent";

jest.mock("../../src/services/ai-consent", () => ({
  requestAIConsent: jest.fn(async () => true),
}));
const { leaveDraft: actualLeaveDraft } = jest.requireActual(
  "../../src/hooks/use-diary-flow",
);
const actualSubmitDraft = useAppStore.getState().submitDraft;
const actualRewriteDraftBlock = useAppStore.getState().rewriteDraftBlock;
const actualSetDraftBlockPhotos = useAppStore.getState().setDraftBlockPhotos;

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(),
  back: jest.fn(),
};

const mockParams: {
  draftId?: string;
  id?: string;
  openPhotos?: string;
  openBlockPhotos?: string;
} = {};
let mockDraft: DiaryDraft | undefined;
let mockLeaveDraft: typeof actualLeaveDraft = (
  _draftId: string,
  done: () => void,
) => done();
const mockValidateReadableDevicePhotoIds = jest.fn();
const mockGetCurrentDeviceCity = jest.mocked(getCurrentDeviceCity);

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/hooks/use-diary-flow", () => ({
  useDraftRoute: () => ({
    draft: mockDraft,
    params: mockParams,
    router: mockRouter,
  }),
  leaveDraft: (draftId: string, done: () => void) =>
    mockLeaveDraft(draftId, done),
}));

jest.mock("../../src/services/photo-library", () => ({
  validateReadableDevicePhotoIds: (...args: unknown[]) =>
    mockValidateReadableDevicePhotoIds(...args),
}));

jest.mock("../../src/services/device-city", () => ({
  getCurrentDeviceCity: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => {
  const { Text: MockText } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  };
});

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    return <React.Fragment>{children}</React.Fragment>;
  },
}));

jest.mock("../../src/components/layout/screen", () => ({
  Screen: ({
    children,
    header,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
  }) => {
    const { View } = require("react-native");
    return (
      <View>
        {header}
        {children}
      </View>
    );
  },
}));

jest.mock("../../src/components/diary/photo", () => ({
  Photo: ({ id }: { id: string }) => {
    const { Text } = require("react-native");
    return <Text>{id}</Text>;
  },
}));

jest.mock("../../src/components/common/design-ui", () => ({
  Empty: ({ title }: { title?: string }) => {
    const { Text } = require("react-native");
    return <Text>{title ?? "空"}</Text>;
  },
  Sheet: ({
    visible,
    children,
    onClose,
  }: {
    visible: boolean;
    children: React.ReactNode;
    onClose?: () => void;
  }) => {
    const { Pressable, Text, View } = require("react-native");
    return visible ? (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭图片引用弹窗"
          onPress={onClose}
        >
          <Text>关闭图片引用弹窗</Text>
        </Pressable>
        {children}
      </View>
    ) : null;
  },
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map((key) => [
      key,
      typeof current[key] === "function" ? current[key] : fresh[key],
    ]),
  );
  useAppStore.setState(next as AppStore, true);
}

describe("Edit screen", () => {
  const alertSpy = jest
    .spyOn(Alert, "alert")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    resetAppStore();
    useAppStore.setState({ submitDraft: actualSubmitDraft });
    useAppStore.setState({ rewriteDraftBlock: actualRewriteDraftBlock });
    useAppStore.setState({ setDraftBlockPhotos: actualSetDraftBlockPhotos });
    mockValidateReadableDevicePhotoIds.mockResolvedValue({
      validIds: [],
      invalidIds: [],
    });
    jest.clearAllMocks();
    mockGetCurrentDeviceCity.mockRejectedValue(
      new Error("location unavailable"),
    );
    mockParams.draftId = undefined;
    mockParams.id = undefined;
    mockParams.openPhotos = undefined;
    mockParams.openBlockPhotos = undefined;
    mockDraft = undefined;
    mockLeaveDraft = (_draftId: string, done: () => void) => done();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  async function renderWithExistingDraft() {
    const draftId = useAppStore.getState().beginEdit("diary-1")!;
    const state = useAppStore.getState();
    mockParams.draftId = draftId;
    mockDraft = state.drafts[draftId];
    const screen = await render(<EditScreen />);
    return { draftId, ...screen };
  }

  test("does not save or trigger saved-memory processing when consent is declined", async () => {
    const submitDraft = jest.fn();
    jest.mocked(requestAIConsent).mockResolvedValueOnce(false);
    useAppStore.setState({ submitDraft });
    const screen = await renderWithExistingDraft();
    await act(async () => {
      fireEvent.press(screen.getByText("保存"));
    });
    expect(submitDraft).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  async function renderWithCustomExistingDraft(
    transform: (draft: DiaryDraft) => DiaryDraft,
  ) {
    const draftId = useAppStore.getState().beginEdit("diary-1")!;
    const state = useAppStore.getState();
    const nextDraft = transform(state.drafts[draftId]);
    useAppStore.setState({
      drafts: {
        ...state.drafts,
        [draftId]: nextDraft,
      },
    });
    mockParams.draftId = draftId;
    mockDraft = nextDraft;
    const screen = await render(<EditScreen />);
    return { draftId, ...screen };
  }

  async function renderWithGeneratedNewDraft(location?: string) {
    const draftId = useAppStore.getState().beginCreation();
    useAppStore
      .getState()
      .setDraftPhotos(draftId, ["photo-1", "photo-2", "photo-3"]);
    const round = useAppStore.getState().startGeneration(draftId)!;
    useAppStore.getState().finishGeneration(draftId, round);
    if (location !== undefined) {
      useAppStore.getState().updateDraft(draftId, { location });
    }
    mockParams.draftId = draftId;
    mockDraft = useAppStore.getState().drafts[draftId];
    const screen = await render(<EditScreen />);
    return { draftId, ...screen };
  }

  async function renderWithGeneratingDraft() {
    const draftId = useAppStore.getState().beginCreation();
    useAppStore
      .getState()
      .setDraftPhotos(draftId, ["photo-1", "photo-2", "photo-3"]);
    useAppStore.getState().startGeneration(draftId);
    mockParams.draftId = draftId;
    mockDraft = useAppStore.getState().drafts[draftId];
    const screen = await render(<EditScreen />);
    return { draftId, ...screen };
  }

  test("automatically fills the current city for an unknown generated draft location", async () => {
    let resolveCity!: (city: string) => void;
    const cityRequest = new Promise<string>((resolve) => {
      resolveCity = resolve;
    });
    mockGetCurrentDeviceCity.mockReturnValue(cityRequest);
    const { draftId, getByText, rerender } =
      await renderWithGeneratedNewDraft("未知地点");

    await waitFor(() =>
      expect(mockGetCurrentDeviceCity).toHaveBeenCalledTimes(1),
    );
    expect(getByText(/未知地点/)).toBeTruthy();

    await act(async () => {
      resolveCity("台南市");
      await cityRequest;
    });
    await waitFor(() => {
      expect(useAppStore.getState().drafts[draftId].diary.location).toBe(
        "台南市",
      );
    });

    mockDraft = useAppStore.getState().drafts[draftId];
    await act(async () => rerender(<EditScreen />));
    expect(getByText(/台南市/)).toBeTruthy();
  });

  test("does not request location when a new generated draft already has a location", async () => {
    await renderWithGeneratedNewDraft("厦门市");

    expect(mockGetCurrentDeviceCity).not.toHaveBeenCalled();
  });

  test("keeps the unknown location and continues when foreground location fails", async () => {
    const { draftId, getByText } =
      await renderWithGeneratedNewDraft("未知地点");

    await waitFor(() =>
      expect(mockGetCurrentDeviceCity).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().drafts[draftId].diary.location).toBe(
      "未知地点",
    );
    expect(getByText(/未知地点/)).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("does not request location for existing diary drafts even when their location is unknown", async () => {
    await renderWithCustomExistingDraft((draft) => ({
      ...draft,
      diary: { ...draft.diary, location: "未知地点" },
    }));

    expect(mockGetCurrentDeviceCity).not.toHaveBeenCalled();
  });

  function pressTextParent(node: any) {
    if (!node?.parent) throw new Error("target text has no parent pressable");
    fireEvent.press(node.parent);
  }

  test("save failure shows continue editing and retry actions, and retry calls submit again", async () => {
    const { getAllByText, getByText, draftId } =
      await renderWithExistingDraft();
    const submitDraft = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        reason: "save_failed" as const,
        message: "network down",
      })
      .mockResolvedValueOnce({
        ok: true as const,
        diaryId: "diary-after-retry",
        destination: "detail" as const,
      });
    useAppStore.setState({ submitDraft });

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(submitDraft).toHaveBeenCalledWith(draftId);
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe("保存失败");
    expect(message).toBe("network down");
    expect(buttons?.map((button) => button.text ?? "")).toEqual([
      "继续编辑",
      "重试保存",
    ]);

    await act(async () => {
      buttons?.[1]?.onPress?.();
    });

    await waitFor(() => {
      expect(submitDraft).toHaveBeenCalledTimes(2);
      expect(mockRouter.dismissAll).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith(
        "/diary/diary-after-retry",
      );
    });
  });

  test("missing diary id shows the empty state instead of editable rewrite actions", async () => {
    mockParams.id = "missing-diary";

    const { getByText, queryByLabelText } = await render(<EditScreen />);

    expect(getByText("没有找到这篇日记")).toBeTruthy();
    expect(queryByLabelText("重写本段")).toBeNull();
  });

  test("source missing result routes back to memories with the expected alert action", async () => {
    const { getAllByText, getByText, draftId } =
      await renderWithExistingDraft();
    const submitDraft = jest.fn().mockResolvedValue({
      ok: false as const,
      reason: "source_missing" as const,
      message: "原日记已不存在，请返回回忆列表确认后再处理。",
    });
    useAppStore.setState({ submitDraft });

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(submitDraft).toHaveBeenCalledWith(draftId);
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, , buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe("原日记已不存在");

    buttons?.[0]?.onPress?.();

    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/memories");
  });

  test("needs regeneration result offers a direct route back to generating", async () => {
    const { getByText, draftId } = await renderWithExistingDraft();
    const submitDraft = jest.fn().mockResolvedValue({
      ok: false as const,
      reason: "needs_regeneration" as const,
      message: "照片已更新，重新生成后就可以保存。",
    });
    useAppStore.setState({ submitDraft });

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(submitDraft).toHaveBeenCalledWith(draftId);
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, , buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe("需要重新整理");

    buttons?.[0]?.onPress?.();

    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/create/generating",
      params: { draftId },
    });
  });

  test("back press can keep editing without discarding the working draft", async () => {
    mockLeaveDraft = actualLeaveDraft;
    const { getByLabelText, draftId } = await renderWithExistingDraft();
    const originalDiary = useAppStore
      .getState()
      .diaries.find((item) => item.id === "diary-1");
    const submitDraft = jest.fn().mockResolvedValue({
      ok: true as const,
      diaryId: "diary-1",
      destination: "detail" as const,
    });
    useAppStore.setState({ submitDraft });

    useAppStore
      .getState()
      .updateDraft(draftId, { title: "继续保留的草稿标题" });
    mockDraft = useAppStore.getState().drafts[draftId];

    fireEvent.press(getByLabelText("返回"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe("放弃未保存的日记？");
    expect(message).toBe("这次编辑尚未保存。");

    buttons?.[0]?.onPress?.();

    expect(useAppStore.getState().drafts[draftId]?.diary.title).toBe(
      "继续保留的草稿标题",
    );
    expect(
      useAppStore.getState().diaries.find((item) => item.id === "diary-1")
        ?.title,
    ).toBe(originalDiary?.title);
    expect(submitDraft).not.toHaveBeenCalled();
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("back press can keep a generated new draft without leaving the edit screen", async () => {
    mockLeaveDraft = actualLeaveDraft;
    const { getByLabelText, draftId } = await renderWithGeneratedNewDraft();

    useAppStore.getState().updateDraft(draftId, { title: "新建草稿继续保留" });
    mockDraft = useAppStore.getState().drafts[draftId];

    fireEvent.press(getByLabelText("返回"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [, , buttons] = alertSpy.mock.calls[0] ?? [];
    buttons?.[0]?.onPress?.();

    expect(useAppStore.getState().drafts[draftId]?.diary.title).toBe(
      "新建草稿继续保留",
    );
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("back press can discard the draft and return to the source diary", async () => {
    mockLeaveDraft = actualLeaveDraft;
    const { getByLabelText, draftId } = await renderWithExistingDraft();
    const originalDiary = useAppStore
      .getState()
      .diaries.find((item) => item.id === "diary-1");

    useAppStore
      .getState()
      .updateDraft(draftId, { title: "准备放弃的草稿标题" });
    mockDraft = useAppStore.getState().drafts[draftId];

    fireEvent.press(getByLabelText("返回"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [, , buttons] = alertSpy.mock.calls[0] ?? [];
    buttons?.[1]?.onPress?.();

    expect(useAppStore.getState().drafts[draftId]).toBeUndefined();
    expect(
      useAppStore.getState().diaries.find((item) => item.id === "diary-1")
        ?.title,
    ).toBe(originalDiary?.title);
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/diary/diary-1");
  });

  test("save button shows pending state and blocks duplicate submit attempts while saving", async () => {
    const { getByText, draftId } = await renderWithExistingDraft();
    const submitDraft = jest.fn().mockImplementation(async () => {
      useAppStore.setState({ savingDraftIds: [draftId] });
      return new Promise(() => undefined);
    });
    useAppStore.setState({ submitDraft });

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(submitDraft).toHaveBeenCalledTimes(1);
      expect(getByText("保存中")).toBeTruthy();
    });

    fireEvent.press(getByText("保存中"));
    expect(submitDraft).toHaveBeenCalledTimes(1);
  });

  test("drafts without text or quote blocks disable rewrite and show an empty target hint", async () => {
    const rewriteDraftBlock = jest.fn();
    useAppStore.setState({ rewriteDraftBlock });
    const { getByText, getByLabelText } = await renderWithCustomExistingDraft(
      (draft) => ({
        ...draft,
        diary: {
          ...draft.diary,
          blocks: draft.diary.blocks.filter((block) => block.type === "photo"),
        },
      }),
    );

    expect(getByText("当前没有可重写的文字段落")).toBeTruthy();

    const rewriteButton = getByLabelText("重写本段");
    expect(rewriteButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    fireEvent.press(rewriteButton);
    expect(rewriteDraftBlock).not.toHaveBeenCalled();
  });

  test("a stale selected block disables rewrite instead of targeting another paragraph", async () => {
    const rewriteDraftBlock = jest.fn();
    useAppStore.setState({ rewriteDraftBlock });
    const actualUseState = React.useState;
    const useStateSpy = jest.spyOn(React, "useState");
    useStateSpy.mockImplementation(actualUseState);
    useStateSpy.mockImplementationOnce(actualUseState);
    useStateSpy.mockImplementationOnce(() => ["missing-block", jest.fn()]);

    const { getByLabelText, getByText } = await renderWithExistingDraft();
    useStateSpy.mockRestore();

    expect(
      getByText("当前选中的段落已失效，请重新点选需要重写的文字。"),
    ).toBeTruthy();

    const rewriteButton = getByLabelText("重写本段");
    expect(rewriteButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    fireEvent.press(rewriteButton);
    expect(rewriteDraftBlock).not.toHaveBeenCalled();
  });

  test("rewrite loading locks editing, navigation, photo selection, layout changes, and saving", async () => {
    const { draftId, getByLabelText, getByText, queryByLabelText } =
      await renderWithExistingDraft();
    const targetBlock = useAppStore
      .getState()
      .drafts[draftId].diary.blocks.find((block) => block.type === "text")!;
    const requestKey = `${encodeURIComponent(draftId)}:${encodeURIComponent(targetBlock.id)}`;
    const submitDraft = jest.fn();
    mockLeaveDraft = jest.fn();
    useAppStore.setState({ submitDraft });

    await act(async () => {
      useAppStore.setState({ rewritingDraftBlockKeys: [requestKey] });
    });

    expect(getByLabelText("重写中…").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(getByLabelText("日记标题").props.editable).toBe(false);
    expect(getByLabelText("编辑段落1").props.editable).toBe(false);
    expect(getByLabelText("更换照片").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(getByLabelText("返回").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(getByLabelText("更换排版师").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    const referenceButton = getByLabelText(
      /^为第1段选择引用图片$|^更换第1段引用图片$/,
    );
    expect(referenceButton.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    fireEvent.press(getByText("保存"));
    fireEvent.press(getByLabelText("返回"));
    fireEvent.press(getByLabelText("更换照片"));
    fireEvent.press(getByLabelText("更换排版师"));
    expect(submitDraft).not.toHaveBeenCalled();
    expect(mockLeaveDraft).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => {
      useAppStore.setState({ rewritingDraftBlockKeys: [] });
    });

    expect(queryByLabelText("重写中…")).toBeNull();
    expect(getByLabelText("重写本段")).toBeTruthy();
    expect(getByLabelText("日记标题").props.editable).toBe(true);
  });

  test("rewrite timeout surfaces a visible Chinese failure alert on the edit screen", async () => {
    const { getByText } = await renderWithExistingDraft();
    const rewriteDraftBlock = jest.fn().mockImplementation(() => {
      useAppStore
        .getState()
        .logIssue("段落重写失败：AI provider request timed out after 1000ms");
      return Promise.resolve();
    });
    useAppStore.setState({ rewriteDraftBlock });

    await act(async () => {
      fireEvent.press(getByText("重写本段"));
    });

    await waitFor(() => {
      expect(rewriteDraftBlock).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        "重写失败",
        "重写超时，请稍后重试。",
      );
    });
  });

  test("rewrite provider failure surfaces a visible Chinese failure alert on the edit screen", async () => {
    const { getByText } = await renderWithExistingDraft();
    const rewriteDraftBlock = jest.fn().mockImplementation(() => {
      useAppStore.getState().logIssue("段落重写失败：rewrite provider failed");
      return Promise.resolve();
    });
    useAppStore.setState({ rewriteDraftBlock });

    await act(async () => {
      fireEvent.press(getByText("重写本段"));
    });

    await waitFor(() => {
      expect(rewriteDraftBlock).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        "重写失败",
        "重写失败，请稍后重试。",
      );
    });
  });

  test("rewrite malformed output surfaces a visible Chinese failure alert on the edit screen", async () => {
    const { getByText } = await renderWithExistingDraft();
    const rewriteDraftBlock = jest.fn().mockImplementation(() => {
      useAppStore
        .getState()
        .logIssue("段落重写失败：rewrite result response is invalid");
      return Promise.resolve();
    });
    useAppStore.setState({ rewriteDraftBlock });

    await act(async () => {
      fireEvent.press(getByText("重写本段"));
    });

    await waitFor(() => {
      expect(rewriteDraftBlock).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        "重写失败",
        "重写结果异常，请稍后重试。",
      );
    });
  });

  test("out-of-scope rewrite requests and device task conflicts show specific Chinese alerts", async () => {
    for (const [message, expected] of [
      [
        "段落重写失败：此功能仅用于整理日记和已选照片，不支持代码、小说或商业推广内容。",
        "重写内容超出日记范围，请修改原文后重试。",
      ],
      [
        "段落重写失败：生成结果超出日记内容范围，未予采用；请检查照片或原文后重试。",
        "重写结果超出日记范围，未写回原文，请稍后重试。",
      ],
      [
        "段落重写失败：当前设备已有一项日记生成或重写任务正在执行，请等待完成后重试。",
        "当前设备已有一项日记生成或重写任务正在执行，请等待完成后重试。",
      ],
    ]) {
      const { getByText } = await renderWithExistingDraft();
      const rewriteDraftBlock = jest.fn().mockImplementation(() => {
        useAppStore.getState().logIssue(message);
        return Promise.resolve();
      });
      useAppStore.setState({ rewriteDraftBlock });

      await act(async () => {
        fireEvent.press(getByText("重写本段"));
      });

      await waitFor(() => {
        expect(rewriteDraftBlock).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith("重写失败", expected);
      });
      alertSpy.mockClear();
    }
  });

  test("closing the paragraph photo sheet keeps the original references untouched", async () => {
    mockParams.openBlockPhotos = "block-1";
    const { getByText, draftId } = await renderWithExistingDraft();
    const originalBlock = useAppStore
      .getState()
      .drafts[draftId].diary.blocks.find((block) => block.id === "block-1");
    const originalRefs =
      originalBlock && "photoIds" in originalBlock
        ? [...(originalBlock.photoIds ?? [])]
        : [];

    fireEvent.press(getByText("关闭图片引用弹窗"));

    const draft = useAppStore.getState().drafts[draftId];
    const updatedBlock = draft.diary.blocks.find(
      (block) => block.id === "block-1",
    );

    expect(
      updatedBlock && "photoIds" in updatedBlock
        ? updatedBlock.photoIds
        : undefined,
    ).toEqual(originalRefs);
  });

  test("paragraph photo choices follow the selected-photo order and commit only one reference", async () => {
    mockParams.openBlockPhotos = "block-1";
    const { getByLabelText, getByText, draftId } =
      await renderWithCustomExistingDraft((draft) => ({
        ...draft,
        selectedPhotoIds: ["photo-3", "photo-1"],
      }));
    const selectedId = "photo-3";
    mockValidateReadableDevicePhotoIds.mockResolvedValue({
      validIds: [selectedId],
      invalidIds: [],
    });

    expect(getByLabelText("引用图片1")).toBeTruthy();
    expect(getByLabelText("引用图片2")).toBeTruthy();
    expect(() => getByLabelText("引用图片3")).toThrow();

    await act(async () => {
      fireEvent.press(getByLabelText("引用图片1"));
    });
    await act(async () => {
      fireEvent.press(getByText("引用所选图片"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mockValidateReadableDevicePhotoIds).toHaveBeenCalledWith([
        selectedId,
      ]),
    );
    const updatedBlock = useAppStore
      .getState()
      .drafts[draftId].diary.blocks.find((block) => block.id === "block-1");
    expect(
      updatedBlock && "photoIds" in updatedBlock
        ? updatedBlock.photoIds
        : undefined,
    ).toEqual([selectedId]);
  });

  test("referenced photo is shown in the control and can be replaced from the chooser", async () => {
    const { getByLabelText, getByText, getAllByText, rerender, draftId } =
      await renderWithCustomExistingDraft((draft) => ({
        ...draft,
        selectedPhotoIds: ["photo-1", "photo-2"],
        diary: {
          ...draft.diary,
          blocks: draft.diary.blocks.map((block) =>
            block.id === "block-1" && "photoIds" in block
              ? { ...block, photoIds: ["photo-1"] }
              : block,
          ),
        },
      }));
    const referenceButton = getByLabelText("更换第1段引用图片");

    expect(within(referenceButton).getByText("photo-1")).toBeTruthy();
    expect(getAllByText("photo-1")).toHaveLength(2);

    await act(async () => {
      fireEvent.press(referenceButton);
    });

    await waitFor(() => expect(getByLabelText("引用图片1")).toBeTruthy());
    expect(getByLabelText("引用图片1").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true, disabled: false }),
    );
    expect(getByLabelText("引用图片2").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false, disabled: false }),
    );
    mockValidateReadableDevicePhotoIds.mockResolvedValue({
      validIds: ["photo-2"],
      invalidIds: [],
    });

    await act(async () => {
      fireEvent.press(getByLabelText("引用图片2"));
    });

    await act(async () => {
      fireEvent.press(getByText("引用所选图片"));
    });

    await waitFor(() => {
      const updatedBlock = useAppStore
        .getState()
        .drafts[draftId].diary.blocks.find((block) => block.id === "block-1");
      expect(
        updatedBlock && "photoIds" in updatedBlock
          ? updatedBlock.photoIds
          : undefined,
      ).toEqual(["photo-2"]);
      expect(mockValidateReadableDevicePhotoIds).toHaveBeenCalledWith([
        "photo-2",
      ]);
    });

    mockDraft = useAppStore.getState().drafts[draftId];
    await act(async () => rerender(<EditScreen />));

    const updatedReferenceButton = getByLabelText("更换第1段引用图片");
    expect(within(updatedReferenceButton).getByText("photo-2")).toBeTruthy();
    expect(getAllByText("photo-1")).toHaveLength(1);
  });

  test("invalid paragraph reference photos stay uncommitted and show an inline warning", async () => {
    const { getByText, getByLabelText, draftId } =
      await renderWithExistingDraft();
    await act(async () => {
      fireEvent.press(getByLabelText("更换第1段引用图片"));
    });
    await waitFor(() => expect(getByText("引用所选图片")).toBeTruthy());
    const setDraftBlockPhotos = jest.fn();
    useAppStore.setState({ setDraftBlockPhotos });
    const originalBlock = useAppStore
      .getState()
      .drafts[draftId].diary.blocks.find((block) => block.id === "block-1");
    const originalRefs =
      originalBlock && "photoIds" in originalBlock
        ? [...(originalBlock.photoIds ?? [])]
        : [];
    const selectedRefs = originalRefs.slice(0, 1);
    mockValidateReadableDevicePhotoIds.mockResolvedValue({
      validIds: [],
      invalidIds: selectedRefs,
    });

    await act(async () => {
      fireEvent.press(getByText("引用所选图片"));
    });

    await waitFor(() => {
      expect(mockValidateReadableDevicePhotoIds).toHaveBeenCalledWith(
        selectedRefs,
      );
      expect(getByText("有1张引用图片已不可用，请重新选择。")).toBeTruthy();
    });

    const draft = useAppStore.getState().drafts[draftId];
    const updatedBlock = draft.diary.blocks.find(
      (block) => block.id === "block-1",
    );

    expect(setDraftBlockPhotos).not.toHaveBeenCalled();
    expect(
      updatedBlock && "photoIds" in updatedBlock
        ? updatedBlock.photoIds
        : undefined,
    ).toEqual(originalRefs);
  });

  test("paragraph reference validation failure keeps the original references unchanged", async () => {
    const { getByText, getByLabelText, draftId } =
      await renderWithExistingDraft();
    await act(async () => {
      fireEvent.press(getByLabelText("更换第1段引用图片"));
    });
    await waitFor(() => expect(getByText("引用所选图片")).toBeTruthy());
    const setDraftBlockPhotos = jest.fn();
    useAppStore.setState({ setDraftBlockPhotos });
    mockValidateReadableDevicePhotoIds.mockRejectedValue(
      new Error("broken asset info"),
    );
    const originalBlock = useAppStore
      .getState()
      .drafts[draftId].diary.blocks.find((block) => block.id === "block-1");
    const originalRefs =
      originalBlock && "photoIds" in originalBlock
        ? [...(originalBlock.photoIds ?? [])]
        : [];
    const selectedRefs = originalRefs.slice(0, 1);

    await act(async () => {
      fireEvent.press(getByText("引用所选图片"));
    });

    await waitFor(() => {
      expect(mockValidateReadableDevicePhotoIds).toHaveBeenCalledWith(
        selectedRefs,
      );
      expect(getByText("当前无法更新引用图片，请稍后重试。")).toBeTruthy();
    });

    const draft = useAppStore.getState().drafts[draftId];
    const updatedBlock = draft.diary.blocks.find(
      (block) => block.id === "block-1",
    );

    expect(setDraftBlockPhotos).not.toHaveBeenCalled();
    expect(
      updatedBlock && "photoIds" in updatedBlock
        ? updatedBlock.photoIds
        : undefined,
    ).toEqual(originalRefs);
  });

  test("discarding a generated new draft returns home without leaving a saved diary behind", async () => {
    mockLeaveDraft = actualLeaveDraft;
    const { getByLabelText, draftId } = await renderWithGeneratedNewDraft();
    const beforeIds = useAppStore.getState().diaries.map((item) => item.id);

    fireEvent.press(getByLabelText("返回"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [, , buttons] = alertSpy.mock.calls[0] ?? [];
    buttons?.[1]?.onPress?.();

    expect(useAppStore.getState().drafts[draftId]).toBeUndefined();
    expect(
      useAppStore.getState().diaries.some((item) => item.id === draftId),
    ).toBe(false);
    expect(useAppStore.getState().diaries.map((item) => item.id)).toEqual(
      beforeIds,
    );
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
  });

  test("saving a generated new draft routes to the complete screen after success", async () => {
    const { getByText, draftId } = await renderWithGeneratedNewDraft();
    const submitDraft = jest.fn().mockResolvedValue({
      ok: true as const,
      diaryId: "diary-new-complete",
      destination: "complete" as const,
    });
    useAppStore.setState({ submitDraft });

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(submitDraft).toHaveBeenCalledWith(draftId);
      expect(mockRouter.dismissAll).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith(
        "/create/complete?diaryId=diary-new-complete",
      );
    });
  });

  test("saving a generated new draft adds exactly one saved diary to the list", async () => {
    const { getByText } = await renderWithGeneratedNewDraft();
    const beforeIds = useAppStore.getState().diaries.map((item) => item.id);
    const beforeCount = beforeIds.length;

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/create\/complete\?diaryId=/),
      );
    });

    const route = mockRouter.replace.mock.calls.find(
      ([value]) =>
        typeof value === "string" &&
        value.startsWith("/create/complete?diaryId="),
    )?.[0];
    const savedDiaryId =
      typeof route === "string"
        ? route.replace("/create/complete?diaryId=", "")
        : "";
    const afterDiaries = useAppStore.getState().diaries;

    expect(savedDiaryId).not.toBe("");
    expect(afterDiaries).toHaveLength(beforeCount + 1);
    expect(
      afterDiaries.filter((item) => item.id === savedDiaryId),
    ).toHaveLength(1);
    expect(afterDiaries[0]?.id).toBe(savedDiaryId);
    expect(beforeIds.includes(savedDiaryId)).toBe(false);
  });

  test("saving an existing draft routes back to the saved diary detail page", async () => {
    const { getByText, draftId } = await renderWithExistingDraft();
    const submitDraft = jest.fn().mockResolvedValue({
      ok: true as const,
      diaryId: "diary-1",
      destination: "detail" as const,
    });
    useAppStore.setState({ submitDraft });

    fireEvent.press(getByText("保存"));

    await waitFor(() => {
      expect(submitDraft).toHaveBeenCalledWith(draftId);
      expect(mockRouter.dismissAll).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith("/diary/diary-1");
    });
  });

  test("saving an existing draft keeps the diary list count stable and updates the original item", async () => {
    const { getByText, draftId } = await renderWithExistingDraft();
    const beforeDiaries = useAppStore.getState().diaries;
    const beforeCount = beforeDiaries.length;

    useAppStore.getState().updateDraft(draftId, {
      title: "编辑保存后的稳定标题",
      summary: "编辑保存后列表数量不变，但内容会更新。",
    });
    mockDraft = useAppStore.getState().drafts[draftId];

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/diary/diary-1");
    });

    const afterDiaries = useAppStore.getState().diaries;
    const updatedDiary = afterDiaries.find((item) => item.id === "diary-1");

    expect(afterDiaries).toHaveLength(beforeCount);
    expect(afterDiaries.filter((item) => item.id === "diary-1")).toHaveLength(
      1,
    );
    expect(updatedDiary?.title).toBe("编辑保存后的稳定标题");
    expect(updatedDiary?.summary).toBe(
      "编辑保存后列表数量不变，但内容会更新。",
    );
  });

  test("generated draft with fewer than three selected photos cannot save and keeps the list unchanged", async () => {
    const { getByText, draftId } = await renderWithGeneratedNewDraft();
    const beforeIds = useAppStore.getState().diaries.map((item) => item.id);

    useAppStore.getState().setDraftPhotos(draftId, ["photo-1", "photo-2"]);
    mockDraft = useAppStore.getState().drafts[draftId];

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, message] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe("需要重新整理");
    expect(message).toBe("照片已更新，重新生成后就可以保存。");
    expect(useAppStore.getState().diaries.map((item) => item.id)).toEqual(
      beforeIds,
    );
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("generated draft with replaced photos still must regenerate before saving", async () => {
    const { getByText, draftId } = await renderWithGeneratedNewDraft();
    const beforeIds = useAppStore.getState().diaries.map((item) => item.id);

    useAppStore
      .getState()
      .setDraftPhotos(draftId, ["photo-4", "photo-5", "photo-6"]);
    mockDraft = useAppStore.getState().drafts[draftId];

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe("需要重新整理");
    expect(message).toBe("照片已更新，重新生成后就可以保存。");

    await act(async () => {
      buttons?.[0]?.onPress?.();
    });

    expect(useAppStore.getState().diaries.map((item) => item.id)).toEqual(
      beforeIds,
    );
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/create/generating",
      params: { draftId },
    });
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
  });

  test("generation still running cannot save and offers a direct route back to generating", async () => {
    const { getByText, draftId } = await renderWithGeneratingDraft();
    const beforeIds = useAppStore.getState().diaries.map((item) => item.id);

    await act(async () => {
      fireEvent.press(getByText("保存"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe("需要重新整理");
    expect(message).toBe("照片已更新，重新生成后就可以保存。");

    await act(async () => {
      buttons?.[0]?.onPress?.();
    });

    expect(useAppStore.getState().diaries.map((item) => item.id)).toEqual(
      beforeIds,
    );
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/create/generating",
      params: { draftId },
    });
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
  });

  test("successful save keeps the button locked so a fast second tap does not resubmit", async () => {
    const { getByText, queryByText } = await renderWithExistingDraft();
    let resolveSubmit:
      | ((value: { ok: true; diaryId: string; destination: "detail" }) => void)
      | undefined;
    const submitDraft = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    useAppStore.setState({ submitDraft });

    fireEvent.press(getByText("保存"));

    await waitFor(() => {
      expect(getByText("保存中")).toBeTruthy();
      expect(submitDraft).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(getByText("保存中"));
    expect(submitDraft).toHaveBeenCalledTimes(1);

    resolveSubmit?.({
      ok: true,
      diaryId: "diary-1",
      destination: "detail",
    });

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/diary/diary-1");
    });

    fireEvent.press(getByText("保存中"));
    expect(submitDraft).toHaveBeenCalledTimes(1);
    expect(queryByText("保存")).toBeNull();
  });

  test("discarding an edit draft keeps a delayed rewrite result from restoring the draft", async () => {
    mockLeaveDraft = actualLeaveDraft;
    const { getByLabelText, getByText, draftId } =
      await renderWithExistingDraft();
    const originalDiary = useAppStore
      .getState()
      .diaries.find((item) => item.id === "diary-1");
    const originalBlockContent = originalDiary?.blocks.find(
      (item) => item.type === "text",
    )?.content;
    const rewriteDraftBlock = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
    useAppStore.setState({ rewriteDraftBlock });

    fireEvent.press(getByText("重写本段"));
    await waitFor(() =>
      expect(rewriteDraftBlock).toHaveBeenCalledWith(
        draftId,
        expect.any(String),
      ),
    );

    fireEvent.press(getByLabelText("返回"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const [, , buttons] = alertSpy.mock.calls[0] ?? [];
    buttons?.[1]?.onPress?.();

    expect(useAppStore.getState().drafts[draftId]).toBeUndefined();
    expect(
      useAppStore
        .getState()
        .diaries.find((item) => item.id === "diary-1")
        ?.blocks.find((item) => item.type === "text")?.content,
    ).toBe(originalBlockContent);
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/diary/diary-1");
  });
});
