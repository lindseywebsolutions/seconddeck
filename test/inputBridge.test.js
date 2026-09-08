import { describe, expect, it, vi } from 'vitest';
import { allowedInputKeys, commitInputText, openInputMethodSettings, readInputBridgeStatus, sendInputKey, showInputMethodPicker } from '../src/inputBridge.js';

describe('companion input bridge', () => {
  it('fails closed when the native bridge is absent or malformed', () => {
    expect(readInputBridgeStatus({ status: () => 'not json' })).toMatchObject({ available: false, connected: false, trackpadSupported: false });
    expect(commitInputText('hello', {})).toEqual({ ok: false, error: 'Open this Deck in the installed Android app.' });
  });

  it('bounds committed text and passes valid text to the native bridge', () => {
    const bridge = { commitText: vi.fn(() => JSON.stringify({ ok: true })) };
    expect(commitInputText('', bridge).ok).toBe(false);
    expect(commitInputText('x'.repeat(257), bridge).ok).toBe(false);
    expect(commitInputText('Hello Thor', bridge)).toEqual({ ok: true });
    expect(bridge.commitText).toHaveBeenCalledWith('Hello Thor');
  });

  it('allows only the fixed navigation key set', () => {
    const bridge = { sendKey: vi.fn(() => ({ ok: true })) };
    expect(allowedInputKeys).toContain('BACKSPACE');
    expect(sendInputKey('volume_up', bridge).ok).toBe(false);
    expect(sendInputKey('enter', bridge).ok).toBe(true);
    expect(bridge.sendKey).toHaveBeenCalledWith('ENTER');
  });

  it('opens only explicit Android setup surfaces', () => {
    const bridge = { openKeyboardSettings: vi.fn(), showKeyboardPicker: vi.fn() };
    expect(openInputMethodSettings(bridge)).toBe(true);
    expect(showInputMethodPicker(bridge)).toBe(true);
    expect(bridge.openKeyboardSettings).toHaveBeenCalledOnce();
    expect(bridge.showKeyboardPicker).toHaveBeenCalledOnce();
  });
});
