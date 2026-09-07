import { Capacitor, registerPlugin } from '@capacitor/core';
import { encodeDeck } from './deckRuntime.js';

const SecondDisplay = registerPlugin('SecondDisplay');

export async function getDisplayState() {
  if (!Capacitor.isNativePlatform()) return { native: false, displays: [], isExtended: window.screen?.isExtended === true, usageAccessGranted: false };
  try { return { native: true, ...(await SecondDisplay.getRuntimeState()) }; }
  catch { return { native: true, displays: [], isExtended: false, usageAccessGranted: false }; }
}

export async function requestGameDetectionAccess() {
  if (!Capacitor.isNativePlatform()) return false;
  await SecondDisplay.openUsageAccessSettings();
  return true;
}

export async function openCompanionDisplay(deck) {
  if (!deck) throw new Error('Install and activate a Deck first.');
  if (!Capacitor.isNativePlatform()) {
    window.open(`${location.pathname}?mode=companion#deck=${encodeDeck(deck)}`, '_blank', 'noopener');
    return;
  }
  return SecondDisplay.showCompanion({ deck });
}
