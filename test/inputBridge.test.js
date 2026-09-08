import { describe, expect, it, vi } from 'vitest';
import { allowedInputKeys, commitInputText, openInputMethodSettings, openTrackpadSettings, readInputBridgeStatus, sendInputKey, sendTrackpadSwipe, sendTrackpadTap, showInputMethodPicker } from '../src/inputBridge.js';

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
    const bridge = { openKeyboardSettings: vi.fn(), showKeyboardPicker: vi.fn(), openTrackpadSettings: vi.fn() };
    expect(openInputMethodSettings(bridge)).toBe(true);
    expect(showInputMethodPicker(bridge)).toBe(true);
    expect(openTrackpadSettings(bridge)).toBe(true);
    expect(bridge.openKeyboardSettings).toHaveBeenCalledOnce();
    expect(bridge.showKeyboardPicker).toHaveBeenCalledOnce();
    expect(bridge.openTrackpadSettings).toHaveBeenCalledOnce();
  });

  it('bounds trackpad gestures and passes normalized values to the native bridge', () => {
    const bridge = { tap: vi.fn(() => '{"ok":true}'), swipe: vi.fn(() => ({ ok: true })) };
    expect(sendTrackpadTap(-0.1, 0.5, bridge).ok).toBe(false);
    expect(sendTrackpadTap(0.25, 0.75, bridge)).toEqual({ ok: true });
    expect(bridge.tap).toHaveBeenCalledWith(0.25, 0.75);
    expect(sendTrackpadSwipe(0, 0, 1, 1, 49, bridge).ok).toBe(false);
    expect(sendTrackpadSwipe(0.1, 0.2, 0.8, 0.9, 320.4, bridge)).toEqual({ ok: true });
    expect(bridge.swipe).toHaveBeenCalledWith(0.1, 0.2, 0.8, 0.9, 320);
  });

  it('normalizes every trackpad readiness field without trusting truthy strings', () => {
    const status = readInputBridgeStatus({ status: () => ({
      available: true, trackpadSupported: true, trackpadEnabled: true,
      trackpadConnected: 'yes', trackpadTargetActive: true
    }) });
    expect(status).toMatchObject({ available: true, trackpadSupported: true, trackpadEnabled: true, trackpadConnected: false, trackpadTargetActive: true });
  });
});
