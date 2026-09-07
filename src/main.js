import './styles.css';
import { api, clearToken, getToken, setToken } from './auth.js';
import { getDisplayState, openCompanionDisplay } from './native.js';

const root = document.querySelector('#app');
const state = { user: null, decks: [], display: null, config: null };
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

function companion() {
  document.documentElement.classList.add('companion-mode');
  root.innerHTML = `<main class="companion-shell">
    <header><div><span class="eyebrow"><span></span> ACTIVE DECK</span><h1>Session compass</h1></div><span class="companion-badge">LOCAL</span></header>
    <section class="companion-grid">
      <article class="companion-widget route"><small>NEXT ROUTE</small><strong>North ridge → tower</strong><p>Cross the bridge, then keep east at the split.</p></article>
      <article class="companion-widget timer"><small>SESSION TIMER</small><strong id="companion-timer">00:00:00</strong><button type="button" id="timer-toggle">Start</button></article>
      <article class="companion-widget checklist"><small>CHECKLIST</small><label><input type="checkbox"> Visit the eastern gate</label><label><input type="checkbox"> Restock supplies</label><label><input type="checkbox"> Save before the tower</label></article>
      <article class="companion-widget notes"><small>SESSION NOTES</small><textarea aria-label="Session notes" placeholder="Notes stay on this device…"></textarea></article>
    </section>
    <footer><span>SECONDDECK / COMPANION DISPLAY</span><span>No network required</span></footer>
  </main>`;

  let startedAt;
  let elapsed = 0;
  let interval;
  const timer = document.querySelector('#companion-timer');
  const toggle = document.querySelector('#timer-toggle');
  const draw = () => {
    const total = elapsed + (startedAt ? Date.now() - startedAt : 0);
    const seconds = Math.floor(total / 1000);
    timer.textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((part) => String(part).padStart(2, '0')).join(':');
  };
  toggle.addEventListener('click', () => {
    if (startedAt) {
      elapsed += Date.now() - startedAt;
      startedAt = undefined;
      clearInterval(interval);
      toggle.textContent = 'Resume';
      draw();
    } else {
      startedAt = Date.now();
      interval = setInterval(draw, 250);
      toggle.textContent = 'Pause';
    }
  });
}

