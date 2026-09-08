import { describe, expect, it } from 'vitest';
import { createDiagnosticReport, diagnosticChecks, diagnosticDeck, diagnosticProgress, normalizeDiagnosticDisplayState, readDiagnosticConfirmations, setDiagnosticConfirmation } from '../src/deviceDiagnostics.js';
import { validateDeck } from '../server/deckSchema.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

describe('physical device diagnostics', () => {
  it('ships a schema-valid, local-only display test Deck', () => {
    const { id: _id, channelId: _channelId, status: _status, ...manifest } = diagnosticDeck;
    expect(validateDeck(manifest).success).toBe(true);
    expect(diagnosticDeck.sources).toEqual([]);
    expect(diagnosticDeck.ai.enabled).toBe(false);
  });

  it('persists only known manual confirmations', () => {
    const storage = memoryStorage();
    expect(diagnosticProgress(readDiagnosticConfirmations(storage))).toEqual({ complete: 0, total: diagnosticChecks.length, passed: false });
    const values = setDiagnosticConfirmation('touch-focus', true, storage);
    expect(values['touch-focus']).toBe(true);
    expect(readDiagnosticConfirmations(storage)).toEqual(values);
    expect(() => setDiagnosticConfirmation('invented-check', true, storage)).toThrow('Unknown diagnostic');
  });

  it('exports a bounded report without an email or foreground package name', () => {
    const confirmations = Object.fromEntries(diagnosticChecks.map(({ id }) => [id, true]));
    const report = createDiagnosticReport({
      appVersion: '0.8.0', confirmations, now: 1_787_616_000_000,
      displayState: {
        native: true, isExtended: true, companionVisible: true, usageAccessGranted: true,
        foregroundPackage: 'com.private.game', email: 'player@example.com',
        displays: [{ name: 'Private device name', state: 2, widthPixels: 1920, heightPixels: 1080, refreshRateHz: 120, rotation: 1 }]
      }
    });
    expect(report).toMatchObject({ product: 'SecondDeck', appVersion: '0.8.0', complete: true, runtime: { secondaryDisplayAvailable: true, foregroundAppDetected: true, secondaryDisplayCount: 1 } });
    expect(JSON.stringify(report)).not.toContain('com.private.game');
    expect(JSON.stringify(report)).not.toContain('player@example.com');
    expect(JSON.stringify(report)).not.toContain('Private device name');
  });

  it('normalizes malformed native display values', () => {
    expect(normalizeDiagnosticDisplayState({ native: 'yes', isExtended: true, displays: [{ widthPixels: -1, heightPixels: 999_999, refreshRateHz: 'fast', rotation: 9 }] })).toEqual({
      native: false, secondaryDisplayAvailable: true, secondaryDisplayCount: 1,
      companionVisible: false, usageAccessGranted: false, foregroundAppDetected: false,
      displays: [{ state: null, widthPixels: null, heightPixels: null, refreshRateHz: null, rotation: null }]
    });
  });
});
