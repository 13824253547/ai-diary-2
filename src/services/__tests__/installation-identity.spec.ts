import { createHash, createPublicKey, verify } from 'node:crypto';
import { createInstallationIdentity } from '../installation-identity';

describe('installation identity client', () => {
  const now = Date.UTC(2026, 9, 29);
  const deviceId = 'device-12345678-1234-1234-1234-123456789abc';
  let storage: Map<string, string>;
  let random: jest.Mock;
  let request: jest.Mock;
  let clock: number;
  let write: jest.Mock;
  let dependencies: Parameters<typeof createInstallationIdentity>[0];

  beforeEach(() => {
    storage = new Map();
    random = jest.fn(async () => new Uint8Array(32).fill(7));
    clock = now;
    write = jest.fn(async (key, value) => { storage.set(key, value); });
    request = jest.fn(async (path, body) => {
      const keyId = `install-${createHash('sha256').update(Buffer.from(body.publicKey, 'hex')).digest('hex')}`;
      if (path.endsWith('/challenge')) {
        const challengeId = '12345678-1234-1234-1234-123456789abc';
        return {
          keyId, challengeId,
          payload: JSON.stringify({
            protocol: 'installation-ed25519-v1', action: 'authenticate-installation',
            challengeId, keyId, challenge: 'A'.repeat(43),
          }),
        };
      }
      const payload = request.mock.results[request.mock.results.length - 2].value;
      const challenge = await payload;
      const publicKey = createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(body.publicKey, 'hex')]),
        type: 'spki', format: 'der',
      });
      expect(verify(null, Buffer.from(challenge.payload), publicKey, Buffer.from(body.signature, 'hex'))).toBe(true);
      return { deviceId, accessToken: 't'.repeat(200), expiresAt: new Date(clock + 3_600_000).toISOString() };
    });
    dependencies = { read: async key => storage.get(key) ?? null, write, randomBytes: random, request, now: () => clock };
  });

  it('persists the key before enrollment, shares concurrent work and signs a Node-verifiable proof', async () => {
    const client = createInstallationIdentity(dependencies);
    const [a, b] = await Promise.all([client.ensure(), client.ensure()]);
    expect(a.deviceId).toBe(deviceId);
    expect(b).toBe(a);
    expect(request).toHaveBeenCalledTimes(2);
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0]);
    await client.ensure();
    expect(request).toHaveBeenCalledTimes(2);
    await createInstallationIdentity(dependencies).ensure();
    expect(random).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('renews near expiry with the same key and restores identity after a lost response', async () => {
    const client = createInstallationIdentity(dependencies);
    await client.ensure();
    const firstPublicKey = request.mock.calls[0][1].publicKey;
    clock += 56 * 60 * 1000;
    await client.ensure();
    expect(request.mock.calls[2][1].publicKey).toBe(firstPublicKey);
    const key = [...storage.keys()][0];
    const stored = JSON.parse(storage.get(key)!);
    delete stored.identity;
    storage.set(key, JSON.stringify(stored));
    await createInstallationIdentity(dependencies).ensure();
    expect(request.mock.calls[4][1].publicKey).toBe(firstPublicKey);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('never replaces credentials after failure or shares them across API origins', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    const client = createInstallationIdentity(dependencies, 'https://production.example/api');
    await expect(client.ensure()).rejects.toThrow('offline');
    await client.ensure();
    expect(random).toHaveBeenCalledTimes(1);
    await createInstallationIdentity(dependencies, 'https://staging.example/api').ensure();
    expect(storage.size).toBe(2);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid challenges before signing or requesting a token', async () => {
    request.mockResolvedValueOnce({ payload: '{}', challengeId: 'invalid', keyId: 'invalid' });
    await expect(createInstallationIdentity(dependencies).ensure()).rejects.toThrow('无效挑战');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not silently create a new identity when Keychain writing fails', async () => {
    write.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(createInstallationIdentity(dependencies).ensure()).rejects.toThrow('keychain locked');
    expect(request).not.toHaveBeenCalled();
  });

  it('retries transient network failures with a new challenge and keeps the original key', async () => {
    request.mockRejectedValueOnce(new TypeError('network unavailable'));
    const wait = jest.fn(async () => undefined);
    await expect(createInstallationIdentity({ ...dependencies, wait }).ensure()).resolves.toMatchObject({ deviceId });
    expect(wait).toHaveBeenCalledWith(3000);
    expect(random).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(3);
  });
});
