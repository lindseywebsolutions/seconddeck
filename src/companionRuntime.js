const thermalLabels = ['Nominal', 'Light', 'Moderate', 'Severe', 'Critical', 'Emergency', 'Shutdown'];

export function readTimerState(value, now = Date.now()) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const elapsedMs = Number(parsed?.elapsedMs);
    const startedAt = parsed?.startedAt === null ? null : Number(parsed?.startedAt);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('invalid elapsed time');
    if (startedAt !== null && (!Number.isFinite(startedAt) || startedAt < 0 || startedAt > now + 60_000)) throw new Error('invalid start time');
    return { elapsedMs, startedAt };
  } catch {
    return { elapsedMs: 0, startedAt: null };
  }
}

export function timerElapsed(state, now = Date.now()) {
  return Math.max(0, state.elapsedMs + (state.startedAt === null ? 0 : now - state.startedAt));
}

export function toggleTimer(state, now = Date.now()) {
  if (state.startedAt === null) return { elapsedMs: state.elapsedMs, startedAt: now };
  return { elapsedMs: timerElapsed(state, now), startedAt: null };
}

export function formatDuration(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
}

export function normalizePerformanceSnapshot(value = {}) {
  const number = (candidate, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (candidate === null || candidate === undefined || candidate === '') return null;
    const parsed = Number(candidate);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  const thermalStatus = number(value.thermalStatus, 0, thermalLabels.length - 1);
  return {
    batteryPercent: number(value.batteryPercent, 0, 100),
    batteryTemperatureC: number(value.batteryTemperatureC, -50, 150),
    charging: value.charging === true,
    thermalStatus,
    thermalLabel: thermalStatus === null ? 'Unavailable' : thermalLabels[thermalStatus],
    availableMemoryBytes: number(value.availableMemoryBytes),
    totalMemoryBytes: number(value.totalMemoryBytes),
    refreshRateHz: number(value.refreshRateHz, 1, 1000)
  };
}

export function formatBytes(value) {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(0)} MiB`;
  return `${(value / 1024 ** 3).toFixed(1)} GiB`;
}
