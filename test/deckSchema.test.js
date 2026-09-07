import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDeck } from '../server/deckSchema.js';

const valid = {
  schemaVersion: 1,
  kind: 'deck',
  slug: 'emerald-notes',
  name: 'Emerald Notes',
  description: 'A checklist and notes layout for longer sessions.',
  target: { packageNames: ['org.example.emerald'], platforms: ['android'], deviceProfiles: ['ayn-thor'] },
  layout: { columns: 1, breakpoints: [{ minWidth: 700, columns: 2 }], widgets: [{ id: 'notes-1', type: 'notes', title: 'Notes' }] },
  permissions: ['external-display'], sources: ['https://example.com/guide'], ai: { enabled: false }
};

describe('Deck manifest validation', () => {
  it('keeps the published community example schema-valid', () => {
    const example = JSON.parse(fs.readFileSync(new URL('../examples/ayn-thor-session.deck.json', import.meta.url), 'utf8'));
    expect(validateDeck(example).success).toBe(true);
  });
  it('accepts declarative widgets', () => expect(validateDeck(valid).success).toBe(true));
  it('accepts a declarative text map with an allowlisted safe source', () => expect(validateDeck({ ...valid, permissions: ['external-display', 'network'], sources: ['https://example.com/map'], layout: { columns: 1, widgets: [{ id: 'map-1', type: 'map', title: 'Route map', content: 'Camp -> Ridge', sourceUrl: 'https://example.com/map' }] } }).success).toBe(true));
  it('rejects executable or unknown fields', () => expect(validateDeck({ ...valid, script: 'rm -rf /' }).success).toBe(false));
  it('rejects unsafe URL protocols', () => expect(validateDeck({ ...valid, layout: { columns: 1, widgets: [{ id: 'link-1', type: 'links', title: 'Link', sourceUrl: 'javascript:alert(1)' }] } }).success).toBe(false));
  it('rejects widgets that omit their declared capability', () => {
    expect(validateDeck({ ...valid, layout: { columns: 1, widgets: [{ id: 'performance-1', type: 'performance', title: 'Device' }] } }).success).toBe(false);
    expect(validateDeck({ ...valid, sources: ['https://example.com/guide'], layout: { columns: 1, widgets: [{ id: 'guide-1', type: 'guide', title: 'Guide', sourceUrl: 'https://example.com/guide' }] } }).success).toBe(false);
  });
});
