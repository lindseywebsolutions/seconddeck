const installedKey = 'seconddeck_installed_decks_v1';
const activeKey = 'seconddeck_active_deck_v1';
const yieldedPackagesKey = 'seconddeck_yielded_packages_v1';
const grantsKey = 'seconddeck_deck_grants_v1';
const androidPackagePattern = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/i;
export const deckPermissionTypes = ['external-display', 'network', 'performance', 'keyboard', 'trackpad'];

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

function normalizedDeckPermissions(deck) {
  if (!Array.isArray(deck?.permissions)) return [];
  const requested = [...new Set(deck.permissions.map((permission) => String(permission)))];
  if (requested.some((permission) => !deckPermissionTypes.includes(permission))) return null;
  return deckPermissionTypes.filter((permission) => requested.includes(permission));
}

function grantMap(storage) {
  const value = parse(store(storage).getItem(grantsKey), {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function samePermissions(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((permission, index) => permission === right[index]);
}

function consentContract(deck, permissions) {
  return JSON.stringify({
    version: Number(deck?.version || 1),
    permissions,
    packageNames: (deck?.target?.packageNames || []).map((name) => String(name).toLowerCase()),
    sources: (deck?.sources || []).map(String),
    widgets: (deck?.layout?.widgets || []).map((widget) => ({ type: String(widget?.type || ''), sourceUrl: widget?.sourceUrl ? String(widget.sourceUrl) : null })),
    ai: deck?.ai?.enabled === true
  });
}

export function requiredDeckPermissions(deck) {
  return normalizedDeckPermissions(deck) || [];
}

export function deckPermissionsGranted(deck, storage) {
  const required = normalizedDeckPermissions(deck);
  if (!required) return false;
  if (!required.length) return true;
  const grant = grantMap(storage)[identity(deck)];
  return Boolean(grant
    && Number(grant.version) === Number(deck.version || 1)
    && samePermissions(grant.permissions, required)
    && grant.contract === consentContract(deck, required));
}

export function grantDeckPermissions(deck, approvedPermissions, storage) {
  const required = normalizedDeckPermissions(deck);
  const approved = normalizedDeckPermissions({ permissions: approvedPermissions });
  if (!identity(deck) || !required || !approved || !samePermissions(required, approved)) {
    throw new Error('Approve every requested Deck permission before installation.');
  }
  if (!required.length) return [];
  const target = store(storage);
  const grants = grantMap(target);
  grants[identity(deck)] = { version: Number(deck.version || 1), permissions: required, contract: consentContract(deck, required) };
  target.setItem(grantsKey, JSON.stringify(grants));
  return required;
}

export function revokeDeckPermissions(id, storage) {
  const target = store(storage);
  const grants = grantMap(target);
  delete grants[String(id || '')];
  if (Object.keys(grants).length) target.setItem(grantsKey, JSON.stringify(grants));
  else target.removeItem(grantsKey);
  if (target.getItem(activeKey) === String(id || '')) target.removeItem(activeKey);
  return grants;
}

export function installedDecks(storage) {
  const value = parse(store(storage).getItem(installedKey), []);
  return Array.isArray(value) ? value.filter((deck) => deck && typeof deck.id === 'string') : [];
}

export function installDeck(deck, storage, approvedPermissions) {
  if (!deck || typeof deck.id !== 'string' || !deck.layout?.widgets?.length) throw new Error('This Deck cannot be installed.');
  const target = store(storage);
  const deckId = identity(deck);
  const current = installedDecks(target).find((item) => identity(item) === deckId);
  if (current && Number(deck.version || 1) < Number(current.version || 1)) throw new Error('A newer revision of this Deck is already installed.');
  const required = normalizedDeckPermissions(deck);
  if (!required) throw new Error('This Deck requests an unknown permission.');
  if (required.length && approvedPermissions === undefined) throw new Error('Review this Deck\'s permissions before installation.');
  if (approvedPermissions !== undefined) {
    const approved = normalizedDeckPermissions({ permissions: approvedPermissions });
    if (!approved || !samePermissions(required, approved)) throw new Error('Approve every requested Deck permission before installation.');
  }
  const decks = installedDecks(target).filter((item) => identity(item) !== deckId);
  decks.push(deck);
  target.setItem(installedKey, JSON.stringify(decks));
  if (required.length) grantDeckPermissions(deck, approvedPermissions, target);
  else revokeDeckPermissions(deckId, target);
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
  if (removed) revokeDeckPermissions(identity(removed), target);
  return decks;
}

export function setActiveDeck(id, storage) {
  const target = store(storage);
  const deck = installedDecks(target).find((item) => item.id === id || identity(item) === id);
  if (!deck) throw new Error('Install this Deck before making it active.');
  if (!deckPermissionsGranted(deck, target)) throw new Error('Review this Deck\'s permissions before launching it.');
  target.setItem(activeKey, identity(deck));
  return deck;
}

export function activeDeck(storage) {
  const target = store(storage);
  const id = target.getItem(activeKey);
  const deck = installedDecks(target).find((item) => item.id === id || identity(item) === id) || null;
  return deck && deckPermissionsGranted(deck, target) ? deck : null;
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

export const deckStorageKeys = { installedKey, activeKey, yieldedPackagesKey, grantsKey };
