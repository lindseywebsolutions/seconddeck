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

export async function getInputState() {
  if (!Capacitor.isNativePlatform()) return { native: false, available: false, enabled: false, selected: false, connected: false, trackpadSupported: false, trackpadEnabled: false, trackpadConnected: false, trackpadTargetActive: false };
  try { return { native: true, ...(await SecondDisplay.getInputState()) }; }
  catch { return { native: true, available: false, enabled: false, selected: false, connected: false, trackpadSupported: false, trackpadEnabled: false, trackpadConnected: false, trackpadTargetActive: false }; }
}

export async function requestInputMethodAccess() {
  if (!Capacitor.isNativePlatform()) return false;
  await SecondDisplay.openInputMethodSettings();
  return true;
}

export async function selectInputMethod() {
  if (!Capacitor.isNativePlatform()) return false;
  await SecondDisplay.showInputMethodPicker();
  return true;
}

export async function requestTrackpadAccess() {
  if (!Capacitor.isNativePlatform()) return false;
  await SecondDisplay.openTrackpadSettings();
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

export async function closeCompanionDisplay() {
  if (!Capacitor.isNativePlatform()) return false;
  await SecondDisplay.dismissCompanion();
  return true;
}