function home() {
  root.innerHTML = pageShell(`<main>
    <section class="hero"><div class="eyebrow"><span></span> Built first for AYN Thor</div>
      <h1>Your game up top.<br><em>Everything else below.</em></h1>
      <p class="lede">SecondDeck turns the screen you are not playing on into a living companion—guides, notes, timers, controls, and community-built Decks that stay out of your way.</p>
      <div class="hero-actions"><a class="button" href="#/login">${icon('layers')} Open the app</a><a class="button ghost" href="obtainium://app/%7B%22id%22%3A%22com.lindseywebsolutions.seconddeck%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FLindseyWebSolutions%2Fseconddeck%22%2C%22author%22%3A%22Lindsey%20Web%20Solutions%22%2C%22name%22%3A%22SecondDeck%22%7D">${icon('download')} Add to Obtainium</a><a class="button ghost" href="${state.config?.downloadUrl || '/downloads/seconddeck-v0.1.1.apk'}">Download APK</a></div>
      <p class="obtainium">On your Thor? Use <strong>Add to Obtainium</strong> so the source is saved as SecondDeck, or install the signed APK directly.</p>
      <div class="device"><div class="screen screen-top"><div class="game-art"><span>NOW PLAYING</span><strong>YOUR GAME</strong></div></div><div class="hinge"></div><div class="screen screen-bottom"><div class="deck-preview"><div class="mini-card teal">ROUTE<small>North ridge → tower</small></div><div class="mini-card amber">TIMER<small>01:42:18</small></div><div class="mini-card wide">SESSION NOTES<small>Key found · East gate unlocked</small></div></div></div></div>
    </section>
    <section id="features" class="feature-section"><div><span class="section-num">01 / RUNTIME</span><h2>Useful when you need it.<br>Invisible when you don't.</h2></div><div class="feature-grid">
      <article>${icon('layers')}<h3>Dual-screen aware</h3><p>Detects secondary displays and yields when a game already owns both screens.</p></article>
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
  return `<article class="deck-card"><div class="deck-art"><div>${widgetNames}</div></div><div class="deck-copy"><small>${escapeHtml(deck.target.platforms.join(' · '))}</small><h3>${escapeHtml(deck.name)}</h3><p>${escapeHtml(deck.description)}</p><div><span class="status ${deck.status}">${deck.status}</span><button class="text-button">Preview →</button></div></div></article>`;
}

async function appPage() {
  if (!(await ensureUser())) return;
  root.innerHTML = pageShell(`<main class="dashboard"><section class="dash-head"><div><span class="eyebrow"><span></span> ${escapeHtml(state.user.email)}</span><h1>Your second screen,<br>ready when you are.</h1></div><button class="button" data-action="display">Launch companion display</button></section>
    <div class="device-status"><span class="pulse"></span><strong>${state.display?.isExtended ? 'Second display detected' : 'Ready for a second display'}</strong><span>${state.display?.native ? 'Android runtime' : 'Web preview'} · ${state.decks.length} Deck${state.decks.length === 1 ? '' : 's'}</span></div>
    <section><div class="section-title"><div><span class="section-num">YOUR LIBRARY</span><h2>Installed Decks</h2></div><a class="button ghost small" href="#/create">${icon('plus')} Create Deck</a></div><div class="deck-grid">${state.decks.map(deckCard).join('')}</div></section></main>`, true);
}

function createPage() {
  root.innerHTML = pageShell(`<main class="builder"><section class="builder-copy"><span class="section-num">DECK CREATOR</span><h1>Make the bottom screen yours.</h1><p>Describe the game, choose only the widgets you need, and submit a safe declarative Deck for review.</p></section>
    <form id="deck-form" class="builder-form"><label>Deck name<input name="name" required minlength="3" maxlength="80" placeholder="Emerald Field Notes"></label><label>What does it help with?<textarea name="description" required minlength="10" maxlength="500" placeholder="Routes, notes, and a session checklist…"></textarea></label><label>Android package name<input name="packageName" required pattern="[A-Za-z][A-Za-z0-9_.]{2,199}" placeholder="com.example.game"></label><fieldset><legend>Widgets</legend>${['guide','checklist','notes','timer','controls','performance'].map((item, index) => `<label class="check"><input type="checkbox" name="widgets" value="${item}" ${index < 3 ? 'checked' : ''}><span>${item}</span></label>`).join('')}</fieldset><button class="button" type="submit">Submit for review</button><p class="form-status" role="status"></p></form></main>`, true);
  document.querySelector('#deck-form').addEventListener('submit', submitDeck);
}

async function submitDeck(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const name = form.get('name'); const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64); const types = form.getAll('widgets'); const status = document.querySelector('.form-status');
  if (!types.length) { status.textContent = 'Choose at least one widget.'; return; }
  const deck = { schemaVersion: 1, slug, name, description: form.get('description'), target: { packageNames: [form.get('packageName')], platforms: ['android'] }, layout: { columns: 2, widgets: types.map((type, index) => ({ id: `${type}-${index + 1}`, type, title: type[0].toUpperCase() + type.slice(1) })) }, permissions: [], ai: { enabled: false } };
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
  try { const [me, decks, display] = await Promise.all([api('/api/me'), api('/api/decks'), getDisplayState()]); state.user = me; state.decks = decks.decks; state.display = display; return true; }
  catch { await clearToken(); location.hash = '#/login'; return false; }
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
  if (action === 'display') await openCompanionDisplay();
});
window.addEventListener('hashchange', route);
route();
