import './styles.css';
import { api, clearToken, getCachedProfile, getToken, setCachedProfile, setToken } from './auth.js';
import { closeCompanionDisplay, getDisplayState, openCompanionDisplay, requestGameDetectionAccess, requestInputMethodAccess, requestTrackpadAccess, selectInputMethod } from './native.js';
import { activeDeck, deckForPackage, deckFromLocation, deckPermissionsGranted, grantDeckPermissions, installDeck, installedDecks, requiredDeckPermissions, revokeDeckPermissions, setActiveDeck, setPackageYield, shouldYieldForPackage, uninstallDeck } from './deckRuntime.js';
import { formatBytes, formatDuration, normalizePerformanceSnapshot, readTimerState, timerElapsed, toggleTimer } from './companionRuntime.js';
import { hasDeckUpdate, installedRevision, localDeck, mergeCatalogWithInstalled, parsePortableDeck, portableDeck, serializeDeck } from './deckPortability.js';
import { createDiagnosticReport, diagnosticChecks, diagnosticDeck, diagnosticProgress, normalizeDiagnosticDisplayState, readDiagnosticConfirmations, setDiagnosticConfirmation } from './deviceDiagnostics.js';
import { localizedDeck, safePackageIcon, safePackageScreenshots } from './deckLocalization.js';
import { obtainiumImportUrl } from './obtainium.js';
import { commitInputText, openInputMethodSettings, openTrackpadSettings, readInputBridgeStatus, sendInputKey, sendTrackpadSwipe, sendTrackpadTap, showInputMethodPicker } from './inputBridge.js';

const root = document.querySelector('#app');
const state = { user: null, decks: [], installed: [], activeDeck: null, detectedDeck: null, yieldedPackage: null, previewDeck: null, display: null, diagnosticsDisplay: null, config: null, offline: false };
const isCompanionMode = new URLSearchParams(location.search).get('mode') === 'companion';

const icon = (name) => ({
  layers: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
}[name]);

function pageShell(content, nav = false) {
  return `<header class="nav"><a class="brand" href="#/">${icon('layers')}<span>SecondDeck</span></a>
    <nav>${nav ? '<a href="#/app">Decks</a><a href="#/create">Create</a><a href="#/assistant">AI</a><a href="#/diagnostics">Device check</a><button class="text-button" data-action="logout">Sign out</button>' : '<a href="#features">How it works</a><a href="#community">Community</a><a class="button small" href="#/login">Open SecondDeck</a>'}</nav></header>${content}`;
}

function safeSourceUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function catalogSourceUrl(deck) {
  const repository = safeSourceUrl(deck.catalog?.repository);
  const ref = String(deck.catalog?.ref || 'main');
  const sourcePath = String(deck.catalog?.path || '');
  if (!repository || !/^[A-Za-z0-9._/-]{1,160}$/.test(ref) || !/^[A-Za-z0-9._/-]{1,300}$/.test(sourcePath)) return null;
  const encodedPath = sourcePath.split('/').map(encodeURIComponent).join('/');
  return `${repository.replace(/\/$/, '')}/blob/${encodeURIComponent(ref)}/${encodedPath}`;
}

const permissionDetails = {
  'external-display': ['Second display', 'Show this Deck on a connected lower screen only when you launch it.'],
  network: ['Reviewed links', 'Open only the HTTP(S) sources listed below in your external browser.'],
  performance: ['Device status', 'Read local battery, thermal, memory, and display refresh-rate values.'],
  keyboard: ['Companion keyboard', 'Type into a focused Android text field only after you enable and select SecondDeck Keyboard.'],
  trackpad: ['Upper-screen touch', 'Send taps and swipes only to an exact target app after you enable SecondDeck Trackpad in Android Accessibility settings. Screen content is never read.']
};

function deckIdentity(deck) {
  return String(deck?.channelId || deck?.id || '');
}

function reviewDeckPermissions(deck) {
  document.querySelector('#deck-permission-dialog')?.remove();
  const permissions = requiredDeckPermissions(deck);
  const dialog = document.createElement('dialog');
  dialog.id = 'deck-permission-dialog';
  dialog.className = 'deck-dialog permission-dialog';
  const targets = (deck.target?.packageNames || []).map((name) => `<code>${escapeHtml(name)}</code>`).join('');
  const sources = (deck.sources || []).map((source) => `<li>${escapeHtml(source)}</li>`).join('');
  dialog.innerHTML = `<form method="dialog"><span class="section-num">DEVICE-LOCAL CONSENT · v${escapeHtml(deck.version || 1)}</span><h2>Review ${escapeHtml(deck.name)}</h2><p>SecondDeck stores these approvals only on this device. Updating a Deck requires a fresh review, and you can revoke access later.</p><div class="permission-targets"><small>Exact app targets</small><div>${targets || '<span>None declared</span>'}</div></div><fieldset class="permission-list"><legend>Requested capabilities</legend>${permissions.map((permission) => { const [name, description] = permissionDetails[permission]; return `<label><input type="checkbox" name="permission" value="${escapeHtml(permission)}"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span></label>`; }).join('')}</fieldset>${sources ? `<div class="permission-sources"><small>Reviewed public sources</small><ul>${sources}</ul></div>` : ''}${deck.ai?.enabled ? `<div class="permission-note">${icon('spark')} This Deck allows optional AI authoring help. AI cannot read the running game, notes, or device telemetry.</div>` : ''}<div class="permission-actions"><button class="button ghost" value="cancel">Cancel</button><button class="button" value="approve" ${permissions.length ? 'disabled' : ''}>Approve and install</button></div></form>`;
  document.body.append(dialog);
  const approve = dialog.querySelector('[value="approve"]');
  dialog.addEventListener('change', () => { approve.disabled = dialog.querySelectorAll('input[name="permission"]:checked').length !== permissions.length; });
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const approved = dialog.returnValue === 'approve' ? [...dialog.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value) : null;
      dialog.remove(); resolve(approved);
    }, { once: true });
    dialog.showModal();
  });
}

async function installWithPermissionReview(deck) {
  const approved = await reviewDeckPermissions(deck);
  if (!approved) return false;
  state.installed = installDeck(deck, undefined, approved);
  state.activeDeck = activeDeck();
  return true;
}

