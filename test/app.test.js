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
    const aiService = { providerForEmail: (email) => email.endsWith('@lindseywebsolutions.com') ? 'codex' : 'ollama', ask: vi.fn(async (email, prompt) => ({ provider: email.endsWith('@lindseywebsolutions.com') ? 'codex' : 'ollama', model: 'test', answer: prompt.includes('JSON object') ? JSON.stringify({ name: 'Generated Session', description: 'A generated and validated handheld session layout.', columns: 2, widgets: [{ type: 'timer', title: 'Session timer' }, { type: 'notes', title: 'Notes' }] }) : 'ok' })) };
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

  it('advertises the portable Deck contract', async () => {
    const response = await request(app).get('/api/config').expect(200);
    expect(response.body).toMatchObject({ deckSchemaVersion: 1, deckFileFormats: ['json', 'yaml'], maxDeckFileBytes: 65_536 });
  });

  it('derives the AI provider from the authenticated email', async () => {
    const publicToken = await login('friend@example.com');
    const publicResult = await request(app).post('/api/assistant').set('authorization', `Bearer ${publicToken}`).send({ prompt: 'Make a timer' }).expect(200);
    expect(publicResult.body.provider).toBe('ollama');
    const companyToken = await login('jake@lindseywebsolutions.com');
    const companyResult = await request(app).post('/api/assistant').set('authorization', `Bearer ${companyToken}`).send({ prompt: 'Make a timer' }).expect(200);
    expect(companyResult.body.provider).toBe('codex');
  });

  it('requires login and returns only a validated AI Deck draft', async () => {
    const body = { prompt: 'Build a timer and notes for a long RPG session.', packageName: 'com.example.rpg', deviceProfile: 'ayn-thor' };
    await request(app).post('/api/assistant/deck-draft').send(body).expect(401);
    const token = await login('creator@example.com');
    const response = await request(app).post('/api/assistant/deck-draft').set('authorization', `Bearer ${token}`).send(body).expect(200);
    expect(response.body).toMatchObject({ provider: 'ollama', model: 'test', deck: { schemaVersion: 1, name: 'Generated Session', target: { packageNames: ['com.example.rpg'] }, sources: [], permissions: ['external-display'], ai: { enabled: true } } });
    expect(response.body.answer).toBeUndefined();
    await request(app).post('/api/assistant/deck-draft').set('authorization', `Bearer ${token}`).send({ ...body, packageName: 'not a package' }).expect(400);
  });

  it('keeps submissions private until a company reviewer publishes them', async () => {
    const manifest = {
      schemaVersion: 1,
      kind: 'deck',
      slug: 'community-route',
      name: 'Community Route',
      description: 'A reviewed route and checklist for community sessions.',
      target: { packageNames: ['org.example.community'], platforms: ['android'], deviceProfiles: ['ayn-thor'] },
      layout: { columns: 1, breakpoints: [{ minWidth: 700, columns: 2 }], widgets: [{ id: 'route', type: 'guide', title: 'Route', content: 'Head north' }] },
      permissions: ['external-display'], sources: [], ai: { enabled: false }
    };
    const authorToken = await login('creator@example.com');
    const submitted = await request(app).post('/api/decks').set('authorization', `Bearer ${authorToken}`).send(manifest).expect(201);
    expect(submitted.body.deck.status).toBe('review');
    expect(submitted.body.deck.version).toBe(1);
    await request(app).post(`/api/decks/${submitted.body.deck.id}/review`).set('authorization', `Bearer ${authorToken}`).send({ status: 'published' }).expect(403);

    const reviewerToken = await login('reviewer@lindseywebsolutions.com');
    const reviewQueue = await request(app).get('/api/decks').set('authorization', `Bearer ${reviewerToken}`).expect(200);
    expect(reviewQueue.body.decks.some((deck) => deck.id === submitted.body.deck.id)).toBe(true);
    await request(app).post(`/api/decks/${submitted.body.deck.id}/review`).set('authorization', `Bearer ${reviewerToken}`).send({ status: 'published' }).expect(200);

    const viewerToken = await login('viewer@example.com');
    const catalog = await request(app).get('/api/decks').set('authorization', `Bearer ${viewerToken}`).expect(200);
    const publicDeck = catalog.body.decks.find((deck) => deck.id === submitted.body.deck.id);
    expect(publicDeck?.status).toBe('published');
    expect(publicDeck).toMatchObject({ publisher: 'Community' });
    expect(publicDeck.author).toBeUndefined();

    await request(app).post('/api/decks').set('authorization', `Bearer ${authorToken}`).send({ ...manifest, version: 1 }).expect(409);
    const revision = await request(app).post('/api/decks').set('authorization', `Bearer ${authorToken}`).send({ ...manifest, version: 2, description: 'A safer second revision of the community route and checklist.' }).expect(201);
    expect(revision.body.deck.channelId).toBe(submitted.body.deck.channelId);
    const catalogDuringReview = await request(app).get('/api/decks').set('authorization', `Bearer ${viewerToken}`).expect(200);
    expect(catalogDuringReview.body.decks.find((deck) => deck.slug === manifest.slug)?.version).toBe(1);
    await request(app).post(`/api/decks/${revision.body.deck.id}/review`).set('authorization', `Bearer ${reviewerToken}`).send({ status: 'published' }).expect(200);
    const updatedCatalog = await request(app).get('/api/decks').set('authorization', `Bearer ${viewerToken}`).expect(200);
    expect(updatedCatalog.body.decks.filter((deck) => deck.slug === manifest.slug).map((deck) => deck.version)).toEqual([2]);
  });

  it('serializes concurrent revisions on one stable channel', async () => {
    const token = await login('parallel@example.com');
    const manifest = {
      schemaVersion: 1, kind: 'deck', version: 1, slug: 'parallel-route', name: 'Parallel Route',
      description: 'A versioned Deck used to verify serialized community updates.',
      target: { packageNames: ['org.example.parallel'], platforms: ['android'], deviceProfiles: ['ayn-thor'] },
      layout: { columns: 1, breakpoints: [], widgets: [{ id: 'notes', type: 'notes', title: 'Notes' }] },
      permissions: ['external-display'], sources: [], ai: { enabled: false }
    };
    await request(app).post('/api/decks').set('authorization', `Bearer ${token}`).send(manifest).expect(201);
    const attempts = await Promise.all([
      request(app).post('/api/decks').set('authorization', `Bearer ${token}`).send({ ...manifest, version: 2 }),
      request(app).post('/api/decks').set('authorization', `Bearer ${token}`).send({ ...manifest, version: 2 })
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409]);
  });
});
