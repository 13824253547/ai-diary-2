import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import RegisterScreen from '../auth/register';
import {
  AccountAuthError,
  registerAccount,
  requestRegistrationEmailCode,
} from '../../src/services/account-auth';

const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('../../src/components/auth/puzzle-captcha', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    PuzzleCaptcha: ReactModule.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      ReactModule.useImperativeHandle(ref, () => ({
        getProof: () => ({ challengeId: 'captcha-register-1', x: 214 }),
        refresh: jest.fn(async () => undefined),
      }));
      return <Text>图形验证</Text>;
    }),
  };
});

jest.mock('../../src/services/account-auth', () => ({
  AccountAuthError: class AccountAuthError extends Error {
    constructor(message: string, readonly code = 'test_error') {
      super(message);
    }
  },
  registerAccount: jest.fn(),
  requestRegistrationEmailCode: jest.fn(),
}));

describe('RegisterScreen email verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requestRegistrationEmailCode).mockResolvedValue({
      challengeId: 'email-register-1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    jest.mocked(registerAccount).mockResolvedValue({
      accessToken: 'header.payload.signature-with-enough-length-for-validation',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      user: { id: 'user-1', username: 'travel_user' },
    });
  });

  test('sends the code after the puzzle and registers with the verified email challenge', async () => {
    const screen = await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('用户名'), 'travel_user');
    await fireEvent.changeText(screen.getByLabelText('注册邮箱'), 'Travel.User@example.com');
    await fireEvent.changeText(screen.getByLabelText('设置密码'), 'secret-pass-123');
    await fireEvent.changeText(screen.getByLabelText('确认密码'), 'secret-pass-123');
    await fireEvent.press(screen.getByRole('button', { name: '发送邮箱验证码' }));

    await waitFor(() => {
      expect(requestRegistrationEmailCode).toHaveBeenCalledWith(
        'travel.user@example.com',
        'captcha-register-1',
        214,
      );
    });
    await fireEvent.changeText(screen.getByLabelText('邮箱验证码'), '001234');
    await fireEvent.press(screen.getByRole('button', { name: '创建账号' }));

    await waitFor(() => {
      expect(registerAccount).toHaveBeenCalledWith(
        'travel_user',
        'travel.user@example.com',
        'secret-pass-123',
        'email-register-1',
        '001234',
      );
    });
  });

  test('allows retrying an incorrect email code without requesting a new challenge', async () => {
    jest.mocked(registerAccount).mockRejectedValueOnce(
      new AccountAuthError('邮箱验证码无效、已过期或已使用。', 'email_verification_failed', 400),
    );
    const screen = await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('用户名'), 'travel_user');
    await fireEvent.changeText(screen.getByLabelText('注册邮箱'), 'travel@example.com');
    await fireEvent.changeText(screen.getByLabelText('设置密码'), 'secret-pass-123');
    await fireEvent.changeText(screen.getByLabelText('确认密码'), 'secret-pass-123');
    await fireEvent.press(screen.getByRole('button', { name: '发送邮箱验证码' }));
    await fireEvent.changeText(screen.getByLabelText('邮箱验证码'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: '创建账号' }));
    expect(screen.getByText('邮箱验证码无效、已过期或已使用。')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('邮箱验证码'), '001234');
    await fireEvent.press(screen.getByRole('button', { name: '创建账号' }));
    expect(registerAccount).toHaveBeenLastCalledWith(
      'travel_user', 'travel@example.com', 'secret-pass-123', 'email-register-1', '001234',
    );
    expect(requestRegistrationEmailCode).toHaveBeenCalledTimes(1);
  });

  test('allows changing a taken username without requesting another email code', async () => {
    jest.mocked(registerAccount).mockRejectedValueOnce(
      new AccountAuthError('该用户名或邮箱暂不可用。', 'account_unavailable', 409),
    );
    const screen = await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('用户名'), 'travel_user');
    await fireEvent.changeText(screen.getByLabelText('注册邮箱'), 'travel@example.com');
    await fireEvent.changeText(screen.getByLabelText('设置密码'), 'secret-pass-123');
    await fireEvent.changeText(screen.getByLabelText('确认密码'), 'secret-pass-123');
    await fireEvent.press(screen.getByRole('button', { name: '发送邮箱验证码' }));
    await fireEvent.changeText(screen.getByLabelText('邮箱验证码'), '001234');
    await fireEvent.press(screen.getByRole('button', { name: '创建账号' }));
    expect(screen.getByText('该用户名或邮箱暂不可用。')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('用户名'), 'travel_user_2');
    await fireEvent.press(screen.getByRole('button', { name: '创建账号' }));
    expect(registerAccount).toHaveBeenLastCalledWith(
      'travel_user_2', 'travel@example.com', 'secret-pass-123', 'email-register-1', '001234',
    );
    expect(requestRegistrationEmailCode).toHaveBeenCalledTimes(1);
  });
});