function widgetMarkup(widget, index) {
  const id = escapeHtml(widget.id || `widget-${index + 1}`);
  const title = escapeHtml(widget.title || widget.type || 'Widget');
  const lines = String(widget.content || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const copy = lines.length ? lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('') : '<p class="empty-widget">Ready for this session.</p>';
  if (widget.type === 'timer') return `<article class="companion-widget timer" data-widget-id="${id}"><small>${title}</small><strong data-timer-value>00:00:00</strong><div class="timer-actions"><button type="button" data-timer-toggle>Start</button><button type="button" data-timer-reset>Reset</button></div></article>`;
  if (widget.type === 'checklist') return `<article class="companion-widget checklist" data-widget-id="${id}"><small>${title}</small>${lines.map((line, lineIndex) => `<label><input type="checkbox" data-persist="check:${id}:${lineIndex}"> ${escapeHtml(line)}</label>`).join('') || '<p class="empty-widget">Nothing left to check off.</p>'}</article>`;
  if (widget.type === 'notes') return `<article class="companion-widget notes" data-widget-id="${id}"><small>${title}</small><textarea data-persist="notes:${id}" aria-label="${title}" placeholder="Notes stay on this device…"></textarea></article>`;
  const source = safeSourceUrl(widget.sourceUrl);
  if (widget.type === 'map') return `<article class="companion-widget map" data-widget-id="${id}"><small>${title}</small><pre>${escapeHtml(lines.join('\n') || 'Add route or map notes to this Deck.')}</pre>${source ? `<a class="widget-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open full map ↗</a>` : ''}</article>`;
  if (widget.type === 'performance') return `<article class="companion-widget performance" data-widget-id="${id}" data-performance><small>${title}</small><div class="metric-grid"><div><span>Battery</span><strong data-metric="battery">—</strong></div><div><span>Thermals</span><strong data-metric="thermal">—</strong></div><div><span>Memory free</span><strong data-metric="memory">—</strong></div><div><span>Refresh</span><strong data-metric="refresh">—</strong></div></div><p class="metric-note">Read-only device telemetry · updates locally</p></article>`;
  if (widget.type === 'keyboard') {
    const rows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row) => `<div class="keyboard-row">${[...row].map((letter) => `<button type="button" data-input-letter="${letter}" disabled>${letter}</button>`).join('')}</div>`).join('');
    const phrases = lines.slice(0, 6).map((line) => `<button type="button" class="quick-input" data-input-text="${escapeHtml(line)}" disabled>${escapeHtml(line)}</button>`).join('');
    return `<article class="companion-widget keyboard" data-widget-id="${id}" data-input-keyboard><small>${title}</small><p class="input-status" data-input-status>Checking Android keyboard…</p><div class="input-setup"><button type="button" data-input-setup="settings">Enable keyboard</button><button type="button" data-input-setup="picker">Select keyboard</button></div>${phrases ? `<div class="quick-inputs">${phrases}</div>` : ''}<div class="keyboard-keys">${rows}<div class="keyboard-row keyboard-controls"><button type="button" data-input-shift disabled>Shift</button><button type="button" data-input-text=" " disabled>Space</button><button type="button" data-input-key="BACKSPACE" disabled>⌫</button><button type="button" data-input-key="ENTER" disabled>Enter</button></div></div></article>`;
  }
  if (widget.type === 'trackpad') return `<article class="companion-widget trackpad" data-widget-id="${id}" data-input-trackpad><small>${title}</small><p class="input-status" data-trackpad-status>Checking SecondDeck Trackpad…</p><div class="input-setup"><button type="button" data-input-setup="trackpad">Open Accessibility settings</button></div><div class="trackpad-surface" data-trackpad-surface role="application" aria-label="Upper-screen touch surface" aria-disabled="true"><span>Tap or drag to control the upper screen</span><i data-trackpad-crosshair hidden></i></div><p class="trackpad-boundary">Exact target app only · no screen-content access</p></article>`;
  return `<article class="companion-widget ${escapeHtml(widget.type)}" data-widget-id="${id}"><small>${title}</small>${copy}${source ? `<a class="widget-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ''}</article>`;
}

function wireInputWidgets() {
  document.querySelectorAll('[data-input-keyboard]').forEach((widget) => {
    const statusLabel = widget.querySelector('[data-input-status]');
    const settings = widget.querySelector('[data-input-setup="settings"]');
    const picker = widget.querySelector('[data-input-setup="picker"]');
    const commandButtons = [...widget.querySelectorAll('[data-input-letter],[data-input-text],[data-input-key],[data-input-shift]')];
    let shifted = false;
    const refresh = () => {
      const status = readInputBridgeStatus();
      const ready = status.available && status.enabled && status.selected && status.connected;
      settings.hidden = status.enabled;
      picker.hidden = !status.enabled;
      picker.textContent = status.selected ? 'Switch keyboard' : 'Select keyboard';
      commandButtons.forEach((button) => { button.disabled = !ready; });
      statusLabel.textContent = !status.available ? 'Open this Deck in the installed Android app.'
        : !status.enabled ? 'Enable SecondDeck Keyboard in Android settings.'
          : !status.selected ? 'Select SecondDeck Keyboard from Android’s keyboard picker.'
            : !status.connected ? 'Focus a text field in the upper app, then return here.'
              : 'Connected to the focused Android text field.';
    };
    widget.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.inputSetup === 'settings') { openInputMethodSettings(); return; }
      if (button.dataset.inputSetup === 'picker') { showInputMethodPicker(); return; }
      if ('inputShift' in button.dataset) {
        shifted = !shifted;
        button.classList.toggle('active', shifted);
        widget.querySelectorAll('[data-input-letter]').forEach((letter) => { letter.textContent = shifted ? letter.dataset.inputLetter.toUpperCase() : letter.dataset.inputLetter; });
        return;
      }
      const result = button.dataset.inputKey
        ? sendInputKey(button.dataset.inputKey)
        : commitInputText(button.dataset.inputLetter ? (shifted ? button.dataset.inputLetter.toUpperCase() : button.dataset.inputLetter) : button.dataset.inputText);
      if (!result.ok) statusLabel.textContent = result.error || 'Input was not accepted.';
      if (shifted && button.dataset.inputLetter) {
        shifted = false;
        widget.querySelector('[data-input-shift]')?.classList.remove('active');
        widget.querySelectorAll('[data-input-letter]').forEach((letter) => { letter.textContent = letter.dataset.inputLetter; });
      }
    });
    refresh();
    setInterval(refresh, 1500);
  });
  document.querySelectorAll('[data-input-trackpad]').forEach((widget) => {
    const statusLabel = widget.querySelector('[data-trackpad-status]');
    const settings = widget.querySelector('[data-input-setup="trackpad"]');
    const surface = widget.querySelector('[data-trackpad-surface]');
    const crosshair = widget.querySelector('[data-trackpad-crosshair]');
    let ready = false;
    let gesture = null;
    const pointFor = (event) => {
      const bounds = surface.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
      };
    };
    const moveCrosshair = ({ x, y }) => {
      crosshair.hidden = false;
      crosshair.style.left = `${x * 100}%`;
      crosshair.style.top = `${y * 100}%`;
    };
    const refresh = () => {
      const status = readInputBridgeStatus();
      ready = status.trackpadSupported && status.trackpadEnabled && status.trackpadConnected && status.trackpadTargetActive;
      surface.setAttribute('aria-disabled', String(!ready));
      surface.classList.toggle('ready', ready);
      settings.textContent = status.trackpadEnabled ? 'Review Accessibility settings' : 'Enable SecondDeck Trackpad';
      statusLabel.textContent = !status.available ? 'Open this Deck in the installed Android app.'
        : !status.trackpadSupported ? status.trackpadReason
          : !status.trackpadEnabled ? 'Enable SecondDeck Trackpad explicitly in Android Accessibility settings.'
            : !status.trackpadConnected ? 'SecondDeck Trackpad is enabled but its service is not connected yet.'
              : !status.trackpadTargetActive ? 'Open or switch to this Deck’s exact target app once.'
                : 'Ready to send taps and swipes to the exact target app.';
    };
    settings.addEventListener('click', () => openTrackpadSettings());
    surface.addEventListener('pointerdown', (event) => {
      if (!ready || !event.isPrimary) return;
      event.preventDefault();
      const point = pointFor(event);
      gesture = { ...point, startedAt: performance.now(), pointerId: event.pointerId };
      surface.setPointerCapture(event.pointerId);
      moveCrosshair(point);
    });
    surface.addEventListener('pointermove', (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      moveCrosshair(pointFor(event));
    });
    surface.addEventListener('pointerup', (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      const end = pointFor(event);
      moveCrosshair(end);
      const elapsed = Math.max(50, Math.min(1500, Math.round(performance.now() - gesture.startedAt)));
      const distance = Math.hypot(end.x - gesture.x, end.y - gesture.y);
      const result = distance < 0.015
        ? sendTrackpadTap(end.x, end.y)
        : sendTrackpadSwipe(gesture.x, gesture.y, end.x, end.y, elapsed);
      gesture = null;
      if (!result.ok) statusLabel.textContent = result.error || 'Trackpad gesture was not accepted.';
    });
    surface.addEventListener('pointercancel', () => { gesture = null; });
    refresh();
    setInterval(refresh, 1500);
  });
}

