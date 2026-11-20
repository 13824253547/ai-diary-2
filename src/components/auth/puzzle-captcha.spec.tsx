import React, { createRef } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { requestCaptcha } from '../../services/account-auth';
import { PuzzleCaptcha, type PuzzleCaptchaHandle } from './puzzle-captcha';

jest.mock('../../services/account-auth', () => ({
  AccountAuthError: class AccountAuthError extends Error {},
  requestCaptcha: jest.fn(),
}));

describe('PuzzleCaptcha', () => {
  beforeEach(() => {
    jest.mocked(requestCaptcha).mockResolvedValue({
      challengeId: 'challenge', background: 'background', piece: 'piece',
      width: 320, height: 160, pieceTop: 50, pieceSize: 48, expiresAt: '2026-12-01T00:00:00Z',
    });
  });

  test.each([240, 400])('maps dragging to image coordinates at width %i', async width => {
    const ref = createRef<PuzzleCaptchaHandle>();
    const screen = await render(<PuzzleCaptcha purpose="register" ref={ref} />);
    await waitFor(() => expect(screen.getByLabelText('可移动拼图块')).toBeTruthy());
    await fireEvent(screen.getByLabelText('拼图验证背景'), 'layout', { nativeEvent: { layout: { width } } });
    const slider = screen.getByLabelText('拖动拼图块，对齐缺口');
    const touch = (x: number, time: number) => ({
      touchHistory: {
        numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: time,
        touchBank: [{
          touchActive: true, currentTimeStamp: time, currentPageX: x, currentPageY: 0,
          previousPageX: 0, previousPageY: 0,
        }],
      },
    });
    await fireEvent(slider, 'responderGrant', touch(0, 1));
    await fireEvent(slider, 'responderMove', touch(width / 2, 2));
    const piece = screen.getByLabelText('可移动拼图块');
    expect(piece.props.style.left).toBeCloseTo(width / 2);
    expect(piece.props.style.top).toBeCloseTo(width * 50 / 320);
    expect(ref.current?.getProof()).toEqual({ challengeId: 'challenge', x: 160 });
  });

  test('resets the piece after refreshing', async () => {
    const ref = createRef<PuzzleCaptchaHandle>();
    const screen = await render(<PuzzleCaptcha purpose="login" ref={ref} />);
    await waitFor(() => expect(screen.getByLabelText('可移动拼图块')).toBeTruthy());
    await fireEvent(screen.getByLabelText('拖动拼图块，对齐缺口'), 'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } });
    expect(ref.current?.getProof()?.x).toBe(8);
    await fireEvent.press(screen.getByLabelText('刷新图形验证'));
    await waitFor(() => expect(ref.current?.getProof()?.x).toBe(0));
    expect(requestCaptcha).toHaveBeenCalledWith('login');
  });
});
