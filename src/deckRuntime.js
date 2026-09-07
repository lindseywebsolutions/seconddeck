const installedKey = 'seconddeck_installed_decks_v1';
const activeKey = 'seconddeck_active_deck_v1';

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function store(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  throw new Error('Local Deck storage is unavailable.');
}

export function installedDecks(storage) {
  const value = parse(store(storage).getItem(installedKey), []);
  return Array.isArray(value) ? value.filter((deck) => deck && typeof deck.id === 'string') : [];
}

export function installDeck(deck, storage) {
  if (!deck || typeof deck.id !== 'string' || !deck.layout?.widgets?.length) throw new Error('This Deck cannot be installed.');
  const target = store(storage);
  const decks = installedDecks(target).filter((item) => item.id !== deck.id);
  decks.push(deck);
  target.setItem(installedKey, JSON.stringify(decks));
  if (!target.getItem(activeKey)) target.setItem(activeKey, deck.id);
  return decks;
}

export function uninstallDeck(id, storage) {
  const target = store(storage);
  const decks = installedDecks(target).filter((deck) => deck.id !== id);
  target.setItem(installedKey, JSON.stringify(decks));
  if (target.getItem(activeKey) === id) {
    if (decks[0]) target.setItem(activeKey, decks[0].id);
    else target.removeItem(activeKey);
  }
  return decks;
}

export function setActiveDeck(id, storage) {
  const target = store(storage);
  const deck = installedDecks(target).find((item) => item.id === id);
  if (!deck) throw new Error('Install this Deck before making it active.');
  target.setItem(activeKey, id);
  return deck;
}

export function activeDeck(storage) {
  const target = store(storage);
  const id = target.getItem(activeKey);
  return installedDecks(target).find((deck) => deck.id === id) || null;
}

export function deckForPackage(packageName, decks) {
  const target = String(packageName || '').toLowerCase();
  if (!target) return null;
  return (decks || []).find((deck) => deck.target?.packageNames?.some((name) => String(name).toLowerCase() === target)) || null;
}

export function encodeDeck(deck) {
  const bytes = new TextEncoder().encode(JSON.stringify(deck));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeDeck(value) {
  try {
    const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const deck = JSON.parse(new TextDecoder().decode(bytes));
    if (!deck?.layout?.widgets?.length || typeof deck.name !== 'string') return null;
    return deck;
  } catch { return null; }
}

export function deckFromLocation(locationLike) {
  const match = String(locationLike?.hash || '').match(/^#deck=([A-Za-z0-9_-]+)$/);
  return match ? decodeDeck(match[1]) : null;
}

export const deckStorageKeys = { installedKey, activeKey };
