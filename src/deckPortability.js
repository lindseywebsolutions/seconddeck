import { parseDocument } from 'yaml';
import { validateDeck } from '../server/deckSchema.js';

export const maxDeckBytes = 64 * 1024;
const manifestKeys = ['schemaVersion', 'kind', 'version', 'slug', 'name', 'description', 'target', 'layout', 'permissions', 'sources', 'ai'];

export function deckIdentity(deck) {
  return String(deck?.channelId || deck?.id || '');
}

export function portableDeck(deck) {
  const candidate = Object.fromEntries(manifestKeys.filter((key) => deck?.[key] !== undefined).map((key) => [key, deck[key]]));
  const result = validateDeck(candidate);
  if (!result.success) throw new Error(`Deck validation failed: ${result.error.issues[0]?.message || 'invalid manifest'}`);
  return result.data;
}

export function parsePortableDeck(text) {
  const source = String(text || '');
  if (!source.trim()) throw new Error('Choose a non-empty Deck JSON or YAML file.');
  if (new TextEncoder().encode(source).byteLength > maxDeckBytes) throw new Error('Deck files cannot exceed 64 KiB.');
  let candidate;
  try {
    if (source.trimStart().startsWith('{')) candidate = JSON.parse(source);
    else {
      const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
      if (document.errors.length) throw document.errors[0];
      candidate = document.toJS({ maxAliasCount: 0 });
    }
  } catch (error) {
    throw new Error(`Could not parse this Deck: ${error.message}`);
  }
  const result = validateDeck(candidate);
  if (!result.success) throw new Error(`Deck validation failed: ${result.error.issues[0]?.message || 'invalid manifest'}`);
  return result.data;
}

export function localDeck(manifest, origin = 'Imported file') {
  const deck = portableDeck(manifest);
  const channelId = `local:${deck.slug}`;
  return { ...deck, id: channelId, channelId, status: 'local', author: origin };
}

export function serializeDeck(deck) {
  return `${JSON.stringify(portableDeck(deck), null, 2)}\n`;
}

export function mergeCatalogWithInstalled(catalog = [], installed = []) {
  const catalogIds = new Set(catalog.map(deckIdentity));
  return [...installed.filter((deck) => !catalogIds.has(deckIdentity(deck))), ...catalog];
}

export function installedRevision(deck, installed = []) {
  const identity = deckIdentity(deck);
  return installed.find((candidate) => deckIdentity(candidate) === identity) || null;
}

export function hasDeckUpdate(deck, installed = []) {
  const current = installedRevision(deck, installed);
  return Boolean(current && Number(deck.version || 1) > Number(current.version || 1));
}