async function readPerformanceSnapshot() {
  try {
    if (window.SecondDeckMetrics?.snapshot) return normalizePerformanceSnapshot(JSON.parse(window.SecondDeckMetrics.snapshot()));
  } catch { /* Fall through to privacy-safe web capabilities. */ }
  let battery = null;
  try { battery = await navigator.getBattery?.(); } catch { /* Browser does not expose battery state. */ }
  return normalizePerformanceSnapshot({
    batteryPercent: battery ? battery.level * 100 : null,
    charging: battery?.charging === true,
    totalMemoryBytes: Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory * 1024 ** 3 : null
  });
}

function drawPerformance(widget, metrics) {
  const battery = metrics.batteryPercent === null ? 'Unavailable' : `${Math.round(metrics.batteryPercent)}%${metrics.charging ? ' ⚡' : ''}`;
  const temperature = metrics.batteryTemperatureC === null ? '' : ` · ${metrics.batteryTemperatureC.toFixed(1)}°C`;
  const memory = metrics.availableMemoryBytes === null ? formatBytes(metrics.totalMemoryBytes) : `${formatBytes(metrics.availableMemoryBytes)} / ${formatBytes(metrics.totalMemoryBytes)}`;
  widget.querySelector('[data-metric="battery"]').textContent = battery;
  widget.querySelector('[data-metric="thermal"]').textContent = `${metrics.thermalLabel}${temperature}`;
  widget.querySelector('[data-metric="memory"]').textContent = memory;
  widget.querySelector('[data-metric="refresh"]').textContent = metrics.refreshRateHz === null ? 'Unavailable' : `${metrics.refreshRateHz.toFixed(0)} Hz`;
}

function wireCompanionState(deck) {
  const prefix = `seconddeck:deck:${deck.id || deck.slug}:`;
  document.querySelectorAll('[data-persist]').forEach((field) => {
    const key = prefix + field.dataset.persist;
    const value = localStorage.getItem(key);
    if (field.type === 'checkbox') field.checked = value === 'true';
    else if (value !== null) field.value = value;
    field.addEventListener('input', () => localStorage.setItem(key, field.type === 'checkbox' ? String(field.checked) : field.value));
  });
  document.querySelectorAll('.timer[data-widget-id]').forEach((widget) => {
    const timer = widget.querySelector('[data-timer-value]');
    const toggle = widget.querySelector('[data-timer-toggle]');
    const reset = widget.querySelector('[data-timer-reset]');
    const key = `${prefix}timer:${widget.dataset.widgetId}`;
    let state = readTimerState(localStorage.getItem(key));
    let interval;
    const draw = () => {
      timer.textContent = formatDuration(timerElapsed(state));
      toggle.textContent = state.startedAt === null ? (state.elapsedMs ? 'Resume' : 'Start') : 'Pause';
    };
    const syncInterval = () => { clearInterval(interval); if (state.startedAt !== null) interval = setInterval(draw, 250); };
    toggle.addEventListener('click', () => {
      state = toggleTimer(state);
      localStorage.setItem(key, JSON.stringify(state));
      syncInterval(); draw();
    });
    reset.addEventListener('click', () => { state = { elapsedMs: 0, startedAt: null }; localStorage.removeItem(key); syncInterval(); draw(); });
    syncInterval(); draw();
  });
  document.querySelectorAll('[data-performance]').forEach((widget) => {
    const refresh = async () => drawPerformance(widget, await readPerformanceSnapshot());
    refresh(); setInterval(refresh, 5000);
  });
  wireInputWidgets();
}

async function companion() {
  document.documentElement.classList.add('companion-mode');
  if (location.protocol !== 'file:' && !(await getToken())) {
    location.replace(`${location.pathname}#/login`);
    return;
  }
  const sourceDeck = deckFromLocation(location);
  if (!sourceDeck) {
    root.innerHTML = `<main class="companion-locked">${icon('shield')}<h1>No active Deck</h1><p>Return to SecondDeck, sign in, install a reviewed Deck, and choose <strong>Use on second screen</strong>.</p></main>`;
    return;
  }
  const deck = localizedDeck(sourceDeck);
  const responsive = [...(deck.layout.breakpoints || [])].sort((a, b) => b.minWidth - a.minWidth).find((item) => window.innerWidth >= item.minWidth);
  const columns = Math.max(1, Math.min(4, Number(responsive?.columns || deck.layout.columns) || 1));
  root.innerHTML = `<main class="companion-shell">
    <header><div><span class="eyebrow"><span></span> ACTIVE DECK</span><h1>${escapeHtml(deck.name)}</h1></div><span class="companion-badge">LOCAL</span></header>
    <section class="companion-grid" style="--deck-columns:${columns}">${deck.layout.widgets.map(widgetMarkup).join('')}</section>
    <footer><span>SECONDDECK / COMPANION DISPLAY</span><span>No network required</span></footer>
  </main>`;
  wireCompanionState(deck);
}

function home() {
  root.innerHTML = pageShell(`<main>
    <section class="hero"><div class="eyebrow"><span></span> Built first for AYN Thor</div>
      <h1>Your game up top.<br><em>Everything else below.</em></h1>
      <p class="lede">SecondDeck turns the screen you are not playing on into a living companion—maps, guides, notes, persistent timers, read-only device telemetry, and community-built Decks that stay out of your way.</p>
      <div class="hero-actions"><a class="button" href="#/login">${icon('layers')} Open the app</a><a class="button ghost" href="${state.config?.downloadUrl || '/downloads/seconddeck-v0.13.0.apk'}">1. Install SecondDeck APK</a><a class="button ghost" href="${obtainiumImportUrl()}">${icon('download')} 2. Track in Obtainium</a></div>
      <p class="obtainium">On a new Thor, complete step 1 before step 2. Obtainium reads an app's name and logo from Android after installation; it cannot show the logo from a GitHub source alone. If your existing entry says <strong>App</strong>, install the APK, return here, tap <strong>2. Track in Obtainium</strong>, then reopen Obtainium. It will use the embedded SecondDeck name and dual-screen logo for future updates.</p>
      <div class="device"><div class="screen screen-top"><div class="game-art"><span>NOW PLAYING</span><strong>YOUR GAME</strong></div></div><div class="hinge"></div><div class="screen screen-bottom"><div class="deck-preview"><div class="mini-card teal">ROUTE<small>North ridge → tower</small></div><div class="mini-card amber">TIMER<small>01:42:18</small></div><div class="mini-card wide">SESSION NOTES<small>Key found · East gate unlocked</small></div></div></div></div>
    </section>
    <section id="features" class="feature-section"><div><span class="section-num">01 / RUNTIME</span><h2>Useful when you need it.<br>Invisible when you don't.</h2></div><div class="feature-grid">
      <article>${icon('layers')}<h3>Dual-screen aware</h3><p>Matches installed Decks to recently played games. You can make SecondDeck always yield when an app owns both screens.</p></article>
      <article>${icon('shield')}<h3>Safe by design</h3><p>Decks are validated data—not executable plugins. You decide every permission.</p></article>
      <article>${icon('spark')}<h3>AI, with a local lane</h3><p>Private Ollama assistance for community accounts; Codex for verified LWS members.</p></article>
    </div></section>
    <section id="community" class="community"><div><span class="section-num">02 / COMMUNITY</span><h2>Build on the device<br>you actually play on.</h2><p>Create, preview, install, import, and export a versioned Deck from your Thor, then submit it for review. No laptop and no native code required.</p><a class="button ghost" href="#/create">Start a Deck ${icon('plus')}</a></div><div class="manifest"><div class="manifest-head"><i></i><i></i><i></i><span>deck.json</span></div><pre>{
  <b>"schemaVersion"</b>: 1,
  <b>"version"</b>: 1,
  <b>"target"</b>: {
    "packageNames": ["your.game"]
  },
  <b>"layout"</b>: {
    "columns": 2,
    "widgets": ["guide", "notes"]
  }
}</pre></div></section>
  </main><footer><span>SECONDDECK / OPEN SOURCE</span><span>Local-first · Account protected · Built for two screens</span></footer>`);
}

