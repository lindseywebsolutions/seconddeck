import { describe, expect, it } from 'vitest';
import { localizedDeck, safePackageIcon, safePackageScreenshots, selectDeckLocale } from '../src/deckLocalization.js';

const deck = {
  name: 'Route Notes', description: 'A route companion for long sessions.',
  layout: { columns: 1, widgets: [{ id: 'route', type: 'guide', title: 'Route', content: 'Head north' }] },
  localizations: {
    es: { name: 'Notas de ruta', description: 'Un compañero de ruta para sesiones largas.', widgets: { route: { title: 'Ruta', content: 'Ve al norte' } } },
    'fr-CA': { name: 'Notes de route', widgets: {} }
  }
};

describe('Deck package localization', () => {
  it('selects exact, language, and regional matches in preference order', () => {
    expect(selectDeckLocale(deck, ['de-DE', 'es-MX'])).toBe('es');
    expect(selectDeckLocale(deck, ['fr-FR'])).toBe('fr-CA');
    expect(selectDeckLocale(deck, ['de'])).toBeNull();
  });

  it('localizes identity and widget copy without mutating the package', () => {
    const localized = localizedDeck(deck, ['es-MX']);
    expect(localized).toMatchObject({ name: 'Notas de ruta', activeLocale: 'es', layout: { widgets: [{ title: 'Ruta', content: 'Ve al norte' }] } });
    expect(deck.name).toBe('Route Notes');
    expect(deck.layout.widgets[0].title).toBe('Route');
  });

  it('allows only bounded image data URLs emitted by the catalog loader', () => {
    expect(safePackageIcon({ package: { icon: { dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } } })).toContain('image/svg+xml');
    expect(safePackageIcon({ package: { icon: { dataUrl: 'javascript:alert(1)' } } })).toBeNull();
    expect(safePackageIcon({ package: { icon: { dataUrl: `data:image/png;base64,${'A'.repeat(100001)}` } } })).toBeNull();
  });

  it('allows only four unique credential-free HTTPS catalog screenshots', () => {
    expect(safePackageScreenshots({ package: { screenshots: [
      { url: 'https://seconddeck.test/one.png' },
      { url: 'http://seconddeck.test/two.png' },
      { url: 'https://user:secret@seconddeck.test/three.png' },
      { url: 'javascript:alert(1)' },
      { url: 'https://seconddeck.test/one.png' },
      { url: 'https://seconddeck.test/four.png' },
      { url: 'https://seconddeck.test/five.png' },
      { url: 'https://seconddeck.test/six.png' },
      { url: 'https://seconddeck.test/seven.png' }
    ] } })).toEqual([
      'https://seconddeck.test/one.png',
      'https://seconddeck.test/four.png',
      'https://seconddeck.test/five.png',
      'https://seconddeck.test/six.png'
    ]);
    expect(safePackageScreenshots({ package: { screenshots: [{ url: 'http://127.0.0.1:4080/catalog-assets/preview.png' }] } })).toEqual(['http://127.0.0.1:4080/catalog-assets/preview.png']);
    expect(safePackageScreenshots({ package: { screenshots: null } })).toEqual([]);
  });
});
