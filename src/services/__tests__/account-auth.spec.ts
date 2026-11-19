import * as SecureStore from 'expo-secure-store';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { appConfig } from '../../config/app-config';
import { clearAccountPrivateData } from '../legacy-account-data-cleanup';
import {
  clearAccountSession,
  deleteAccount,
  getAccountAuthHeaders,
  getAccountUserId,
  loginAccount,
  logoutAccount,
  registerAccount,
  requestAccountDeletionEmailCode,
  requestRegistrationEmailCode,
  restoreAccountSession,
} from '../account-auth';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../legacy-account-data-cleanup', () => ({
  clearAccountPrivateData: jest.fn(),
  clearTransientAccountMediaCache: jest.fn(),
}));

describe('account auth client', () => {
  const fetchMock = jest.fn();
  const accessToken = 'header.payload.signature-with-enough-length-for-validation';
  const sessionKey = () => `orange-glow-account-session-v2-${bytesToHex(
    sha256(utf8ToBytes(appConfig.backendBaseUrl)),
  )}`;

  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await clearAccountSession();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  });

  test('stores the signed-in account in secure storage and sends only the bearer token', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 201,
      json: async () => ({
        ok: true,
        data: {
          accessToken,
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          user: { id: 'user-1', username: 'travel_user' },
        },
      }),
    });

    await loginAccount('travel_user', 'secret-pass-123', 'captcha-1', 222);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/login$/), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        username: 'travel_user',
        password: 'secret-pass-123',
        captcha: { challengeId: 'captcha-1', x: 222 },
      }),
    }));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      sessionKey(),
      expect.stringContaining('"id":"user-1"'),
      expect.objectContaining({ keychainAccessible: 'when-unlocked-this-device-only' }),
    );
    await expect(getAccountAuthHeaders()).resolves.toEqual({ Authorization: `Bearer ${accessToken}` });
    await expect(getAccountUserId()).resolves.toBe('user-1');
  });

  test('requests registration email codes with the completed puzzle proof', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 201,
      json: async () => ({
        ok: true,
        data: { challengeId: 'email-challenge-1', expiresAt: new Date(Date.now() + 600_000).toISOString() },
      }),
    });

    await expect(requestRegistrationEmailCode('user@example.com', 'captcha-1', 221))
      .resolves.toMatchObject({ challengeId: 'email-challenge-1' });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/register\/email-code$/), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        email: 'user@example.com',
        captcha: { challengeId: 'captcha-1', x: 221 },
      }),
    }));
  });

  test('registers with a verified email challenge and stores the returned account session', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 201,
      json: async () => ({
        ok: true,
        data: {
          accessToken,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          user: { id: 'user-1', username: 'travel_user' },
        },
      }),
    });

    await registerAccount('travel_user', 'user@example.com', 'secret-pass-123', 'email-challenge-1', '001234');

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/register$/), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        username: 'travel_user',
        email: 'user@example.com',
        password: 'secret-pass-123',
        emailChallengeId: 'email-challenge-1',
        emailCode: '001234',
      }),
    }));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      sessionKey(),
      expect.stringContaining('"id":"user-1"'),
      expect.any(Object),
    );
  });

  test('restores a session from secure storage and clears it when the server revoked it', async () => {
    const stored = {
      accessToken,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 'user-1', username: 'travel_user' },
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(stored));
    fetchMock.mockResolvedValueOnce({ status: 401, json: async () => ({ ok: false }) });

    await expect(restoreAccountSession()).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(sessionKey());
  });

  test('keeps the stored session when the account server temporarily fails', async () => {
    const stored = {
      accessToken,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 'user-1', username: 'travel_user' },
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(stored));
    fetchMock.mockResolvedValueOnce({ status: 503, json: async () => { throw new Error('gateway error'); } });
    jest.mocked(SecureStore.deleteItemAsync).mockClear();

    await expect(restoreAccountSession()).resolves.toEqual(stored);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  test('logout attempts server revocation and always clears the local token', async () => {
    const stored = {
      accessToken,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 'user-1', username: 'travel_user' },
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(stored));
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, data: { id: 'user-1', username: 'travel_user' } }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
      });
    await restoreAccountSession();

    await expect(logoutAccount()).resolves.toEqual({ serverRevoked: true });
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/auth\/logout$/), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}` }),
    }));
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(sessionKey());
  });

  test('clears local account data when server deletion is committed but media cleanup is pending', async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          ok: true,
          data: {
            accessToken,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            user: { id: 'user-1', username: 'travel_user' },
          },
        }),
      })
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          ok: true,
          data: { challengeId: 'delete-challenge-1', expiresAt: new Date(Date.now() + 600_000).toISOString(), maskedEmail: 'u***@example.com' },
        }),
      })
      .mockResolvedValueOnce({
        status: 503,
        json: async () => ({
          ok: false,
          error: { code: 'account_cleanup_pending', message: '清理处理中。' },
        }),
      });
    await loginAccount('travel_user', 'secret-pass-123', 'captcha-1', 222);

    await expect(requestAccountDeletionEmailCode('secret-pass-123')).resolves.toMatchObject({
      challengeId: 'delete-challenge-1',
      maskedEmail: 'u***@example.com',
    });
    await expect(deleteAccount('secret-pass-123', 'delete-challenge-1', '001234'))
      .resolves.toEqual({ cleanupPending: true });
    expect(clearAccountPrivateData).toHaveBeenCalledWith('user-1');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(sessionKey());
  });

  test('stores and restores sessions under keys scoped to the backend address', async () => {
    const originalBaseUrl = appConfig.backendBaseUrl;
    const storedByKey = new Map<string, string>();
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      storedByKey.set(key, value);
    });
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => storedByKey.get(key) ?? null);
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => {
      storedByKey.delete(key);
    });
    try {
      appConfig.backendBaseUrl = 'https://production.example.test/api';
      fetchMock.mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          ok: true,
          data: {
            accessToken,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            user: { id: 'user-1', username: 'travel_user' },
          },
        }),
      });
      await loginAccount('travel_user', 'secret-pass-123', 'captcha-1', 222);
      const productionKey = sessionKey();
      appConfig.backendBaseUrl = 'http://127.0.0.1:3001/api';
      const localKey = sessionKey();

      expect(localKey).not.toBe(productionKey);
      await expect(restoreAccountSession()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(storedByKey.has(productionKey)).toBe(true);
    } finally {
      appConfig.backendBaseUrl = originalBaseUrl;
    }
  });
});