function login() {
  root.innerHTML = pageShell(`<main class="auth-page"><section class="auth-card"><div class="eyebrow"><span></span> Welcome aboard</div><h1>Sign in to your Decks</h1><p>We'll email a one-time code. Your verified address selects the correct private AI lane.</p>
    <form id="login-form"><label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><button class="button" type="submit">Send sign-in code</button></form><p class="form-status" role="status"></p></section></main>`);
  document.querySelector('#login-form').addEventListener('submit', requestCode);
}

async function requestCode(event) {
  event.preventDefault(); const email = new FormData(event.currentTarget).get('email'); const status = document.querySelector('.form-status');
  status.textContent = 'Sending…';
  try {
    await api('/api/auth/request-code', { method: 'POST', body: JSON.stringify({ email }) });
    event.currentTarget.innerHTML = `<label>Six-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required maxlength="6" placeholder="000000"></label><input type="hidden" name="email" value="${escapeHtml(email)}"><button class="button" type="submit">Verify and continue</button>`;
    event.currentTarget.removeEventListener('submit', requestCode); event.currentTarget.addEventListener('submit', verifyCode); status.textContent = `Code sent to ${email}.`;
  } catch (error) { status.textContent = error.message; }
}

async function verifyCode(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const status = document.querySelector('.form-status'); status.textContent = 'Verifying…';
  try { const result = await api('/api/auth/verify-code', { method: 'POST', body: JSON.stringify(data) }); await setToken(result.token); location.hash = '#/app'; }
  catch (error) { status.textContent = error.message; }
}

function deckCard(deck) {
  const view = localizedDeck(deck);
  const widgetNames = view.layout.widgets.slice(0, 4).map((widget) => `<span>${escapeHtml(widget.type)}</span>`).join('');
  const packageIcon = safePackageIcon(deck);
  const packageScreenshot = safePackageScreenshots(deck)[0];
  const localRevision = installedRevision(deck, state.installed);
  const installed = Boolean(localRevision);
  const updateAvailable = hasDeckUpdate(deck, state.installed);
  const permissionGranted = installed && !updateAvailable && deckPermissionsGranted(deck);
  const needsReview = installed && !updateAvailable && !permissionGranted;
  const active = installedRevision(deck, state.activeDeck ? [state.activeDeck] : []) !== null;
  const canReview = state.user?.aiProvider === 'codex';
  const catalogUrl = catalogSourceUrl(deck);
  const locale = view.activeLocale ? ` · ${escapeHtml(view.activeLocale)}` : '';
  const action = deck.status === 'review'
    ? canReview
      ? `<span class="review-actions"><button class="text-button" data-action="review" data-review-status="rejected" data-deck-id="${escapeHtml(deck.id)}">Reject</button><button class="text-button" data-action="review" data-review-status="published" data-deck-id="${escapeHtml(deck.id)}">Publish</button></span>`
      : '<span class="review-note">Awaiting review</span>'
    : !['published', 'local'].includes(deck.status)
      ? `<span class="review-note">${escapeHtml(deck.status)}</span>`
    : updateAvailable
      ? `<button class="text-button" data-action="install" data-deck-id="${escapeHtml(deck.id)}">Update to v${escapeHtml(deck.version || 1)} ↓</button>`
    : needsReview
      ? `<button class="text-button" data-action="permissions" data-deck-id="${escapeHtml(deck.id)}">Review permissions →</button>`
    : active
      ? state.yieldedPackage
        ? '<button class="text-button active-action" disabled>Yielding to current app</button>'
        : `<button class="text-button active-action" data-action="display" data-deck-id="${escapeHtml(deck.id)}">Launch ↗</button>`
      : installed
        ? `<button class="text-button" data-action="activate" data-deck-id="${escapeHtml(deck.id)}">Use on second screen →</button>`
        : `<button class="text-button" data-action="install" data-deck-id="${escapeHtml(deck.id)}">Install locally ↓</button>`;
  return `<article class="deck-card" data-deck-search="${escapeHtml([view.name, view.description, deck.publisher, ...(deck.target?.packageNames || [])].join(' ').toLowerCase())}"><div class="deck-art ${packageScreenshot ? 'has-package-screenshot' : packageIcon ? 'has-package-icon' : ''}">${packageScreenshot ? `<img class="deck-art-screenshot" src="${escapeHtml(packageScreenshot)}" alt="${escapeHtml(`${view.name} companion preview`)}" loading="lazy" data-package-screenshot>` : ''}${packageIcon ? `<img class="deck-package-icon" src="${packageIcon}" alt="" loading="lazy">` : ''}<div class="deck-art-widgets">${widgetNames}</div></div><div class="deck-copy"><small>${escapeHtml(view.target.platforms.join(' · '))} · v${escapeHtml(deck.version || 1)}${deck.publisher ? ` · ${escapeHtml(deck.publisher)}` : ''}${locale}</small><h3>${escapeHtml(view.name)}</h3><p>${escapeHtml(view.description)}</p><div><span class="status ${escapeHtml(updateAvailable ? 'update' : needsReview ? 'review' : deck.status)}">${updateAvailable ? 'update available' : needsReview ? 'permission review' : active ? 'active' : installed ? 'installed' : escapeHtml(deck.status)}</span><button class="text-button" data-action="preview" data-deck-id="${escapeHtml(deck.id)}">Preview</button>${catalogUrl ? `<a class="text-button" href="${escapeHtml(catalogUrl)}" target="_blank" rel="noopener noreferrer">GitHub source ↗</a>` : ''}</div><div class="deck-action">${action}</div></div></article>`;
}

