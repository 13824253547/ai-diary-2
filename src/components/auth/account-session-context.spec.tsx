import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AccountSessionProvider, useAccountSession } from './account-session-context';
import * as legacyCleanup from '../../services/legacy-account-data-cleanup';

jest.mock('../../services/account-auth', () => ({
  clearAccountSession: jest.fn(),
  restoreAccountSession: jest.fn().mockResolvedValue(undefined),
  subscribeAccountSession: jest.fn(() => jest.fn()),
}));

jest.mock('../../services/legacy-account-data-cleanup', () => ({
  clearLegacyAnonymousLocalData: jest.fn(),
  clearTransientAccountMediaCache: jest.fn(),
}));

jest.mock('../../store/use-app-store', () => ({
  useAppStore: { getState: jest.fn(), getInitialState: jest.fn(), setState: jest.fn() },
}));

function SessionStatus() {
  const { ready } = useAccountSession();
  return <Text>{ready ? 'ready' : 'loading'}</Text>;
}

test('restores account state without inspecting or deleting legacy anonymous data', async () => {
  const screen = await render(
    <AccountSessionProvider>
      <SessionStatus />
    </AccountSessionProvider>,
  );
  await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
  const mock = legacyCleanup as unknown as { clearLegacyAnonymousLocalData: jest.Mock };
  expect(mock.clearLegacyAnonymousLocalData).not.toHaveBeenCalled();
});
