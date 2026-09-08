import { describe, expect, it } from 'vitest';
import { obtainiumImportUrl, obtainiumSource } from '../src/obtainium.js';

describe('Obtainium source identity', () => {
  it('imports the canonical package as SecondDeck before installation', () => {
    const url = new URL(obtainiumImportUrl());
    const imported = JSON.parse(decodeURIComponent(url.pathname.slice(1)));

    expect(imported).toEqual(obtainiumSource);
    expect(imported.id).toBe('com.lindseywebsolutions.seconddeck');
    expect(imported.name).toBe('SecondDeck');
    expect(JSON.parse(imported.additionalSettings)).toMatchObject({
      appName: 'SecondDeck',
      appAuthor: 'Lindsey Web Solutions'
    });
  });
});
