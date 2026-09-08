const storageKey = 'seconddeck_thor_diagnostics_v1';

export const diagnosticChecks = [
  { id: 'presentation-placement', label: 'The test Deck appears on the lower screen.' },
  { id: 'touch-focus', label: 'Buttons, checklist items, notes, and the timer respond on the lower screen.' },
  { id: 'game-coexistence', label: 'A game remains visible and controllable on the upper screen.' },
  { id: 'rotation', label: 'The companion remains usable after opening and closing the Thor.' },
  { id: 'suspend-resume', label: 'The companion recovers after sleep and resume.' },
  { id: 'yield-restore', label: 'A marked dual-screen app receives both screens, then SecondDeck can launch again.' },
  { id: 'obtainium-update', label: 'Obtainium updated SecondDeck in place without uninstalling it.' }
];

function storage(target) {
  if (target) return target;
  if (typeof localStorage !== 'undefined') return localStorage;
  throw new Error('Diagnostic storage is unavailable.');
}

function emptyConfirmations() {
  return Object.fromEntries(diagnosticChecks.map(({ id }) => [id, false]));
}

export function readDiagnosticConfirmations(target) {
  try {
    const parsed = JSON.parse(storage(target).getItem(storageKey) || '{}');
    return Object.fromEntries(diagnosticChecks.map(({ id }) => [id, parsed?.[id] === true]));
  } catch {
    return emptyConfirmations();
  }
}

export function setDiagnosticConfirmation(id, checked, target) {
  if (!diagnosticChecks.some((item) => item.id === id)) throw new Error('Unknown diagnostic check.');
  const values = readDiagnosticConfirmations(target);
  values[id] = checked === true;
  storage(target).setItem(storageKey, JSON.stringify(values));
  return values;
}

export function diagnosticProgress(confirmations) {
  const complete = diagnosticChecks.filter(({ id }) => confirmations?.[id] === true).length;
  return { complete, total: diagnosticChecks.length, passed: complete === diagnosticChecks.length };
}

function boundedNumber(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function normalizeDiagnosticDisplayState(value = {}) {
  const displays = Array.isArray(value.displays) ? value.displays.slice(0, 8).map((display) => ({
    state: boundedNumber(display?.state, 0, 10),
    widthPixels: boundedNumber(display?.widthPixels, 1, 16_384),
    heightPixels: boundedNumber(display?.heightPixels, 1, 16_384),
    refreshRateHz: boundedNumber(display?.refreshRateHz, 1, 1_000),
    rotation: boundedNumber(display?.rotation, 0, 3)
  })) : [];
  return {
    native: value.native === true,
    secondaryDisplayAvailable: value.isExtended === true && displays.length > 0,
    secondaryDisplayCount: displays.length,
    companionVisible: value.companionVisible === true,
    usageAccessGranted: value.usageAccessGranted === true,
    foregroundAppDetected: typeof value.foregroundPackage === 'string' && value.foregroundPackage.length > 0,
    displays
  };
}

export function createDiagnosticReport({ appVersion, displayState, confirmations, now = Date.now() }) {
  const acceptance = Object.fromEntries(diagnosticChecks.map(({ id }) => [id, confirmations?.[id] === true]));
  const progress = diagnosticProgress(acceptance);
  return {
    reportVersion: 1,
    product: 'SecondDeck',
    appVersion: String(appVersion || 'unknown').slice(0, 32),
    generatedAt: new Date(now).toISOString(),
    runtime: normalizeDiagnosticDisplayState(displayState),
    acceptance,
    complete: progress.passed
  };
}

export const diagnosticDeck = Object.freeze({
  schemaVersion: 1,
  kind: 'deck',
  version: 1,
  id: 'seconddeck-device-check-v1',
  channelId: 'seconddeck-device-check',
  slug: 'seconddeck-device-check',
  name: 'Thor Display Check',
  description: 'A local test layout for verifying SecondDeck on a physical dual-screen device.',
  status: 'local',
  target: {
    packageNames: ['com.lindseywebsolutions.seconddeck'],
    platforms: ['android'],
    deviceProfiles: ['ayn-thor', 'generic-dual-screen']
  },
  layout: {
    columns: 1,
    breakpoints: [{ minWidth: 700, columns: 2 }],
    widgets: [
      { id: 'instructions', type: 'guide', title: 'Display check', content: 'Keep a game on the upper screen\nTap every control on this lower screen\nClose, reopen, sleep, and resume the Thor' },
      { id: 'touch', type: 'checklist', title: 'Touch targets', content: 'Checklist responds\nNotes accept text\nTimer starts and resets' },
      { id: 'notes', type: 'notes', title: 'Test notes' },
      { id: 'timer', type: 'timer', title: 'Resume timer' },
      { id: 'device', type: 'performance', title: 'Device telemetry' }
    ]
  },
  permissions: ['external-display', 'performance'],
  sources: [],
  ai: { enabled: false }
});

export const diagnosticStorageKey = storageKey;
