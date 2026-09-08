const supportedKeys = new Set(['BACKSPACE', 'ENTER', 'TAB', 'ESCAPE', 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT']);

function bridgeOrNull(target) {
  return target || (typeof window !== 'undefined' ? window.SecondDeckInput : null);
}

function parseResult(value, fallback = {}) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function readInputBridgeStatus(target) {
  const bridge = bridgeOrNull(target);
  const unavailable = {
    available: false, enabled: false, selected: false, connected: false,
    trackpadSupported: false,
    trackpadReason: 'Global pointer injection is unavailable to ordinary Android applications.'
  };
  if (!bridge?.status) return unavailable;
  const value = parseResult(bridge.status(), unavailable);
  return {
    available: value.available === true,
    enabled: value.enabled === true,
    selected: value.selected === true,
    connected: value.connected === true,
    trackpadSupported: value.trackpadSupported === true,
    trackpadReason: String(value.trackpadReason || unavailable.trackpadReason).slice(0, 240)
  };
}

export function commitInputText(value, target) {
  const text = String(value ?? '');
  if (!text || text.length > 256) return { ok: false, error: 'Text must contain 1 to 256 characters.' };
  const bridge = bridgeOrNull(target);
  if (!bridge?.commitText) return { ok: false, error: 'Open this Deck in the installed Android app.' };
  return parseResult(bridge.commitText(text), { ok: false, error: 'The keyboard bridge did not respond.' });
}

export function sendInputKey(value, target) {
  const key = String(value || '').toUpperCase();
  if (!supportedKeys.has(key)) return { ok: false, error: 'That key is not allowed.' };
  const bridge = bridgeOrNull(target);
  if (!bridge?.sendKey) return { ok: false, error: 'Open this Deck in the installed Android app.' };
  return parseResult(bridge.sendKey(key), { ok: false, error: 'The keyboard bridge did not respond.' });
}

export function openInputMethodSettings(target) {
  const bridge = bridgeOrNull(target);
  if (!bridge?.openKeyboardSettings) return false;
  bridge.openKeyboardSettings();
  return true;
}

export function showInputMethodPicker(target) {
  const bridge = bridgeOrNull(target);
  if (!bridge?.showKeyboardPicker) return false;
  bridge.showKeyboardPicker();
  return true;
}

export const allowedInputKeys = Object.freeze([...supportedKeys]);