async function appPage() {
  if (!(await ensureUser())) return;
  const runtimeMessage = state.yieldedPackage ? `Yielding to ${state.yieldedPackage}; SecondDeck will not use its lower screen` : state.detectedDeck ? `${state.detectedDeck.name} matched to ${state.display.foregroundPackage}` : state.display?.foregroundPackage ? `No installed Deck matches ${state.display.foregroundPackage}` : state.display?.usageAccessGranted ? 'Waiting for a supported game' : state.display?.native ? 'Game detection is off' : 'Web preview';
  const canLaunch = Boolean(state.activeDeck && !state.yieldedPackage);
  const readyCount = state.installed.filter((deck) => deckPermissionsGranted(deck)).length;
  root.innerHTML = pageShell(`<main class="dashboard"><section class="dash-head"><div><span class="eyebrow"><span></span> ${escapeHtml(state.user.email)}</span><h1>Your second screen,<br>ready when you are.</h1></div><button class="button" data-action="display" ${canLaunch ? '' : 'disabled'}>${state.yieldedPackage ? 'Yielding to current app' : state.activeDeck ? `Launch ${escapeHtml(state.activeDeck.name)}` : 'Install a Deck to launch'}</button></section>
    <div class="device-status" id="device-status"><span class="pulse"></span><strong>${state.yieldedPackage ? 'Current app owns both screens' : state.offline ? 'Offline library ready' : state.display?.companionVisible ? 'Companion is running' : state.display?.isExtended ? 'Second display detected' : 'Ready for a second display'}</strong><span>${escapeHtml(runtimeMessage)} · ${readyCount} ready of ${state.installed.length} installed · ${state.decks.length} available</span><span class="device-actions"><a class="text-button" href="#/diagnostics">Run Thor check</a>${state.display?.native && !state.display?.usageAccessGranted ? '<button class="text-button" data-action="usage-access">Enable game detection</button>' : ''}${state.display?.native && !state.display?.input?.enabled ? '<button class="text-button" data-action="input-settings">Enable SecondDeck Keyboard</button>' : ''}${state.display?.native && state.display?.input?.enabled && !state.display?.input?.selected ? '<button class="text-button" data-action="input-picker">Select SecondDeck Keyboard</button>' : ''}${state.display?.foregroundPackage ? state.yieldedPackage ? '<button class="text-button" data-action="allow-package">Allow companion for this app</button>' : '<button class="text-button" data-action="yield-package">Always yield for this app</button>' : ''}${state.display?.companionVisible ? '<button class="text-button stop" data-action="stop-display">Stop companion</button>' : ''}</span></div>
    <section><div class="section-title"><div><span class="section-num">COMMUNITY LIBRARY</span><h2>Reviewed and local Decks</h2></div><div class="library-actions"><button class="button ghost small" data-action="import-deck">Import JSON/YAML</button><a class="button ghost small" href="#/create">${icon('plus')} Create Deck</a><input id="deck-import" type="file" accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml" hidden></div></div><label class="library-search">Find a game or Deck<input id="deck-search" type="search" placeholder="Search name, description, or package…"></label><div class="deck-grid">${state.decks.map(deckCard).join('') || '<p class="empty-library">You are offline. Installed Decks remain available after the catalog reconnects.</p>'}</div></section></main>`, true);
  document.querySelector('#deck-search')?.addEventListener('input', filterDecks);
  document.querySelectorAll('[data-package-screenshot]').forEach((image) => image.addEventListener('error', () => image.hidden = true, { once: true }));
}

function filterDecks(event) {
  const query = String(event.currentTarget.value || '').trim().toLowerCase();
  document.querySelectorAll('[data-deck-search]').forEach((card) => { card.hidden = Boolean(query && !card.dataset.deckSearch.includes(query)); });
}

function diagnosticRuntimeRow(label, passed, detail) {
  return `<li class="${passed ? 'passed' : ''}"><span aria-hidden="true">${passed ? '✓' : '○'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></li>`;
}

