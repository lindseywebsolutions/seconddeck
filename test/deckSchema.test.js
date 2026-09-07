import { describe, expect, it } from 'vitest';
import { validateDeck } from '../server/deckSchema.js';

const valid = {
  schemaVersion: 1,
  slug: 'emerald-notes',
  name: 'Emerald Notes',
  description: 'A checklist and notes layout for longer sessions.',
  target: { packageNames: ['org.example.emerald'], platforms: ['android'] },
  layout: { columns: 2, widgets: [{ id: 'notes-1', type: 'notes', title: 'Notes' }] },
  permissions: [], ai: { enabled: false }
};

describe('Deck manifest validation', () => {
  it('accepts declarative widgets', () => expect(validateDeck(valid).success).toBe(true));
  it('rejects executable or unknown fields', () => expect(validateDeck({ ...valid, script: 'rm -rf /' }).success).toBe(false));
  it('rejects unsafe URL protocols', () => expect(validateDeck({ ...valid, layout: { columns: 1, widgets: [{ id: 'link-1', type: 'links', title: 'Link', sourceUrl: 'javascript:alert(1)' }] } }).success).toBe(false));
});
