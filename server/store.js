import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const starterDeck = {
  id: 'starter-controls',
  schemaVersion: 1,
  kind: 'deck',
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

  function persist(value) {
    writes = writes.then(async () => {
      await fs.mkdir(dataPath, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temp, file);
    });
    return writes;
  }

  return {
    async list(user, { includeReview = false } = {}) {
      const all = await read();
      return all.filter((deck) => deck.status === 'published' || deck.author === user.email || includeReview);
    },
    async submit(deck, user) {
      const all = await read();
      const record = { ...deck, id: crypto.randomUUID(), status: 'review', author: user.email, createdAt: new Date().toISOString() };
      all.push(record);
      await persist(all);
      return record;
    },
    async review(id, status, user) {
      const all = await read();
      const record = all.find((deck) => deck.id === id);
      if (!record) return null;
      record.status = status;
      record.reviewedBy = user.email;
      record.reviewedAt = new Date().toISOString();
      await persist(all);
      return record;
    }
  };
}
