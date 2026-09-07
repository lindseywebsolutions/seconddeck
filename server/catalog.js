import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { validateDeck } from './deckSchema.js';

const maxCatalogFiles = 256;
const maxManifestBytes = 64 * 1024;
const manifestPattern = /(?:^deck|\.deck)\.(?:json|ya?ml)$/i;

async function findManifests(root, relative = '', depth = 0) {
  if (depth > 4) throw new Error('Catalog directories cannot be nested more than four levels.');
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await findManifests(root, child, depth + 1));
    else if (entry.isFile() && manifestPattern.test(entry.name)) files.push(child);
    if (files.length > maxCatalogFiles) throw new Error(`Catalogs cannot contain more than ${maxCatalogFiles} Deck manifests.`);
  }
  return files;
}

function parseManifest(source, filename) {
  if (Buffer.byteLength(source) > maxManifestBytes) throw new Error(`${filename} exceeds 64 KiB.`);
  try {
    if (filename.toLowerCase().endsWith('.json')) return JSON.parse(source);
    const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
    if (document.errors.length) throw document.errors[0];
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`${filename} could not be parsed: ${error.message}`);
  }
}

export async function loadDeckCatalog(catalogPath, options = {}) {
  const root = catalogPath instanceof URL ? fileURLToPath(catalogPath) : path.resolve(catalogPath);
  const repository = options.repository || 'https://github.com/lindseywebsolutions/seconddeck';
  const ref = options.ref || 'main';
  const files = await findManifests(root);
  const channels = new Set();
  const records = [];
  for (const filename of files) {
    const source = await fs.readFile(path.join(root, filename), 'utf8');
    const result = validateDeck(parseManifest(source, filename));
    if (!result.success) throw new Error(`${filename} is not a valid Deck: ${result.error.issues[0]?.message || 'invalid manifest'}`);
    const deck = result.data;
    if (channels.has(deck.slug)) throw new Error(`Catalog channel ${deck.slug} is duplicated.`);
    channels.add(deck.slug);
    records.push({
      ...deck,
      id: `catalog-${deck.slug}-v${deck.version}`,
      channelId: deck.slug,
      status: 'published',
      publisher: 'SecondDeck GitHub Catalog',
      catalog: { repository, ref, path: filename.split(path.sep).join('/') }
    });
  }
  if (!records.length) throw new Error('The Git-backed Deck catalog is empty.');
  return records;
}

export const deckCatalogLimits = { maxCatalogFiles, maxManifestBytes, maxDepth: 4 };
