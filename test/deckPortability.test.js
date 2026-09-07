import { describe, expect, it } from 'vitest';
import { hasDeckUpdate, localDeck, mergeCatalogWithInstalled, parsePortableDeck, serializeDeck } from '../src/deckPortability.js';

const manifest = {
  schemaVersion: 1,
  kind: 'deck',
  version: 2,
  slug: 'portable-notes',
  name: 'Portable Notes',
  description: 'A portable notes and checklist Deck for handheld sessions.',
  target: { packageNames: ['com.example.portable'], platforms: ['android'], deviceProfiles: ['ayn-thor'] },
  layout: { columns: 1, breakpoints: [], widgets: [{ id: 'notes', type: 'notes', title: 'Notes' }] },
  permissions: ['external-display'],
  sources: [],
  ai: { enabled: false }
};

describe('portable Deck files', () => {
  it('imports strict JSON and YAML into the same validated manifest', () => {
    expect(parsePortableDeck(JSON.stringify(manifest))).toEqual(manifest);
    const yaml = `schemaVersion: 1\nkind: deck\nversion: 2\nslug: portable-notes\nname: Portable Notes\ndescription: A portable notes and checklist Deck for handheld sessions.\ntarget:\n  packageNames: [com.example.portable]\n  platforms: [android]\n  deviceProfiles: [ayn-thor]\nlayout:\n  columns: 1\n  breakpoints: []\n  widgets:\n    - id: notes\n      type: notes\n      title: Notes\npermissions: [external-display]\nsources: []\nai:\n  enabled: false\n`;
    expect(parsePortableDeck(yaml)).toEqual(manifest);
  });

  it('strips server metadata from exports and rejects executable fields', () => {
    const exported = JSON.parse(serializeDeck({ ...manifest, id: 'server-id', author: 'private@example.com', status: 'published' }));
    expect(exported).toEqual(manifest);
    expect(exported.author).toBeUndefined();
    expect(() => parsePortableDeck(JSON.stringify({ ...manifest, script: 'alert(1)' }))).toThrow('Deck validation failed');
  });

  it('keeps local-only Decks visible and detects reviewed updates by stable channel', () => {
    const local = localDeck(manifest);
    const older = { ...manifest, id: 'revision-1', channelId: 'community-channel', version: 1, status: 'published' };
    const newer = { ...manifest, id: 'revision-2', channelId: 'community-channel', version: 2, status: 'published' };
    expect(mergeCatalogWithInstalled([newer], [local, older])).toEqual([local, newer]);
    expect(hasDeckUpdate(newer, [older])).toBe(true);
  });

  it('rejects oversized and alias-based files', () => {
    expect(() => parsePortableDeck('x'.repeat(65 * 1024))).toThrow('64 KiB');
    expect(() => parsePortableDeck('shared: &x [1, 2]\ncopy: *x')).toThrow();
  });
});
