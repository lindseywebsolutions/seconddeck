const installedKey = 'seconddeck_installed_decks_v1';
const activeKey = 'seconddeck_active_deck_v1';
const yieldedPackagesKey = 'seconddeck_yielded_packages_v1';
const androidPackagePattern = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/i;

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function store(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  throw new Error('Local Deck storage is unavailable.');
}

function identity(deck) {
  return String(deck?.channelId || deck?.id || '');
}

export function installedDecks(storage) {
  const value = parse(store(storage).getItem(installedKey), []);
  return Array.isArray(value) ? value.filter((deck) => deck && typeof deck.id === 'string') : [];
}

export function installDeck(deck, storage) {
  if (!deck || typeof deck.id !== 'string' || !deck.layout?.widgets?.length) throw new Error('This Deck cannot be installed.');
  const target = store(storage);
  const deckId = identity(deck);
  const current = installedDecks(target).find((item) => identity(item) === deckId);
  if (current && Number(deck.version || 1) < Number(current.version || 1)) throw new Error('A newer revision of this Deck is already installed.');
  const decks = installedDecks(target).filter((item) => identity(item) !== deckId);
  decks.push(deck);
  target.setItem(installedKey, JSON.stringify(decks));
  if (!target.getItem(activeKey) || target.getItem(activeKey) === current?.id) target.setItem(activeKey, deckId);
  return decks;
}

export function uninstallDeck(id, storage) {
  const target = store(storage);
  const currentDecks = installedDecks(target);
  const removed = currentDecks.find((deck) => deck.id === id || identity(deck) === id);
  const decks = currentDecks.filter((deck) => deck !== removed);
  target.setItem(installedKey, JSON.stringify(decks));
  if (removed && [removed.id, identity(removed)].includes(target.getItem(activeKey))) {
    if (decks[0]) target.setItem(activeKey, identity(decks[0]));
    else target.removeItem(activeKey);
  }
  return decks;
}

export function setActiveDeck(id, storage) {
  const target = store(storage);
  const deck = installedDecks(target).find((item) => item.id === id || identity(item) === id);
  if (!deck) throw new Error('Install this Deck before making it active.');
  target.setItem(activeKey, identity(deck));
  return deck;
}

export function activeDeck(storage) {
  const target = store(storage);
  const id = target.getItem(activeKey);
  return installedDecks(target).find((deck) => deck.id === id || identity(deck) === id) || null;
}

export function deckForPackage(packageName, decks) {
  const target = String(packageName || '').toLowerCase();
  if (!target) return null;
  return (decks || []).find((deck) => deck.target?.packageNames?.some((name) => String(name).toLowerCase() === target)) || null;
}

function normalizedPackageName(packageName) {
  const value = String(packageName || '').trim().toLowerCase();
  return value.length <= 200 && androidPackagePattern.test(value) ? value : null;
}

export function yieldedPackages(storage) {
  const value = parse(store(storage).getItem(yieldedPackagesKey), []);
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedPackageName).filter(Boolean))].slice(0, 100).sort();
}

export function shouldYieldForPackage(packageName, storage) {
  const value = normalizedPackageName(packageName);
  return Boolean(value && yieldedPackages(storage).includes(value));
}

export function setPackageYield(packageName, shouldYield, storage) {
  const value = normalizedPackageName(packageName);
  if (!value) throw new Error('A valid Android package name is required.');
  const target = store(storage);
  const packages = yieldedPackages(target).filter((item) => item !== value);
  if (shouldYield && packages.length >= 100) throw new Error('The display yield list is full.');
  if (shouldYield) packages.push(value);
  const result = packages.sort();
  if (result.length) target.setItem(yieldedPackagesKey, JSON.stringify(result));
  else target.removeItem(yieldedPackagesKey);
  return result;
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

export const deckStorageKeys = { installedKey, activeKey, yieldedPackagesKey };
