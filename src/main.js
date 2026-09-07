import './styles.css';
import { api, clearToken, getCachedProfile, getToken, setCachedProfile, setToken } from './auth.js';
import { getDisplayState, openCompanionDisplay, requestGameDetectionAccess } from './native.js';
import { activeDeck, deckForPackage, deckFromLocation, installDeck, installedDecks, setActiveDeck, uninstallDeck } from './deckRuntime.js';

const root = document.querySelector('#app');
const state = { user: null, decks: [], installed: [], activeDeck: null, detectedDeck: null, display: null, config: null, offline: false };
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
    <nav>${nav ? '<a href="#/app">Decks</a><a href="#/create">Create</a><a href="#/assistant">AI</a><button class="text-button" data-action="logout">Sign out</button>' : '<a href="#features">How it works</a><a href="#community">Community</a><a class="button small" href="#/login">Open SecondDeck</a>'}</nav></header>${content}`;
}

function safeSourceUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function widgetMarkup(widget, index) {
  const id = escapeHtml(widget.id || `widget-${index + 1}`);
  const title = escapeHtml(widget.title || widget.type || 'Widget');
  const lines = String(widget.content || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const copy = lines.length ? lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('') : '<p class="empty-widget">Ready for this session.</p>';
  if (widget.type === 'timer') return `<article class="companion-widget timer" data-widget-id="${id}"><small>${title}</small><strong>00:00:00</strong><button type="button" data-timer-toggle>Start</button></article>`;
  if (widget.type === 'checklist') return `<article class="companion-widget checklist" data-widget-id="${id}"><small>${title}</small>${lines.map((line, lineIndex) => `<label><input type="checkbox" data-persist="check:${id}:${lineIndex}"> ${escapeHtml(line)}</label>`).join('') || '<p class="empty-widget">Nothing left to check off.</p>'}</article>`;
  if (widget.type === 'notes') return `<article class="companion-widget notes" data-widget-id="${id}"><small>${title}</small><textarea data-persist="notes:${id}" aria-label="${title}" placeholder="Notes stay on this device…"></textarea></article>`;
  const source = safeSourceUrl(widget.sourceUrl);
  return `<article class="companion-widget ${escapeHtml(widget.type)}" data-widget-id="${id}"><small>${title}</small>${copy}${source ? `<a class="widget-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ''}</article>`;
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
  document.querySelectorAll('[data-timer-toggle]').forEach((toggle) => {
    const timer = toggle.previousElementSibling;
    let startedAt; let elapsed = 0; let interval;
    const draw = () => {
      const total = elapsed + (startedAt ? Date.now() - startedAt : 0);
      const seconds = Math.floor(total / 1000);
      timer.textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
        .map((part) => String(part).padStart(2, '0')).join(':');
    };
    toggle.addEventListener('click', () => {
      if (startedAt) { elapsed += Date.now() - startedAt; startedAt = undefined; clearInterval(interval); toggle.textContent = 'Resume'; draw(); }
      else { startedAt = Date.now(); interval = setInterval(draw, 250); toggle.textContent = 'Pause'; }
    });
  });
}

