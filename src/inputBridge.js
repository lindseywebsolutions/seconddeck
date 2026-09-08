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
    trackpadSupported: false, trackpadEnabled: false, trackpadConnected: false, trackpadTargetActive: false,
    trackpadReason: 'SecondDeck Trackpad is available only in the installed Android app.'
  };
  if (!bridge?.status) return unavailable;
  const value = parseResult(bridge.status(), unavailable);
  return {
    available: value.available === true,
    enabled: value.enabled === true,
    selected: value.selected === true,
    connected: value.connected === true,
    trackpadSupported: value.trackpadSupported === true,
    trackpadEnabled: value.trackpadEnabled === true,
    trackpadConnected: value.trackpadConnected === true,
    trackpadTargetActive: value.trackpadTargetActive === true,
    trackpadReason: String(value.trackpadReason || unavailable.trackpadReason).slice(0, 240)
  };
}

function validTrackpadCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function trackpadBridgeResult(method, values, target) {
  if (!values.every(validTrackpadCoordinate)) return { ok: false, error: 'Trackpad coordinates must stay inside the touch surface.' };
  const bridge = bridgeOrNull(target);
  if (typeof bridge?.[method] !== 'function') return { ok: false, error: 'Open this Deck in the installed Android app.' };
  return parseResult(bridge[method](...values), { ok: false, error: 'The trackpad bridge did not respond.' });
}

export function sendTrackpadTap(x, y, target) {
  return trackpadBridgeResult('tap', [Number(x), Number(y)], target);
}

export function sendTrackpadSwipe(startX, startY, endX, endY, durationMs, target) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration < 50 || duration > 1500) {
    return { ok: false, error: 'Trackpad gestures must last 50 to 1500 milliseconds.' };
  }
  const bridge = bridgeOrNull(target);
  const values = [Number(startX), Number(startY), Number(endX), Number(endY)];
  if (!values.every(validTrackpadCoordinate)) return { ok: false, error: 'Trackpad coordinates must stay inside the touch surface.' };
  if (typeof bridge?.swipe !== 'function') return { ok: false, error: 'Open this Deck in the installed Android app.' };
  return parseResult(bridge.swipe(...values, Math.round(duration)), { ok: false, error: 'The trackpad bridge did not respond.' });
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

export function openTrackpadSettings(target) {
  const bridge = bridgeOrNull(target);
  if (!bridge?.openTrackpadSettings) return false;
  bridge.openTrackpadSettings();
  return true;
}

export const allowedInputKeys = Object.freeze([...supportedKeys]);
