import { Capacitor, registerPlugin } from '@capacitor/core';
import { encodeDeck } from './deckRuntime.js';

const SecondDisplay = registerPlugin('SecondDisplay');

export async function getDisplayState() {
  if (!Capacitor.isNativePlatform()) return { native: false, displays: [], isExtended: window.screen?.isExtended === true };
  try { return { native: true, ...(await SecondDisplay.getDisplays()) }; }
  catch { return { native: true, displays: [], isExtended: false }; }
}

export async function openCompanionDisplay(deck) {
  if (!deck) throw new Error('Install and activate a Deck first.');
  if (!Capacitor.isNativePlatform()) {
    window.open(`${location.pathname}?mode=companion#deck=${encodeDeck(deck)}`, '_blank', 'noopener');
    return;
  }
  return SecondDisplay.showCompanion({ deck });
}