function companion() {
  document.documentElement.classList.add('companion-mode');
  const deck = deckFromLocation(location);
  if (!deck) {
    root.innerHTML = `<main class="companion-locked">${icon('shield')}<h1>No active Deck</h1><p>Return to SecondDeck, sign in, install a reviewed Deck, and choose <strong>Use on second screen</strong>.</p></main>`;
    return;
  }
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
      <p class="lede">SecondDeck turns the screen you are not playing on into a living companion—guides, notes, timers, controls, and community-built Decks that stay out of your way.</p>
      <div class="hero-actions"><a class="button" href="#/login">${icon('layers')} Open the app</a><a class="button ghost" href="obtainium://app/%7B%22id%22%3A%22com.lindseywebsolutions.seconddeck%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FLindseyWebSolutions%2Fseconddeck%22%2C%22author%22%3A%22Lindsey%20Web%20Solutions%22%2C%22name%22%3A%22SecondDeck%22%7D">${icon('download')} Add to Obtainium</a><a class="button ghost" href="${state.config?.downloadUrl || '/downloads/seconddeck-v0.2.1.apk'}">Download APK</a></div>
      <p class="obtainium">On your Thor? Use <strong>Add to Obtainium</strong> so the source is saved as SecondDeck, or install the signed APK directly.</p>
      <div class="device"><div class="screen screen-top"><div class="game-art"><span>NOW PLAYING</span><strong>YOUR GAME</strong></div></div><div class="hinge"></div><div class="screen screen-bottom"><div class="deck-preview"><div class="mini-card teal">ROUTE<small>North ridge → tower</small></div><div class="mini-card amber">TIMER<small>01:42:18</small></div><div class="mini-card wide">SESSION NOTES<small>Key found · East gate unlocked</small></div></div></div></div>
    </section>
    <section id="features" class="feature-section"><div><span class="section-num">01 / RUNTIME</span><h2>Useful when you need it.<br>Invisible when you don't.</h2></div><div class="feature-grid">
      <article>${icon('layers')}<h3>Dual-screen aware</h3><p>Matches installed Decks to recently played games. Secondary-display launch always remains under your control.</p></article>
      <article>${icon('shield')}<h3>Safe by design</h3><p>Decks are validated data—not executable plugins. You decide every permission.</p></article>
      <article>${icon('spark')}<h3>AI, with a local lane</h3><p>Private Ollama assistance for community accounts; Codex for verified LWS members.</p></article>
    </div></section>
    <section id="community" class="community"><div><span class="section-num">02 / COMMUNITY</span><h2>Build on the device<br>you actually play on.</h2><p>Create a Deck from your Thor, preview it instantly, then submit it for review. No laptop and no native code required.</p><a class="button ghost" href="#/create">Start a Deck ${icon('plus')}</a></div><div class="manifest"><div class="manifest-head"><i></i><i></i><i></i><span>deck.json</span></div><pre>{
  <b>"schemaVersion"</b>: 1,
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
  const widgetNames = deck.layout.widgets.slice(0, 4).map((widget) => `<span>${escapeHtml(widget.type)}</span>`).join('');
  const installed = state.installed.some((item) => item.id === deck.id);
  const active = state.activeDeck?.id === deck.id;
  const canReview = state.user?.aiProvider === 'codex';
  const action = deck.status === 'review'
    ? canReview
      ? `<span class="review-actions"><button class="text-button" data-action="review" data-review-status="rejected" data-deck-id="${escapeHtml(deck.id)}">Reject</button><button class="text-button" data-action="review" data-review-status="published" data-deck-id="${escapeHtml(deck.id)}">Publish</button></span>`
      : '<span class="review-note">Awaiting review</span>'
    : deck.status !== 'published'
      ? `<span class="review-note">${escapeHtml(deck.status)}</span>`
    : active
      ? `<button class="text-button active-action" data-action="display" data-deck-id="${escapeHtml(deck.id)}">Launch ↗</button>`
      : installed
        ? `<button class="text-button" data-action="activate" data-deck-id="${escapeHtml(deck.id)}">Use on second screen →</button>`
        : `<button class="text-button" data-action="install" data-deck-id="${escapeHtml(deck.id)}">Install locally ↓</button>`;
  return `<article class="deck-card"><div class="deck-art"><div>${widgetNames}</div></div><div class="deck-copy"><small>${escapeHtml(deck.target.platforms.join(' · '))}</small><h3>${escapeHtml(deck.name)}</h3><p>${escapeHtml(deck.description)}</p><div><span class="status ${escapeHtml(deck.status)}">${active ? 'active' : installed ? 'installed' : escapeHtml(deck.status)}</span><button class="text-button" data-action="preview" data-deck-id="${escapeHtml(deck.id)}">Preview</button></div><div class="deck-action">${action}</div></div></article>`;
}

async function appPage() {
  if (!(await ensureUser())) return;
  const runtimeMessage = state.detectedDeck ? `${state.detectedDeck.name} matched to ${state.display.foregroundPackage}` : state.display?.foregroundPackage ? `No installed Deck matches ${state.display.foregroundPackage}` : state.display?.usageAccessGranted ? 'Waiting for a supported game' : state.display?.native ? 'Game detection is off' : 'Web preview';
  root.innerHTML = pageShell(`<main class="dashboard"><section class="dash-head"><div><span class="eyebrow"><span></span> ${escapeHtml(state.user.email)}</span><h1>Your second screen,<br>ready when you are.</h1></div><button class="button" data-action="display" ${state.activeDeck ? '' : 'disabled'}>${state.activeDeck ? `Launch ${escapeHtml(state.activeDeck.name)}` : 'Install a Deck to launch'}</button></section>
    <div class="device-status" id="device-status"><span class="pulse"></span><strong>${state.offline ? 'Offline library ready' : state.display?.isExtended ? 'Second display detected' : 'Ready for a second display'}</strong><span>${escapeHtml(runtimeMessage)} · ${state.installed.length} installed · ${state.decks.length} available</span>${state.display?.native && !state.display?.usageAccessGranted ? '<button class="text-button" data-action="usage-access">Enable game detection</button>' : ''}</div>
    <section><div class="section-title"><div><span class="section-num">COMMUNITY LIBRARY</span><h2>Reviewed Decks</h2></div><a class="button ghost small" href="#/create">${icon('plus')} Create Deck</a></div><div class="deck-grid">${state.decks.map(deckCard).join('') || '<p class="empty-library">You are offline. Installed Decks remain available after the catalog reconnects.</p>'}</div></section></main>`, true);
}

function findDeck(id) {
  return state.decks.find((deck) => deck.id === id) || state.installed.find((deck) => deck.id === id);
}

function previewDeck(deck) {
  const existing = document.querySelector('#deck-preview-dialog');
  if (existing) existing.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'deck-preview-dialog';
  dialog.className = 'deck-dialog';
  dialog.innerHTML = `<button class="dialog-close" data-action="close-preview" aria-label="Close preview">×</button><span class="section-num">DECLARATIVE PREVIEW</span><h2>${escapeHtml(deck.name)}</h2><p>${escapeHtml(deck.description)}</p><div class="preview-widgets">${deck.layout.widgets.map((widget) => `<article><small>${escapeHtml(widget.type)}</small><strong>${escapeHtml(widget.title)}</strong>${widget.content ? `<p>${escapeHtml(widget.content).replace(/\n/g, '<br>')}</p>` : ''}</article>`).join('')}</div><footer><span>${escapeHtml(deck.target.packageNames.join(' · '))}</span><span>${deck.layout.columns} column${deck.layout.columns === 1 ? '' : 's'}</span></footer>`;
  document.body.append(dialog);
  dialog.showModal();
}

function createPage() {
  root.innerHTML = pageShell(`<main class="builder"><section class="builder-copy"><span class="section-num">DECK CREATOR</span><h1>Make the bottom screen yours.</h1><p>Describe the game, choose only the widgets you need, and submit a safe declarative Deck for review.</p></section>
    <form id="deck-form" class="builder-form"><label>Deck name<input name="name" required minlength="3" maxlength="80" placeholder="Emerald Field Notes"></label><label>What does it help with?<textarea name="description" required minlength="10" maxlength="500" placeholder="Routes, notes, and a session checklist…"></textarea></label><label>Android package name<input name="packageName" required pattern="[A-Za-z][A-Za-z0-9_.]{2,199}" placeholder="com.example.game"></label><div class="form-row"><label>Device profile<select name="deviceProfile"><option value="ayn-thor">AYN Thor</option><option value="generic-dual-screen">Generic dual screen</option><option value="foldable">Foldable</option><option value="tablet-external">Tablet + display</option></select></label><label>Wide-screen columns<select name="columns"><option value="2">Two</option><option value="1">One</option><option value="3">Three</option><option value="4">Four</option></select></label></div><label>Starter content <small>one checklist item or guide line per row</small><textarea name="content" maxlength="4000" placeholder="Find the eastern gate\nRestock supplies\nSave before the tower"></textarea></label><label>Optional public source URL<input name="sourceUrl" type="url" maxlength="500" placeholder="https://example.com/guide"></label><fieldset><legend>Widgets</legend>${['guide','checklist','notes','timer','controls','keyboard','trackpad','performance','links'].map((item, index) => `<label class="check"><input type="checkbox" name="widgets" value="${item}" ${index < 3 ? 'checked' : ''}><span>${item}</span></label>`).join('')}</fieldset><label class="toggle"><input type="checkbox" name="aiEnabled"><span>Allow optional AI assistance for this Deck</span></label><button class="button" type="submit">Submit for review</button><p class="form-status" role="status"></p></form></main>`, true);
  document.querySelector('#deck-form').addEventListener('submit', submitDeck);
}

async function submitDeck(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const name = form.get('name'); const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64); const types = form.getAll('widgets'); const status = document.querySelector('.form-status');
  if (!types.length) { status.textContent = 'Choose at least one widget.'; return; }
  const content = String(form.get('content') || '').trim(); const sourceUrl = String(form.get('sourceUrl') || '').trim(); const columns = Number(form.get('columns'));
  const permissions = [...new Set([...(types.some((type) => ['keyboard', 'trackpad'].includes(type)) ? ['keyboard'] : []), ...(types.includes('performance') ? ['performance'] : []), ...(sourceUrl ? ['network'] : []), 'external-display'])];
  const deck = { schemaVersion: 1, kind: 'deck', slug, name, description: form.get('description'), target: { packageNames: [form.get('packageName')], platforms: ['android'], deviceProfiles: [form.get('deviceProfile')] }, layout: { columns: 1, breakpoints: [{ minWidth: 700, columns }], widgets: types.map((type, index) => ({ id: `${type}-${index + 1}`, type, title: type[0].toUpperCase() + type.slice(1), ...(content && ['guide', 'checklist', 'controls', 'keyboard', 'trackpad', 'performance'].includes(type) ? { content } : {}), ...(sourceUrl && ['guide', 'links'].includes(type) ? { sourceUrl } : {}) })) }, permissions, sources: sourceUrl ? [sourceUrl] : [], ai: { enabled: form.get('aiEnabled') === 'on', ...(form.get('aiEnabled') === 'on' ? { purpose: 'Assist with this Deck layout and session workflow.' } : {}) } };
  try { await api('/api/decks', { method: 'POST', body: JSON.stringify(deck) }); status.textContent = 'Deck submitted for review.'; setTimeout(() => { location.hash = '#/app'; }, 900); }
  catch (error) { if (error.status === 401) location.hash = '#/login'; else status.textContent = error.message; }
}

