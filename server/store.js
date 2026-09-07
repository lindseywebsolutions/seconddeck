import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const starterDeck = {
  id: 'starter-controls',
  channelId: 'starter-controls',
  schemaVersion: 1,
  kind: 'deck',
  version: 1,
  slug: 'starter-controls',
  name: 'Starter Control Deck',
  description: 'A clean companion layout with a timer, checklist, session notes, and quick controls.',
  target: { packageNames: ['com.example.game'], platforms: ['android'], deviceProfiles: ['ayn-thor', 'generic-dual-screen'] },
  layout: { columns: 2, widgets: [
    { id: 'session-checklist', type: 'checklist', title: 'Session checklist', content: 'Save game\nCheck battery\nSync progress' },
    { id: 'run-timer', type: 'timer', title: 'Run timer' },
    { id: 'quick-notes', type: 'notes', title: 'Quick notes' },
    { id: 'controls', type: 'controls', title: 'Shortcuts', content: 'Screenshot\nBrightness\nVolume' }
  ], breakpoints: [{ minWidth: 900, columns: 2 }] },
  permissions: ['external-display'], sources: [], ai: { enabled: false }, status: 'published', author: 'SecondDeck', createdAt: '2026-09-07T00:00:00.000Z'
};

export function createDeckStore(dataPath) {
  const file = path.join(dataPath, 'decks.json');
  let writes = Promise.resolve();

  async function read() {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [starterDeck];
    }
  }

  async function persist(value) {
      await fs.mkdir(dataPath, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temp, file);
  }

  function mutate(change) {
    const operation = writes.then(async () => {
      const all = await read();
      const result = change(all);
      await persist(all);
      return result;
    });
    writes = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function present(deck, user, includeReview) {
    if (includeReview || deck.author === user.email || deck.author === 'SecondDeck') return deck;
    const { author: _author, reviewedBy: _reviewedBy, ...safe } = deck;
    return { ...safe, publisher: 'Community' };
  }

  return {
    async list(user, { includeReview = false } = {}) {
      await writes;
      const all = await read();
      return all.filter((deck) => deck.status === 'published' || deck.author === user.email || (includeReview && deck.status === 'review'))
        .map((deck) => present(deck, user, includeReview));
    },
    async submit(deck, user) {
      return mutate((all) => {
        const prior = all.filter((item) => item.author === user.email && item.slug === deck.slug);
        const latestVersion = Math.max(0, ...prior.map((item) => Number(item.version || 1)));
        if (prior.length && deck.version <= latestVersion) {
          throw Object.assign(new Error(`Version ${deck.version} must be newer than the existing version ${latestVersion}.`), { statusCode: 409 });
        }
        const id = crypto.randomUUID();
        const channelId = prior[0]?.channelId || prior[0]?.id || id;
        const record = { ...deck, id, channelId, status: 'review', author: user.email, createdAt: new Date().toISOString() };
        all.push(record);
        return record;
      });
    },
    async review(id, status, user) {
      return mutate((all) => {
        const record = all.find((deck) => deck.id === id);
        if (!record) return null;
        if (status === 'published') {
          all.filter((deck) => deck.id !== id && deck.author === record.author && deck.slug === record.slug && deck.status === 'published')
            .forEach((deck) => { deck.status = 'superseded'; });
        }
        record.status = status;
        record.reviewedBy = user.email;
        record.reviewedAt = new Date().toISOString();
        return record;
      });
    }
  };
}
