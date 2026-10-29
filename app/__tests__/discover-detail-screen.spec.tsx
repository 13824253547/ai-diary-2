import React from 'react';
import { cleanup, render, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import DiscoverDetail from '../discover/[id]';
import type { DiscoveryStoryContract } from '../../src/contracts/discovery-contract';

const mockRouter = { back: jest.fn(), replace: jest.fn() };
const mockParams: { id?: string } = { id: 'story-1' };
const mockGetStory = jest.fn();
const mockSetLike = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: MockText } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText> };
});

jest.mock('../../src/store/adapters/backend-discovery-adapter', () => ({
  createBackendDiscoveryRepository: () => ({
    getStory: mockGetStory,
    setLike: mockSetLike,
  }),
}));

jest.mock('../../src/services/device-identity', () => ({
  getDeviceIdentityHeaders: jest.fn(async () => ({
    'x-device-id': 'device-discovery-test',
    Authorization: 'Bearer discovery-test-token',
  })),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { createElement } = require('react');
    const { View } = require('react-native');
    return createElement(View, null, header, children);
  },
}));

jest.mock('../../src/components/layout/top-bar', () => ({
  TopBar: ({ title }: { title: string }) => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, null, title);
  },
}));

jest.mock('../../src/components/common/support-ui', () => ({
  EmptyResult: ({ title, children }: { title: string; children?: React.ReactNode }) => {
    const { createElement } = require('react');
    const { Text, View } = require('react-native');
    return createElement(View, null, createElement(Text, null, title), children);
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label }: { label: string }) => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, null, label);
  },
}));

const story: DiscoveryStoryContract = {
  id: 'story-1',
  characterId: 'character-green',
  title: '漫游与走廊的漫游',
  author: '日记作者',
  coverUri: 'https://media.example/cover.png',
  date: '2026-04-25T00:00:00.000Z',
  location: '台南市',
  body: '备用正文',
  likesEnabled: true,
  likeCount: 2,
  liked: false,
  blocks: [
    {
      id: 'block-1',
      type: 'text',
      title: '街道',
      content: '雨后的霓虹映在湿润的路面上。',
      photos: [{ photoId: 'photo-1', caption: '路口的灯光', uri: 'https://media.example/inline.png' }],
    },
    {
      id: 'block-2',
      type: 'text',
      content: '灯火渐远，心也慢慢安静下来。',
      photos: [],
    },
    {
      id: 'block-3',
      type: 'quote',
      content: '留给夜晚一点安静。',
      photos: [],
    },
  ],
};

describe('Discovery story detail layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.id = story.id;
    mockGetStory.mockResolvedValue(story);
  });

  afterEach(cleanup);

  test('uses the diary paper layout and preserves public story metadata and block order', async () => {
    const screen = await render(<DiscoverDetail />);

    await waitFor(() => {
      expect(screen.getByTestId('discovery-paper-story-1')).toBeTruthy();
    });

    expect(screen.getByText(story.title, { exact: false })).toBeTruthy();
    expect(screen.getByText(/日记作者/)).toBeTruthy();
    expect(screen.getByText(/2026\.04\.25/)).toBeTruthy();
    expect(within(screen.getByTestId('discovery-paper-story-1')).queryByText(/日记作者/)).toBeNull();
    expect(screen.queryByText(story.date)).toBeNull();
    await waitFor(() => {
      expect(screen.getByLabelText('故事封面').props.source.uri).toBe(story.coverUri);
      expect(screen.getByLabelText('路口的灯光').props.source.uri).toBe(story.blocks[0]?.photos[0]?.uri);
    });
    expect(screen.getByText('雨后的霓虹映在湿润的路面上。')).toBeTruthy();
    expect(screen.getByText('灯火渐远，心也慢慢安静下来。')).toBeTruthy();
    expect(screen.getByText(/留给夜晚一点安静/)).toBeTruthy();

    expect(StyleSheet.flatten(screen.getByTestId('discovery-hero-frame-story-1').props.style)).toMatchObject({
      padding: 6,
      borderWidth: 1,
      borderColor: '#EFDFC9',
    });
    expect(StyleSheet.flatten(screen.getByTestId('discovery-row-block-1').props.style)).toMatchObject({
      flexDirection: 'column',
      gap: 14,
    });
    expect(StyleSheet.flatten(screen.getByTestId('discovery-paper-story-1').props.style)).toMatchObject({
      backgroundColor: '#FFF9ED',
      padding: 16,
    });
  });

  test('uses the same first-photo rule as a saved diary', async () => {
    mockGetStory.mockResolvedValue({
      ...story,
      blocks: [{
        ...story.blocks[0],
        photos: [
          story.blocks[0].photos[0],
          { photoId: 'photo-2', caption: '第二张', uri: 'https://media.example/second.png' },
        ],
      }],
    });
    const screen = await render(<DiscoverDetail />);
    await waitFor(() => expect(screen.getByTestId('discovery-paper-story-1')).toBeTruthy());

    expect(screen.getByLabelText('路口的灯光')).toBeTruthy();
    expect(screen.queryByLabelText('第二张')).toBeNull();
  });

  test('uses the saved diary Nordic theme when it is present in the public snapshot', async () => {
    mockGetStory.mockResolvedValue({ ...story, characterId: 'character-brown' });
    const screen = await render(<DiscoverDetail />);
    await waitFor(() => expect(screen.getByTestId('discovery-paper-story-1')).toBeTruthy());

    expect(StyleSheet.flatten(screen.getByTestId('discovery-paper-story-1').props.style)).toMatchObject({
      backgroundColor: '#F3F3ED',
      padding: 14,
    });
    expect(StyleSheet.flatten(screen.getByTestId('discovery-hero-frame-story-1').props.style).transform)
      .toEqual([{ rotate: '0deg' }]);
  });

  test('loads protected discovery cover and inline photos with current device credentials', async () => {
    const protectedCover = '/photos/discovery/story-1/photo-content?photoId=photo-1';
    const protectedInline = '/photos/discovery/story-1/photo-content?photoId=photo-2';
    mockGetStory.mockResolvedValue({
      ...story,
      coverUri: protectedCover,
      blocks: [{
        ...story.blocks[0],
        photos: [{ photoId: 'photo-2', caption: '路口的灯光', uri: protectedInline }],
      }],
    });

    const screen = await render(<DiscoverDetail />);
    await waitFor(() => {
      expect(screen.getByLabelText('故事封面').props.source).toMatchObject({
        uri: expect.stringContaining('/photos/discovery/story-1/photo-content?photoId=photo-1'),
        headers: expect.objectContaining({
          'x-device-id': 'device-discovery-test',
          Authorization: 'Bearer discovery-test-token',
        }),
      });
      expect(screen.getByLabelText('路口的灯光').props.source).toMatchObject({
        uri: expect.stringContaining('/photos/discovery/story-1/photo-content?photoId=photo-2'),
        headers: expect.objectContaining({
          'x-device-id': 'device-discovery-test',
          Authorization: 'Bearer discovery-test-token',
        }),
      });
    });
  });
});
