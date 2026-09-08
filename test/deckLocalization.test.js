import { describe, expect, it } from 'vitest';
import { localizedDeck, safePackageIcon, selectDeckLocale } from '../src/deckLocalization.js';

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
});
