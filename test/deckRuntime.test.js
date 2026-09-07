import { describe, expect, it } from 'vitest';
import { activeDeck, decodeDeck, deckForPackage, deckFromLocation, encodeDeck, installDeck, installedDecks, setActiveDeck, uninstallDeck } from '../src/deckRuntime.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

const first = {
  id: 'deck-one', name: 'Field Notes', status: 'published',
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
    installDeck({ ...first, name: 'Updated Field Notes' }, storage);
    expect(installedDecks(storage).map((deck) => deck.name)).toEqual(['Timer Deck', 'Updated Field Notes']);
    expect(activeDeck(storage).id).toBe('deck-one');
    expect(setActiveDeck('deck-two', storage).name).toBe('Timer Deck');
    uninstallDeck('deck-two', storage);
    expect(activeDeck(storage).id).toBe('deck-one');
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
});