async function diagnosticsPage() {
  if (!(await ensureUser())) return;
  state.diagnosticsDisplay = await getDisplayState();
  const runtime = normalizeDiagnosticDisplayState(state.diagnosticsDisplay);
  const confirmations = readDiagnosticConfirmations();
  const progress = diagnosticProgress(confirmations);
  const display = runtime.displays[0];
  const input = state.diagnosticsDisplay?.input || {};
  const dimensions = display?.widthPixels && display?.heightPixels ? `${display.widthPixels} × ${display.heightPixels}${display.refreshRateHz ? ` at ${display.refreshRateHz.toFixed(0)} Hz` : ''}` : 'Waiting for display metrics';
  root.innerHTML = pageShell(`<main class="diagnostics-page"><section class="diagnostics-intro"><span class="section-num">PHYSICAL DEVICE CHECK</span><h1>Prove it on the Thor.</h1><p>This local workflow verifies the hardware behavior an emulator cannot: lower-screen placement, touch focus, game coexistence, rotation, sleep, display yield, and an in-place Obtainium update.</p><div class="provider-note">${icon('shield')} Reports omit your email, foreground package name, notes, and authentication data.</div></section>
    <section class="diagnostics-panel"><div class="diagnostics-heading"><div><span class="section-num">LIVE RUNTIME</span><h2>${runtime.native ? 'Android runtime' : 'Browser preview'}</h2></div><button class="text-button" data-action="diagnostic-refresh">Refresh</button></div><ul class="runtime-checks">
      ${diagnosticRuntimeRow('Native Android shell', runtime.native, runtime.native ? 'Capacitor bridge connected' : 'Open the installed Android app')}
      ${diagnosticRuntimeRow('Secondary display', runtime.secondaryDisplayAvailable, runtime.secondaryDisplayAvailable ? `${runtime.secondaryDisplayCount} presentation display found · ${dimensions}` : 'Open the Thor and refresh')}
      ${diagnosticRuntimeRow('Game detection permission', runtime.usageAccessGranted, runtime.usageAccessGranted ? (runtime.foregroundAppDetected ? 'Enabled · recent foreground app detected' : 'Enabled · waiting for a game') : 'Enable Usage Access from the Decks screen')}
      ${diagnosticRuntimeRow('Test companion', runtime.companionVisible, runtime.companionVisible ? 'Presentation is visible' : 'Start the lower-screen test below')}
    </ul><div class="diagnostic-actions"><button class="button" data-action="diagnostic-start" ${runtime.native && runtime.secondaryDisplayAvailable ? '' : 'disabled'}>Start lower-screen test</button><button class="button ghost" data-action="diagnostic-stop" ${runtime.companionVisible ? '' : 'disabled'}>Stop test</button></div><p class="form-status" id="diagnostic-status" role="status"></p></section>
    <section class="diagnostics-panel"><div class="diagnostics-heading"><div><span class="section-num">INPUT BRIDGE</span><h2>Focused text + scoped touch</h2></div></div><ul class="runtime-checks">
      ${diagnosticRuntimeRow('SecondDeck Keyboard enabled', input.enabled === true, input.enabled ? 'Enabled by you in Android settings' : 'Must be enabled explicitly in Android settings')}
      ${diagnosticRuntimeRow('SecondDeck Keyboard selected', input.selected === true, input.selected ? 'Selected as the current Android input method' : 'Choose it from the Android keyboard picker')}
      ${diagnosticRuntimeRow('Focused text field connected', input.connected === true, input.connected ? 'Companion keyboard can type into the focused upper-app field' : 'Open a text field in the upper app')}
      ${diagnosticRuntimeRow('SecondDeck Trackpad enabled', input.trackpadEnabled === true, input.trackpadEnabled ? (input.trackpadConnected ? 'Enabled and connected' : 'Enabled · waiting for Android to connect the service') : (input.trackpadSupported ? 'Must be enabled explicitly in Accessibility settings' : 'Requires Android 11 or newer'))}
      ${diagnosticRuntimeRow('Exact target active', input.trackpadTargetActive === true, input.trackpadTargetActive ? 'Gestures are restricted to the approved target package' : 'Launch a trackpad Deck and switch to its exact target app')}
    </ul><div class="diagnostic-actions input-diagnostic-actions"><button class="button" data-action="input-settings" ${runtime.native ? '' : 'disabled'}>Keyboard settings</button><button class="button ghost" data-action="input-picker" ${runtime.native && input.enabled ? '' : 'disabled'}>Choose keyboard</button><button class="button ghost" data-action="trackpad-settings" ${runtime.native && input.trackpadSupported ? '' : 'disabled'}>Trackpad settings</button></div><p class="input-boundary">Trackpad access is separately approved, observes package changes only, and cannot retrieve window content.</p></section>
    <section class="diagnostics-panel manual"><div class="diagnostics-heading"><div><span class="section-num">THOR ACCEPTANCE</span><h2>${progress.complete} of ${progress.total} confirmed</h2></div><span class="status ${progress.passed ? 'published' : 'review'}">${progress.passed ? 'complete' : 'in progress'}</span></div><fieldset class="diagnostic-checks">${diagnosticChecks.map(({ id, label }) => `<label><input type="checkbox" data-diagnostic-check="${escapeHtml(id)}" ${confirmations[id] ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}</fieldset><button class="button ghost" data-action="diagnostic-export">Export privacy-safe report</button></section></main>`, true);
}

async function exportDiagnosticReport() {
  const report = createDiagnosticReport({ appVersion: state.config?.version, displayState: state.diagnosticsDisplay || await getDisplayState(), confirmations: readDiagnosticConfirmations() });
  const name = `seconddeck-device-check-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([`${JSON.stringify(report, null, 2)}\n`], name, { type: 'application/json' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ title: 'SecondDeck device check', text: 'Privacy-safe SecondDeck physical acceptance report', files: [file] }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file); const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function findDeck(id) {
  return state.decks.find((deck) => deck.id === id) || state.installed.find((deck) => deck.id === id) || (state.previewDeck?.id === id ? state.previewDeck : null);
}

function previewDeck(deck) {
  const existing = document.querySelector('#deck-preview-dialog');
  if (existing) existing.remove();
  const dialog = document.createElement('dialog');
  state.previewDeck = deck;
  dialog.id = 'deck-preview-dialog';
  dialog.className = 'deck-dialog';
  const installed = installedRevision(deck, state.installed);
  const exactInstalled = Boolean(installed && Number(installed.version || 1) === Number(deck.version || 1));
  const permissionGranted = exactInstalled && deckPermissionsGranted(deck);
  const view = localizedDeck(deck);
  const screenshots = safePackageScreenshots(deck);
  const readmeUrl = safeSourceUrl(deck.package?.readmeUrl);
  const permissions = requiredDeckPermissions(deck).map((permission) => `<span>${escapeHtml(permissionDetails[permission]?.[0] || permission)}</span>`).join('');
  const gallery = screenshots.length ? `<section class="package-gallery" aria-label="Deck screenshots"><div class="package-gallery-frame"><img src="${escapeHtml(screenshots[0])}" alt="${escapeHtml(`${view.name} screenshot 1 of ${screenshots.length}`)}" data-package-gallery-main><p class="package-gallery-fallback" hidden>Preview unavailable offline. Installed Decks still run from local storage.</p></div>${screenshots.length > 1 ? `<div class="package-thumbnails">${screenshots.map((url, index) => `<button type="button" class="${index === 0 ? 'active' : ''}" data-action="select-screenshot" data-screenshot-index="${index}" aria-label="Show screenshot ${index + 1}" aria-pressed="${index === 0}"><img src="${escapeHtml(url)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</section>` : '';
  dialog.innerHTML = `<button class="dialog-close" data-action="close-preview" aria-label="Close preview">×</button><span class="section-num">DECLARATIVE PREVIEW · v${escapeHtml(deck.version || 1)}${view.activeLocale ? ` · ${escapeHtml(view.activeLocale)}` : ''}</span><h2>${escapeHtml(view.name)}</h2><p>${escapeHtml(view.description)}</p>${deck.package ? `<p class="package-meta">${escapeHtml(deck.package.license)} license · ${escapeHtml((deck.package.availableLocales || [deck.package.defaultLocale]).join(', '))}${readmeUrl ? ` · <a href="${escapeHtml(readmeUrl)}" target="_blank" rel="noopener noreferrer">Package README ↗</a>` : ''}</p>` : ''}${gallery}<div class="permission-summary"><small>Requests</small>${permissions}</div><div class="preview-widgets">${view.layout.widgets.map((widget) => `<article><small>${escapeHtml(widget.type)}</small><strong>${escapeHtml(widget.title)}</strong>${widget.content ? `<p>${escapeHtml(widget.content).replace(/\n/g, '<br>')}</p>` : ''}</article>`).join('')}</div><footer><span>${escapeHtml(view.target.packageNames.join(' · '))}</span><span>${view.layout.breakpoints?.[0]?.columns || view.layout.columns} wide-screen column${(view.layout.breakpoints?.[0]?.columns || view.layout.columns) === 1 ? '' : 's'}</span><span class="dialog-actions"><button class="text-button" data-action="export-deck" data-deck-id="${escapeHtml(deck.id)}">Export JSON ↓</button>${deck.status === 'local' && !installed ? `<button class="text-button" data-action="install-preview" data-deck-id="${escapeHtml(deck.id)}">Install locally ↓</button>` : ''}${exactInstalled ? permissionGranted ? `<button class="text-button danger" data-action="revoke-permissions" data-deck-id="${escapeHtml(deck.id)}">Revoke permissions</button>` : `<button class="text-button" data-action="permissions" data-deck-id="${escapeHtml(deck.id)}">Review permissions</button>` : ''}${installed ? `<button class="text-button danger" data-action="uninstall" data-deck-id="${escapeHtml(installed.id)}">Remove local copy</button>` : ''}</span></footer>`;
  document.body.append(dialog);
  const mainScreenshot = dialog.querySelector('[data-package-gallery-main]');
  const fallback = dialog.querySelector('.package-gallery-fallback');
  mainScreenshot?.addEventListener('load', () => { mainScreenshot.hidden = false; if (fallback) fallback.hidden = true; });
  mainScreenshot?.addEventListener('error', () => { mainScreenshot.hidden = true; if (fallback) fallback.hidden = false; });
  dialog.querySelectorAll('.package-thumbnails img').forEach((image) => image.addEventListener('error', () => image.closest('button').hidden = true, { once: true }));
  dialog.showModal();
}

async function exportDeckFile(deck) {
  const name = `${deck.slug}-v${deck.version || 1}.deck.json`;
  const file = new File([serializeDeck(deck)], name, { type: 'application/json' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ title: deck.name, text: 'SecondDeck declarative Deck', files: [file] }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file); const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function createPage() {
  root.innerHTML = pageShell(`<main class="builder"><section class="builder-copy"><span class="section-num">DECK CREATOR</span><h1>Make the bottom screen yours.</h1><p>Describe the game, choose only the widgets you need, and submit a safe declarative Deck for review.</p></section>
    <form id="deck-form" class="builder-form"><label>Deck name<input name="name" required minlength="3" maxlength="80" placeholder="Emerald Field Notes"></label><label>What does it help with?<textarea name="description" required minlength="10" maxlength="500" placeholder="Routes, notes, and a session checklist…"></textarea></label><label>Android package name<input name="packageName" required pattern="[A-Za-z][A-Za-z0-9_.]{2,199}" placeholder="com.example.game"></label><div class="form-row"><label>Device profile<select name="deviceProfile"><option value="ayn-thor">AYN Thor</option><option value="generic-dual-screen">Generic dual screen</option><option value="foldable">Foldable</option><option value="tablet-external">Tablet + display</option></select></label><label>Wide-screen columns<select name="columns"><option value="2">Two</option><option value="1">One</option><option value="3">Three</option><option value="4">Four</option></select></label></div><label>Deck version<input name="version" type="number" min="1" max="1000000" step="1" value="1" required></label><label>Starter content <small>one checklist, guide, control, or map line per row</small><textarea name="content" maxlength="4000" placeholder="Find the eastern gate\nRestock supplies\nSave before the tower"></textarea></label><label>Optional public source URL<input name="sourceUrl" type="url" maxlength="500" placeholder="https://example.com/guide"></label><fieldset><legend>Widgets</legend>${['map','guide','checklist','notes','timer','controls','keyboard','trackpad','performance','links'].map((item, index) => `<label class="check"><input type="checkbox" name="widgets" value="${item}" ${index > 0 && index < 4 ? 'checked' : ''}><span>${item}</span></label>`).join('')}</fieldset><label class="toggle"><input type="checkbox" name="aiEnabled"><span>Allow optional AI assistance for this Deck</span></label><div class="builder-actions"><button class="button ghost" type="button" data-action="preview-draft">Preview draft</button><button class="button ghost" type="button" data-action="install-draft">Install locally</button><button class="button" type="submit">Submit for review</button></div><p class="form-status" role="status"></p></form></main>`, true);
  document.querySelector('#deck-form').addEventListener('submit', submitDeck);
}

function deckFromForm(formElement) {
  if (!formElement.reportValidity()) throw new Error('Complete the required Deck fields first.');
  const form = new FormData(formElement); const name = form.get('name'); const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64); const types = form.getAll('widgets');
  if (!types.length) throw new Error('Choose at least one widget.');
  const content = String(form.get('content') || '').trim(); const sourceUrl = String(form.get('sourceUrl') || '').trim(); const columns = Number(form.get('columns'));
  const permissions = [...new Set([...(types.includes('keyboard') ? ['keyboard'] : []), ...(types.includes('trackpad') ? ['trackpad'] : []), ...(types.includes('performance') ? ['performance'] : []), ...(sourceUrl ? ['network'] : []), 'external-display'])];
  return portableDeck({ schemaVersion: 1, kind: 'deck', version: Number(form.get('version')), slug, name, description: form.get('description'), target: { packageNames: [form.get('packageName')], platforms: ['android'], deviceProfiles: [form.get('deviceProfile')] }, layout: { columns: 1, breakpoints: [{ minWidth: 700, columns }], widgets: types.map((type, index) => ({ id: `${type}-${index + 1}`, type, title: type[0].toUpperCase() + type.slice(1), ...(content && ['map', 'guide', 'checklist', 'controls', 'keyboard', 'trackpad'].includes(type) ? { content } : {}), ...(sourceUrl && ['map', 'guide', 'links'].includes(type) ? { sourceUrl } : {}) })) }, permissions, sources: sourceUrl ? [sourceUrl] : [], ai: { enabled: form.get('aiEnabled') === 'on', ...(form.get('aiEnabled') === 'on' ? { purpose: 'Assist with this Deck layout and session workflow.' } : {}) } });
}

async function submitDeck(event) {
  event.preventDefault(); const status = document.querySelector('.form-status');
  try { const deck = deckFromForm(event.currentTarget); await api('/api/decks', { method: 'POST', body: JSON.stringify(deck) }); status.textContent = `Deck v${deck.version} submitted for review.`; setTimeout(() => { location.hash = '#/app'; }, 900); }
  catch (error) { if (error.status === 401) location.hash = '#/login'; else status.textContent = error.message; }
}

function assistantPage() {
  root.innerHTML = pageShell(`<main class="assistant-page"><section><span class="section-num">OPTIONAL AI</span><h1>Describe it.<br>Preview the Deck.</h1><p>Generate a safe declarative draft, inspect every widget, then install it locally. SecondDeck never claims to see your live game.</p><div class="provider-note">${icon('shield')} Your verified account selects the provider. Model output is rebuilt and strictly validated before preview.</div></section><form id="assistant-form"><label>Android package name<input name="packageName" required pattern="[A-Za-z][A-Za-z0-9_.]{2,199}" placeholder="com.example.game"></label><label>Device profile<select name="deviceProfile"><option value="ayn-thor">AYN Thor</option><option value="generic-dual-screen">Generic dual screen</option><option value="foldable">Foldable</option><option value="tablet-external">Tablet + display</option></select></label><label>What should this Deck help with?<textarea name="prompt" minlength="10" maxlength="1500" required placeholder="A two-column RPG session layout with route notes, a checklist, and a timer…"></textarea></label><button class="button">Generate Deck draft</button><article class="answer" hidden></article></form></main>`, true);
  document.querySelector('#assistant-form').addEventListener('submit', askAssistant);
}

async function askAssistant(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); const answer = event.currentTarget.querySelector('.answer'); button.disabled = true; button.textContent = 'Building and validating…';
  try {
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const result = await api('/api/assistant/deck-draft', { method: 'POST', body: JSON.stringify(form) });
    const deck = localDeck(result.deck, `AI draft · ${result.provider}`);
    answer.hidden = false;
    answer.innerHTML = `<small>${escapeHtml(result.provider)} · ${escapeHtml(result.model)} · validated</small><h3>${escapeHtml(deck.name)}</h3><p>${escapeHtml(deck.description)}</p><button class="text-button" type="button" data-action="preview-ai" data-deck-id="${escapeHtml(deck.id)}">Preview and install →</button>`;
    state.previewDeck = deck;
    previewDeck(deck);
  }
  catch (error) { answer.hidden = false; answer.textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Generate Deck draft'; }
}

async function ensureUser() {
  if (!(await getToken())) { location.hash = '#/login'; return false; }
  state.installed = installedDecks();
  state.activeDeck = activeDeck();
  state.display = await getDisplayState();
  state.offline = false;
  try {
    state.user = await api('/api/me');
    await setCachedProfile(state.user);
  } catch (error) {
    if (error.status === 401) { await clearToken(); location.hash = '#/login'; return false; }
    state.user = await getCachedProfile();
    if (!state.user) { location.hash = '#/login'; return false; }
    state.offline = true;
  }
  if (state.offline) state.decks = mergeCatalogWithInstalled([], state.installed);
  else try { state.decks = mergeCatalogWithInstalled((await api('/api/decks')).decks, state.installed); }
  catch (error) {
    if (error.status === 401) { await clearToken(); location.hash = '#/login'; return false; }
    state.offline = true;
    state.decks = mergeCatalogWithInstalled([], state.installed);
  }
  state.detectedDeck = deckForPackage(state.display?.foregroundPackage, state.installed);
  if (state.detectedDeck && !deckPermissionsGranted(state.detectedDeck)) state.detectedDeck = null;
  state.yieldedPackage = shouldYieldForPackage(state.display?.foregroundPackage) ? state.display.foregroundPackage : null;
  if (state.yieldedPackage) state.detectedDeck = null;
  if (state.detectedDeck && state.activeDeck?.id !== state.detectedDeck.id) state.activeDeck = setActiveDeck(state.detectedDeck.id);
  return true;
}

async function launchCompanion(deck) {
  state.display = await getDisplayState();
  const packageName = state.display?.foregroundPackage;
  if (shouldYieldForPackage(packageName)) {
    state.yieldedPackage = packageName;
    throw new Error(`SecondDeck is yielding to ${packageName}. Allow the companion for this app first.`);
  }
  if (!deck) throw new Error('Install and select a Deck before launching.');
  if (!deckPermissionsGranted(deck)) throw new Error('Review this Deck\'s permissions before launching it.');
  await openCompanionDisplay(deck);
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }

async function route() {
  if (isCompanionMode) { await companion(); return; }
  const path = location.hash.slice(1) || '/';
  if (!state.config) state.config = await api('/api/config').catch(() => null);
  if (path === '/') home(); else if (path === '/login') login(); else if (path === '/app') await appPage(); else if (path === '/create') { if (await ensureUser()) createPage(); } else if (path === '/assistant') { if (await ensureUser()) assistantPage(); } else if (path === '/diagnostics') await diagnosticsPage(); else home();
}

document.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'logout') { await clearToken(); location.hash = '#/'; }
  if (action === 'close-preview') event.target.closest('dialog')?.close();
  if (action === 'select-screenshot') {
    const button = event.target.closest('[data-screenshot-index]');
    const screenshots = safePackageScreenshots(state.previewDeck);
    const index = Number(button?.dataset.screenshotIndex);
    const mainScreenshot = button?.closest('.package-gallery')?.querySelector('[data-package-gallery-main]');
    if (mainScreenshot && Number.isInteger(index) && screenshots[index]) {
      mainScreenshot.hidden = false;
      mainScreenshot.src = screenshots[index];
      mainScreenshot.alt = `${localizedDeck(state.previewDeck).name} screenshot ${index + 1} of ${screenshots.length}`;
      button.closest('.package-thumbnails').querySelectorAll('button').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
    }
  }
  if (action === 'import-deck') document.querySelector('#deck-import')?.click();
  if (action === 'export-deck') {
    const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    if (deck) await exportDeckFile(deck);
  }
  if (action === 'preview-ai') { if (state.previewDeck) previewDeck(state.previewDeck); }
  if (action === 'install-preview') {
    const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    if (deck?.status === 'local') {
      if (await installWithPermissionReview(deck)) {
        document.querySelector('#deck-preview-dialog')?.remove(); location.hash = '#/app';
      }
    }
  }
  if (action === 'preview-draft' || action === 'install-draft') {
    const form = event.target.closest('form'); const status = form?.querySelector('.form-status');
    try {
      const deck = localDeck(deckFromForm(form), 'Local draft');
      if (action === 'preview-draft') { previewDeck(deck); status.textContent = 'Previewing a validated local draft.'; }
      else if (await installWithPermissionReview(deck)) location.hash = '#/app';
    } catch (error) { if (status) status.textContent = error.message; }
  }
  if (action === 'usage-access') {
    try { await requestGameDetectionAccess(); document.querySelector('#device-status strong').textContent = 'Grant Usage Access, then return to SecondDeck.'; }
    catch (error) { document.querySelector('#device-status strong').textContent = error.message; }
  }
  if (action === 'input-settings') {
    const status = document.querySelector('#diagnostic-status') || document.querySelector('#device-status strong');
    try { await requestInputMethodAccess(); if (status) status.textContent = 'Enable SecondDeck Keyboard, then return and select it.'; }
    catch (error) { if (status) status.textContent = error.message; }
  }
  if (action === 'input-picker') {
    const status = document.querySelector('#diagnostic-status') || document.querySelector('#device-status strong');
    try { await selectInputMethod(); if (status) status.textContent = 'Choose SecondDeck Keyboard, then focus a text field in the upper app.'; }
    catch (error) { if (status) status.textContent = error.message; }
  }
  if (action === 'trackpad-settings') {
    const status = document.querySelector('#diagnostic-status') || document.querySelector('#device-status strong');
    try { await requestTrackpadAccess(); if (status) status.textContent = 'Enable SecondDeck Trackpad explicitly, then return and open the target app once.'; }
    catch (error) { if (status) status.textContent = error.message; }
  }
  if (action === 'stop-display') {
    try { await closeCompanionDisplay(); await appPage(); }
    catch (error) { document.querySelector('#device-status strong').textContent = error.message; }
  }
  if (action === 'diagnostic-refresh') await diagnosticsPage();
  if (action === 'diagnostic-start') {
    const status = document.querySelector('#diagnostic-status');
    try { await openCompanionDisplay(diagnosticDeck); await diagnosticsPage(); }
    catch (error) { if (status) status.textContent = error.message; }
  }
  if (action === 'diagnostic-stop') {
    const status = document.querySelector('#diagnostic-status');
    try { await closeCompanionDisplay(); await diagnosticsPage(); }
    catch (error) { if (status) status.textContent = error.message; }
  }
  if (action === 'diagnostic-export') {
    const status = document.querySelector('#diagnostic-status');
    try { await exportDiagnosticReport(); if (status) status.textContent = 'Device report exported locally.'; }
    catch (error) { if (status) status.textContent = error.message; }
  }
  if (action === 'yield-package' || action === 'allow-package') {
    const packageName = state.display?.foregroundPackage;
    try {
      setPackageYield(packageName, action === 'yield-package');
      if (action === 'yield-package' && state.display?.companionVisible) await closeCompanionDisplay();
      await appPage();
    } catch (error) { const status = document.querySelector('#device-status strong'); if (status) status.textContent = error.message; }
  }
  if (action === 'preview') { const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId); if (deck) previewDeck(deck); }
  if (action === 'install') {
    const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    if (deck?.status === 'published' && await installWithPermissionReview(deck)) await appPage();
  }
  if (action === 'permissions') {
    const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    if (deck) {
      const approved = await reviewDeckPermissions(deck);
      if (approved) { grantDeckPermissions(deck, approved); state.activeDeck = activeDeck(); document.querySelector('#deck-preview-dialog')?.remove(); await appPage(); }
    }
  }
  if (action === 'revoke-permissions') {
    const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    if (deck) { revokeDeckPermissions(deckIdentity(deck)); state.activeDeck = activeDeck(); document.querySelector('#deck-preview-dialog')?.remove(); await appPage(); }
  }
  if (action === 'review') {
    const button = event.target.closest('[data-deck-id]');
    try { await api(`/api/decks/${button.dataset.deckId}/review`, { method: 'POST', body: JSON.stringify({ status: button.dataset.reviewStatus }) }); await appPage(); }
    catch (error) { const status = document.querySelector('#device-status strong'); if (status) status.textContent = error.message; }
  }
  if (action === 'uninstall') {
    state.installed = uninstallDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    state.activeDeck = activeDeck(); document.querySelector('#deck-preview-dialog')?.remove(); await appPage();
  }
  if (action === 'activate') {
    const deck = setActiveDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    state.activeDeck = deck;
    try { await launchCompanion(deck); await appPage(); }
    catch (error) { document.querySelector('#device-status strong').textContent = error.message; }
  }
  if (action === 'display') {
    const requested = event.target.closest('[data-deck-id]')?.dataset.deckId;
    if (requested) state.activeDeck = setActiveDeck(requested);
    try { await launchCompanion(state.activeDeck); await appPage(); }
    catch (error) { const status = document.querySelector('#device-status strong'); if (status) status.textContent = error.message; }
  }
});
document.addEventListener('change', async (event) => {
  if (event.target.matches('[data-diagnostic-check]')) {
    setDiagnosticConfirmation(event.target.dataset.diagnosticCheck, event.target.checked);
    await diagnosticsPage();
    return;
  }
  if (event.target.id !== 'deck-import') return;
  const file = event.target.files?.[0];
  if (!file) return;
  const status = document.querySelector('#device-status strong');
  try {
    const deck = localDeck(parsePortableDeck(await file.text()));
    if (await installWithPermissionReview(deck)) {
      await appPage();
      const refreshed = document.querySelector('#device-status strong');
      if (refreshed) refreshed.textContent = `${deck.name} imported, approved, and validated locally`;
    }
  } catch (error) { if (status) status.textContent = error.message; }
  finally { event.target.value = ''; }
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && location.hash === '#/app') appPage(); });
route();
