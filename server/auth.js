import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const codeTtlMs = 10 * 60 * 1000;
const requestCooldownMs = 45 * 1000;
const maxAttempts = 5;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function createAuthService({ secret, sendCode, now = () => Date.now(), randomInt = crypto.randomInt }) {
  if (!secret || secret.length < 32) throw new Error('Session secret must contain at least 32 characters');
  const key = new TextEncoder().encode(secret);
  const pending = new Map();

  function digest(email, code) {
    return crypto.createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
  }

  async function requestCode(rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) return { accepted: true };
    const existing = pending.get(email);
    if (existing && now() - existing.requestedAt < requestCooldownMs) return { accepted: true };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    pending.set(email, { hash: digest(email, code), requestedAt: now(), expiresAt: now() + codeTtlMs, attempts: 0 });
    await sendCode(email, code);
    return { accepted: true };
  }

  async function verifyCode(rawEmail, rawCode) {
    const email = normalizeEmail(rawEmail);
    const record = pending.get(email);
    const code = String(rawCode || '').trim();
    if (!record || record.expiresAt < now() || record.attempts >= maxAttempts) {
      pending.delete(email);
      return null;
    }
    record.attempts += 1;
    const actual = Buffer.from(record.hash, 'hex');
    const candidate = Buffer.from(digest(email, code), 'hex');
    if (actual.length !== candidate.length || !crypto.timingSafeEqual(actual, candidate)) return null;
    pending.delete(email);
    return new SignJWT({ email, email_verified: true })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(email)
      .setIssuer('seconddeck')
      .setAudience('seconddeck-app')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(key);
  }

  async function authenticateHeader(header) {
    const match = /^Bearer\s+(.+)$/i.exec(String(header || ''));
    if (!match) return null;
    try {
      const { payload } = await jwtVerify(match[1], key, { issuer: 'seconddeck', audience: 'seconddeck-app' });
      const email = normalizeEmail(payload.email);
      if (!payload.email_verified || !isValidEmail(email)) return null;
      return { email, sub: payload.sub };
    } catch {
      return null;
    }
  }

  return { requestCode, verifyCode, authenticateHeader };
}

export function requireUser(authService) {
  return async (req, res, next) => {
    const user = await authService.authenticateHeader(req.get('authorization'));
    if (!user) return res.status(401).json({ error: 'Sign in is required.' });
    req.user = user;
    next();
  };
}
