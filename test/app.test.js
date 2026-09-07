import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createAuthService } from '../server/auth.js';
import { createDeckStore } from '../server/store.js';

describe('SecondDeck API', () => {
  let app; let code; let temp;
  beforeEach(async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'seconddeck-test-'));
    const authService = createAuthService({ secret: 'api-test-secret-that-is-more-than-thirty-two-characters', sendCode: async (_email, value) => { code = value; }, randomInt: () => 123456 });
    const aiService = { providerForEmail: (email) => email.endsWith('@lindseywebsolutions.com') ? 'codex' : 'ollama', ask: vi.fn(async (email) => ({ provider: email.endsWith('@lindseywebsolutions.com') ? 'codex' : 'ollama', model: 'test', answer: 'ok' })) };
    app = createApp({
      config: { publicUrl: 'https://seconddeck.test' }, authService, aiService,
      deckStore: createDeckStore(temp), mailer: { verify: async () => true }
    });
  });
  afterEach(async () => fs.rm(temp, { recursive: true, force: true }));

  async function login(email = 'friend@example.com') {
    await request(app).post('/api/auth/request-code').send({ email }).expect(202);
    const result = await request(app).post('/api/auth/verify-code').send({ email, code }).expect(200);
    return result.body.token;
  }

  it('requires a verified login for Deck data', async () => {
    await request(app).get('/api/decks').expect(401);
    const token = await login();
    const response = await request(app).get('/api/decks').set('authorization', `Bearer ${token}`).expect(200);
    expect(response.body.decks[0].status).toBe('published');
  });

  it('serves Android app-link verification as JSON instead of the SPA shell', async () => {
    const response = await request(app).get('/.well-known/assetlinks.json').expect('content-type', /json/).expect(200);
    expect(response.body[0].target.package_name).toBe('com.lindseywebsolutions.seconddeck');
  });

  it('derives the AI provider from the authenticated email', async () => {
    const publicToken = await login('friend@example.com');
    const publicResult = await request(app).post('/api/assistant').set('authorization', `Bearer ${publicToken}`).send({ prompt: 'Make a timer' }).expect(200);
    expect(publicResult.body.provider).toBe('ollama');
    const companyToken = await login('jake@lindseywebsolutions.com');
    const companyResult = await request(app).post('/api/assistant').set('authorization', `Bearer ${companyToken}`).send({ prompt: 'Make a timer' }).expect(200);
    expect(companyResult.body.provider).toBe('codex');
  });
});
