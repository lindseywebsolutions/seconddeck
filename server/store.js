import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function createDeckStore(dataPath, { catalog = [] } = {}) {
  const file = path.join(dataPath, 'decks.json');
  let writes = Promise.resolve();

  async function read() {
    let records;
    try { records = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      records = [];
    }
    if (!Array.isArray(records)) throw new Error('Deck storage is invalid.');
    const catalogChannels = new Set(catalog.map((deck) => deck.channelId));
    return [...records.filter((deck) => !deck.catalog && !catalogChannels.has(deck.channelId || deck.id)), ...catalog];
  }

  async function persist(value) {
      await fs.mkdir(dataPath, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(value.filter((deck) => !deck.catalog), null, 2)}\n`, { mode: 0o600 });
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
    if (deck.catalog || includeReview || deck.author === user.email) return deck;
    const { author: _author, reviewedBy: _reviewedBy, ...safe } = deck;
    return { ...safe, publisher: deck.publisher || 'Community' };
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
        if (all.some((item) => item.catalog && item.slug === deck.slug)) {
          throw Object.assign(new Error('This slug belongs to the GitHub catalog. Choose a distinct Deck slug.'), { statusCode: 409 });
        }
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
        if (record.catalog) throw Object.assign(new Error('GitHub catalog Decks are reviewed through the repository.'), { statusCode: 409 });
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
