import { describe, expect, it, vi } from 'vitest';
import { createAuthService, normalizeEmail } from '../server/auth.js';

describe('passwordless authentication', () => {
  it('normalizes email and issues a token only for the matching one-time code', async () => {
    const sendCode = vi.fn();
    const service = createAuthService({
      secret: 'a-test-secret-that-is-more-than-thirty-two-characters',
      sendCode,
      now: () => 1_000,
      randomInt: () => 4242
    });
    await service.requestCode(' USER@Example.COM ');
    expect(sendCode).toHaveBeenCalledWith('user@example.com', '004242');
    expect(await service.verifyCode('user@example.com', '999999')).toBeNull();
    const token = await service.verifyCode('user@example.com', '004242');
    const user = await service.authenticateHeader(`Bearer ${token}`);
    expect(user.email).toBe('user@example.com');
  });

  it('does not send a code for malformed addresses', async () => {
    const sendCode = vi.fn();
    const service = createAuthService({ secret: 'a-test-secret-that-is-more-than-thirty-two-characters', sendCode });
    expect(await service.requestCode('not-an-email')).toEqual({ accepted: true });
    expect(sendCode).not.toHaveBeenCalled();
    expect(normalizeEmail(' A@B.COM ')).toBe('a@b.com');
  });
});
