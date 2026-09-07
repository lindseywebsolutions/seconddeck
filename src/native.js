import { Capacitor, registerPlugin } from '@capacitor/core';

const SecondDisplay = registerPlugin('SecondDisplay');

export async function getDisplayState() {
  if (!Capacitor.isNativePlatform()) return { native: false, displays: [], isExtended: window.screen?.isExtended === true };
  try { return { native: true, ...(await SecondDisplay.getDisplays()) }; }
  catch { return { native: true, displays: [], isExtended: false }; }
}

export async function openCompanionDisplay() {
  if (!Capacitor.isNativePlatform()) {
    if ('requestFullscreen' in document.documentElement) await document.documentElement.requestFullscreen();
    return;
  }
  return SecondDisplay.showCompanion({ path: 'index.html?mode=companion' });
}
