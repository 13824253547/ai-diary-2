import { identityClientAddress, IdentityController } from './identity.controller';
import type { IdentityAuthService } from './identity-auth.service';

describe('local Nginx identity client address', () => {
  test.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('trusts an overwritten header only from %s', peer => {
    expect(identityClientAddress({ socket: { remoteAddress: peer }, headers: { 'x-real-ip': '192.0.2.10' } }))
      .toBe('192.0.2.10');
  });
  test.each(['192.0.2.11', '172.18.0.1'])('ignores spoofed headers from %s', peer => {
    expect(identityClientAddress({ socket: { remoteAddress: peer }, headers: { 'x-real-ip': '192.0.2.10' } }))
      .toBe(peer);
  });
  test.each(['invalid', '192.0.2.10, 192.0.2.11', ['192.0.2.10']])('rejects malformed proxy values: %p', value => {
    expect(identityClientAddress({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-real-ip': value } }))
      .toBe('127.0.0.1');
  });
  test('passes the trusted client address to persistent rate limiting', () => {
    const createAttestationChallenge = jest.fn();
    const controller = new IdentityController({ createAttestationChallenge } as unknown as IdentityAuthService, {} as never);
    controller.createAttestationChallenge({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-real-ip': '2001:db8::1' } });
    expect(createAttestationChallenge).toHaveBeenCalledWith('2001:db8::1');
  });
});
