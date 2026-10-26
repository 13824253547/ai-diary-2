import { ensureDeviceIdentity, getDeviceIdentityHeaders } from '../device-identity';

describe('device identity headers', () => {
  it('uses a deterministic test identity without contacting the attestation service', async () => {
    expect(await ensureDeviceIdentity()).toBe('device-jest');
    await expect(getDeviceIdentityHeaders()).resolves.toEqual({
      'x-device-id': 'device-jest',
    });
  });

  it('uses the development identity when the native App Attest module is absent', async () => {
    const originalWorkerId = process.env.JEST_WORKER_ID;
    const originalDevDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
    delete process.env.JEST_WORKER_ID;
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
    jest.resetModules();
    jest.doMock('react-native', () => new Proxy(jest.requireActual('react-native'), {
      get(target, property) {
        if (property === 'Platform') return { OS: 'ios' };
        return Reflect.get(target, property);
      },
    }));
    jest.doMock('expo-file-system/legacy', () => ({ documentDirectory: null }));

    try {
      expect(process.env.JEST_WORKER_ID).toBeUndefined();
      expect(jest.requireMock('react-native').Platform.OS).toBe('ios');
      let identity: typeof import('../device-identity') | undefined;
      jest.isolateModules(() => {
        expect(require('react-native').Platform.OS).toBe('ios');
        identity = require('../device-identity') as typeof import('../device-identity');
      });
      await expect(identity!.ensureDeviceIdentity()).resolves.toMatch(/^device-(?!jest$)/);
    } finally {
      jest.dontMock('react-native');
      jest.dontMock('expo-file-system/legacy');
      jest.resetModules();
      if (originalWorkerId === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = originalWorkerId;
      if (originalDevDescriptor) Object.defineProperty(globalThis, '__DEV__', originalDevDescriptor);
      else delete (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__;
    }
  });
});
