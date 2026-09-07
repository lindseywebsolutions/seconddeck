import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, normalizePerformanceSnapshot, readTimerState, timerElapsed, toggleTimer } from '../src/companionRuntime.js';

describe('companion runtime state', () => {
  it('persists a running timer across companion restarts', () => {
    const running = toggleTimer({ elapsedMs: 5_000, startedAt: null }, 10_000);
    expect(readTimerState(JSON.stringify(running), 12_000)).toEqual(running);
    expect(timerElapsed(running, 12_000)).toBe(7_000);
    expect(toggleTimer(running, 12_000)).toEqual({ elapsedMs: 7_000, startedAt: null });
    expect(formatDuration(3_723_000)).toBe('01:02:03');
  });

  it('fails closed on corrupt or future timer state', () => {
    expect(readTimerState('not-json', 1_000)).toEqual({ elapsedMs: 0, startedAt: null });
    expect(readTimerState({ elapsedMs: 10, startedAt: 100_000 }, 1_000)).toEqual({ elapsedMs: 0, startedAt: null });
  });

  it('normalizes native telemetry without trusting invalid values', () => {
    expect(normalizePerformanceSnapshot({ batteryPercent: 72.4, batteryTemperatureC: 34.1, charging: true, thermalStatus: 2, availableMemoryBytes: 2 * 1024 ** 3, totalMemoryBytes: 8 * 1024 ** 3, refreshRateHz: 120 })).toEqual({
      batteryPercent: 72.4,
      batteryTemperatureC: 34.1,
      charging: true,
      thermalStatus: 2,
      thermalLabel: 'Moderate',
      availableMemoryBytes: 2 * 1024 ** 3,
      totalMemoryBytes: 8 * 1024 ** 3,
      refreshRateHz: 120
    });
    expect(normalizePerformanceSnapshot({ batteryPercent: 900, thermalStatus: 50 }).batteryPercent).toBeNull();
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GiB');
  });
});
