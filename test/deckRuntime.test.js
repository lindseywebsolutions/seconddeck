import { describe, expect, it } from 'vitest';
import { activeDeck, deckPermissionsGranted, decodeDeck, deckForPackage, deckFromLocation, encodeDeck, grantDeckPermissions, installDeck, installedDecks, requiredDeckPermissions, revokeDeckPermissions, setActiveDeck, setPackageYield, shouldYieldForPackage, uninstallDeck, yieldedPackages } from '../src/deckRuntime.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

const first = {
  id: 'deck-one-v1', channelId: 'deck-one', version: 1, name: 'Field Notes', status: 'published',
  layout: { columns: 2, widgets: [{ id: 'notes', type: 'notes', title: 'Notes', content: 'Café route' }] }
};
const second = {
  id: 'deck-two', name: 'Timer Deck', status: 'published',
  layout: { columns: 1, widgets: [{ id: 'timer', type: 'timer', title: 'Timer' }] }
};

describe('local Deck runtime', () => {
  it('installs, updates, activates, and uninstalls Decks locally', () => {
    const storage = memoryStorage();
    installDeck(first, storage);
    installDeck(second, storage);
    installDeck({ ...first, id: 'deck-one-v2', version: 2, name: 'Updated Field Notes' }, storage);
    expect(installedDecks(storage).map((deck) => deck.name)).toEqual(['Timer Deck', 'Updated Field Notes']);
    expect(activeDeck(storage).id).toBe('deck-one-v2');
    expect(setActiveDeck('deck-two', storage).name).toBe('Timer Deck');
    uninstallDeck('deck-two', storage);
    expect(activeDeck(storage).id).toBe('deck-one-v2');
    expect(() => installDeck(first, storage)).toThrow('newer revision');
  });

  it('round-trips Unicode Deck data through the secondary-display payload', () => {
    const encoded = encodeDeck(first);
    expect(decodeDeck(encoded)).toEqual(first);
    expect(deckFromLocation({ hash: `#deck=${encoded}` })).toEqual(first);
  });

  it('rejects malformed or non-Deck companion payloads', () => {
    expect(decodeDeck('not-a-deck')).toBeNull();
    expect(deckFromLocation({ hash: '#deck=nope!' })).toBeNull();
  });

  it('matches an installed Deck to a detected package without partial-domain matches', () => {
    const decks = [{ ...first, target: { packageNames: ['com.example.game'] } }];
    expect(deckForPackage('COM.EXAMPLE.GAME', decks)?.id).toBe(first.id);
    expect(deckForPackage('com.example.game.demo', decks)).toBeNull();
  });

  it('persists exact-package display arbitration locally', () => {
    const storage = memoryStorage();
    expect(setPackageYield(' COM.Example.Game ', true, storage)).toEqual(['com.example.game']);
    expect(shouldYieldForPackage('com.example.game', storage)).toBe(true);
    expect(shouldYieldForPackage('com.example.game.demo', storage)).toBe(false);
    expect(yieldedPackages(storage)).toEqual(['com.example.game']);
    expect(setPackageYield('com.example.game', false, storage)).toEqual([]);
    expect(shouldYieldForPackage('com.example.game', storage)).toBe(false);
  });

  it('rejects malformed package names from the arbitration list', () => {
    const storage = memoryStorage();
    expect(() => setPackageYield('not a package', true, storage)).toThrow('valid Android package');
    expect(() => setPackageYield('single', true, storage)).toThrow('valid Android package');
    expect(yieldedPackages(storage)).toEqual([]);
  });

  it('requires exact, versioned device-local permission approval', () => {
    const storage = memoryStorage();
    const permissionDeck = { ...first, permissions: ['performance', 'external-display'] };
    expect(requiredDeckPermissions(permissionDeck)).toEqual(['external-display', 'performance']);
    expect(() => installDeck(permissionDeck, storage)).toThrow('Review this Deck');
    expect(() => installDeck(permissionDeck, storage, ['external-display'])).toThrow('Approve every');

    installDeck(permissionDeck, storage, ['performance', 'external-display']);
    expect(deckPermissionsGranted(permissionDeck, storage)).toBe(true);
    expect(activeDeck(storage)?.id).toBe(permissionDeck.id);
    expect(deckPermissionsGranted({ ...permissionDeck, sources: ['https://unexpected.example'] }, storage)).toBe(false);

    const update = { ...permissionDeck, id: 'deck-one-v2', version: 2 };
    expect(deckPermissionsGranted(update, storage)).toBe(false);
    expect(() => setActiveDeck(update.id, storage)).toThrow('Install this Deck');
    installDeck(update, storage, ['external-display', 'performance']);
    expect(deckPermissionsGranted(update, storage)).toBe(true);

    revokeDeckPermissions(update.channelId, storage);
    expect(deckPermissionsGranted(update, storage)).toBe(false);
    expect(activeDeck(storage)).toBeNull();
    expect(() => setActiveDeck(update.id, storage)).toThrow('Review this Deck');
  });

  it('rejects unknown permissions even if local storage was tampered with', () => {
    const storage = memoryStorage();
    const tampered = { ...first, permissions: ['external-display', 'shell'] };
    expect(deckPermissionsGranted(tampered, storage)).toBe(false);
    expect(() => grantDeckPermissions(tampered, ['external-display', 'shell'], storage)).toThrow('Approve every');
    expect(() => installDeck(tampered, storage, ['external-display', 'shell'])).toThrow('unknown permission');
  });
});
