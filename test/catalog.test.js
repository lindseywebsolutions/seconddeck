import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDeckCatalog } from '../server/catalog.js';
import { createDeckStore } from '../server/store.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('Git-backed Deck catalog', () => {
  it('loads repository JSON and YAML manifests with release provenance', async () => {
    const catalog = await loadDeckCatalog(new URL('../catalog', import.meta.url), { ref: 'v-test', assetBaseUrl: 'https://seconddeck.test/catalog-assets' });
    expect(catalog.map((deck) => deck.slug)).toEqual(['retroarch-session', 'starter-controls']);
    expect(catalog.every((deck) => deck.status === 'published' && deck.channelId === deck.slug)).toBe(true);
    expect(catalog[0].catalog).toMatchObject({ repository: 'https://github.com/lindseywebsolutions/seconddeck', ref: 'v-test', path: 'catalog/retroarch-session/deck.yaml' });
    expect(catalog[0].package).toMatchObject({ license: 'MIT', defaultLocale: 'en', availableLocales: ['en', 'es'], icon: { path: 'catalog/retroarch-session/icon.svg', url: 'https://seconddeck.test/catalog-assets/retroarch-session/icon.svg' } });
    expect(catalog[0].package.icon.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(catalog[0].localizations.es.widgets['route-guide'].title).toBe('Guía de ruta');
  });

  it('rejects executable or schema-invalid catalog files before startup', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seconddeck-catalog-'));
    temporaryDirectories.push(directory);
    await fs.writeFile(path.join(directory, 'deck.json'), JSON.stringify({ schemaVersion: 1, script: 'alert(1)' }));
    await expect(loadDeckCatalog(directory)).rejects.toThrow('is not a valid Deck');
  });

  it('rejects duplicate stable channels', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seconddeck-catalog-'));
    temporaryDirectories.push(directory);
    const source = JSON.parse(await fs.readFile(new URL('../catalog/starter-controls/deck.json', import.meta.url), 'utf8'));
    await fs.mkdir(path.join(directory, 'one')); await fs.mkdir(path.join(directory, 'two'));
    await fs.writeFile(path.join(directory, 'one', 'deck.json'), JSON.stringify(source));
    await fs.writeFile(path.join(directory, 'two', 'deck.json'), JSON.stringify(source));
    await expect(loadDeckCatalog(directory)).rejects.toThrow('duplicated');
  });

  it('rejects unsafe package paths and SVG content', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seconddeck-catalog-'));
    temporaryDirectories.push(directory);
    const source = JSON.parse(await fs.readFile(new URL('../catalog/starter-controls/deck.json', import.meta.url), 'utf8'));
    await fs.writeFile(path.join(directory, 'deck.json'), JSON.stringify(source));
    await fs.writeFile(path.join(directory, 'metadata.json'), JSON.stringify({ schemaVersion: 1, license: 'MIT', icon: '../outside.svg' }));
    await expect(loadDeckCatalog(directory)).rejects.toThrow('Package paths must stay inside');
    await fs.writeFile(path.join(directory, 'metadata.json'), JSON.stringify({ schemaVersion: 1, license: 'MIT', icon: 'icon.svg' }));
    await fs.writeFile(path.join(directory, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://tracker.example/style.css";</style></svg>');
    await expect(loadDeckCatalog(directory)).rejects.toThrow('not a self-contained safe SVG');
  });

  it('rejects locale overrides for widgets outside the manifest', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seconddeck-catalog-'));
    temporaryDirectories.push(directory);
    const source = JSON.parse(await fs.readFile(new URL('../catalog/starter-controls/deck.json', import.meta.url), 'utf8'));
    await fs.writeFile(path.join(directory, 'deck.json'), JSON.stringify(source));
    await fs.writeFile(path.join(directory, 'metadata.json'), JSON.stringify({ schemaVersion: 1, license: 'MIT' }));
    await fs.mkdir(path.join(directory, 'locales'));
    await fs.writeFile(path.join(directory, 'locales', 'es.json'), JSON.stringify({ widgets: { invented: { title: 'Inventado' } } }));
    await expect(loadDeckCatalog(directory)).rejects.toThrow('Unknown widget invented');
  });

  it('keeps curated records out of the PVC and reserves their review boundary', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seconddeck-store-'));
    temporaryDirectories.push(directory);
    const catalog = await loadDeckCatalog(new URL('../catalog', import.meta.url), { ref: 'v-test' });
    const store = createDeckStore(directory, { catalog });
    const user = { email: 'creator@example.com' };
    await expect(store.submit({ ...catalog[0] }, user)).rejects.toThrow('belongs to the GitHub catalog');
    await expect(store.review(catalog[0].id, 'rejected', { email: 'reviewer@lindseywebsolutions.com' })).rejects.toThrow('reviewed through the repository');
    const source = JSON.parse(await fs.readFile(new URL('../catalog/starter-controls/deck.json', import.meta.url), 'utf8'));
    await store.submit({ ...source, slug: 'creator-session', name: 'Creator Session' }, user);
    const persisted = JSON.parse(await fs.readFile(path.join(directory, 'decks.json'), 'utf8'));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty('catalog');
    expect((await store.list(user)).filter((deck) => deck.catalog)).toHaveLength(2);
  });
});