function assistantPage() {
  root.innerHTML = pageShell(`<main class="assistant-page"><section><span class="section-num">OPTIONAL AI</span><h1>A companion,<br>not a copilot.</h1><p>Ask for a checklist, a layout idea, or help simplifying a Deck. SecondDeck never claims to see your live game.</p><div class="provider-note">${icon('shield')} Your verified account selects the provider on the server.</div></section><form id="assistant-form"><textarea name="prompt" minlength="3" maxlength="2000" required placeholder="Make me a two-column layout for a long RPG session…"></textarea><button class="button">Ask SecondDeck</button><article class="answer" hidden></article></form></main>`, true);
  document.querySelector('#assistant-form').addEventListener('submit', askAssistant);
}

async function askAssistant(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); const answer = event.currentTarget.querySelector('.answer'); button.disabled = true; button.textContent = 'Thinking…';
  try { const result = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ prompt: new FormData(event.currentTarget).get('prompt') }) }); answer.hidden = false; answer.innerHTML = `<small>${escapeHtml(result.provider)} · ${escapeHtml(result.model)}</small><p>${escapeHtml(result.answer).replace(/\n/g, '<br>')}</p>`; }
  catch (error) { answer.hidden = false; answer.textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Ask SecondDeck'; }
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
  if (state.offline) state.decks = state.installed;
  else try { state.decks = (await api('/api/decks')).decks; }
  catch (error) {
    if (error.status === 401) { await clearToken(); location.hash = '#/login'; return false; }
    state.offline = true;
    state.decks = state.installed;
  }
  state.detectedDeck = deckForPackage(state.display?.foregroundPackage, state.installed);
  if (state.detectedDeck && state.activeDeck?.id !== state.detectedDeck.id) state.activeDeck = setActiveDeck(state.detectedDeck.id);
  return true;
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }

