import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { GrowthArtwork } from './growth-artwork';

describe('GrowthArtwork stable tag navigation', () => {
  test.each([
    ['friends', '珍视旧友'],
    ['light', '追光的人'],
    ['mountains', '山与海'],
    ['food', '深夜食堂'],
  ])('passes stable tag ID %s for %s', async (id, text) => {
    const onLabelPress = jest.fn();
    const screen = await render(
      <GrowthArtwork kind="tree" width={459} onLabelPress={onLabelPress} />,
    );

    fireEvent.press(screen.getByLabelText(`查看${text}记忆锚点`));

    expect(onLabelPress).toHaveBeenCalledWith({ id, text });
  });

  test('shows flower titles without status text, lock icons, or translucent veils', async () => {
    const screen = await render(
      <GrowthArtwork
        kind="flowers"
        width={462}
        flowerStates={{
          pathfinder: false,
          'self-awareness': true,
          healing: false,
        }}
      />,
    );

    expect(screen.getByText('人生旷野的寻路者')).toBeTruthy();
    expect(screen.getByText('觉察自我的思考者')).toBeTruthy();
    expect(screen.getByText('压力迷茫的疗愈者')).toBeTruthy();
    expect(screen.queryByText('· 未解锁')).toBeNull();
    expect(screen.queryByText('· 已绽放')).toBeNull();
    expect(screen.queryByLabelText('pathfinder-locked')).toBeNull();
    expect(screen.queryByLabelText('healing-locked')).toBeNull();
  });

  test('uses the gray-brown closed flower for disabled items', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const screen = await render(
        <GrowthArtwork
          kind="flowers"
          width={462}
          flowerStates={{
            pathfinder: false,
            'self-awareness': true,
            healing: false,
          }}
        />,
      );

      expect(screen.getByTestId('growth-flower-art-pathfinder').props.source)
        .toEqual(require('../../../assets/restored/growth-flower-cutouts/locked-gray-brown-bud.png'));
      expect(screen.getByTestId('growth-flower-art-self-awareness').props.source)
        .toEqual(require('../../../assets/restored/growth-flower-cutouts/open-flower-a.png'));
      expect(screen.getByTestId('growth-flower-art-healing').props.source)
        .toEqual(require('../../../assets/restored/growth-flower-cutouts/locked-gray-brown-bud.png'));
    } finally {
      random.mockRestore();
    }
  });

  test('randomly selects the second open flower asset for bloomed items', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      const screen = await render(
        <GrowthArtwork
          kind="flowers"
          width={462}
          flowerStates={{
            pathfinder: false,
            'self-awareness': true,
            healing: false,
          }}
        />,
      );

      expect(screen.getByTestId('growth-flower-art-self-awareness').props.source)
        .toEqual(require('../../../assets/restored/growth-flower-cutouts/open-flower-b.png'));
    } finally {
      random.mockRestore();
    }
  });

});
