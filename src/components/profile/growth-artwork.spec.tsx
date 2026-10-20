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
});