async function route() {
  if (isCompanionMode) { companion(); return; }
  const path = location.hash.slice(1) || '/';
  if (!state.config) state.config = await api('/api/config').catch(() => null);
  if (path === '/') home(); else if (path === '/login') login(); else if (path === '/app') await appPage(); else if (path === '/create') { if (await ensureUser()) createPage(); } else if (path === '/assistant') { if (await ensureUser()) assistantPage(); } else home();
}

document.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'logout') { await clearToken(); location.hash = '#/'; }
  if (action === 'close-preview') event.target.closest('dialog')?.close();
  if (action === 'usage-access') {
    try { await requestGameDetectionAccess(); document.querySelector('#device-status strong').textContent = 'Grant Usage Access, then return to SecondDeck.'; }
    catch (error) { document.querySelector('#device-status strong').textContent = error.message; }
  }
  if (action === 'preview') { const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId); if (deck) previewDeck(deck); }
  if (action === 'install') {
    const deck = findDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    if (deck?.status === 'published') { state.installed = installDeck(deck); state.activeDeck = activeDeck(); await appPage(); }
  }
  if (action === 'review') {
    const button = event.target.closest('[data-deck-id]');
    try { await api(`/api/decks/${button.dataset.deckId}/review`, { method: 'POST', body: JSON.stringify({ status: button.dataset.reviewStatus }) }); await appPage(); }
    catch (error) { const status = document.querySelector('#device-status strong'); if (status) status.textContent = error.message; }
  }
  if (action === 'uninstall') {
    state.installed = uninstallDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    state.activeDeck = activeDeck(); await appPage();
  }
  if (action === 'activate') {
    const deck = setActiveDeck(event.target.closest('[data-deck-id]').dataset.deckId);
    state.activeDeck = deck;
    try { await openCompanionDisplay(deck); }
    catch (error) { document.querySelector('#device-status strong').textContent = error.message; }
  }
  if (action === 'display') {
    const requested = event.target.closest('[data-deck-id]')?.dataset.deckId;
    if (requested) state.activeDeck = setActiveDeck(requested);
    try { await openCompanionDisplay(state.activeDeck); }
    catch (error) { const status = document.querySelector('#device-status strong'); if (status) status.textContent = error.message; }
  }
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && location.hash === '#/app') appPage(); });
route();
