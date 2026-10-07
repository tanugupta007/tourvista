import { esc, searchPlaces, nearbyPlaces, reverseGeocode, getPosition, aiChat, ctx, round } from './services/geo.js';

/* styles are injected so only one <script> tag is needed per page */
const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('../css/tourvista-map.css', import.meta.url).href;
document.head.appendChild(css);

/* small nav helpers (hamburger + theme) for pages that have none */
try { const t = localStorage.getItem('tourvista_theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* ignore */ }
document.getElementById('hamburgerBtn')?.addEventListener('click', () => document.getElementById('navLinks')?.classList.toggle('open'));
const themeBtn = document.getElementById('themeToggleBtn');
if (themeBtn && !document.querySelector('script[src$="about.js"]')) {
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('tourvista_theme', next); } catch { /* ignore */ }
  });
}

/* ---------------- widget DOM ---------------- */
const root = document.createElement('div');
root.className = 'tv-ai';
root.innerHTML = `
  <button class="tv-ai-fab" id="tvAiFab" aria-label="Open TourVista AI travel assistant"><span aria-hidden="true">🤖</span> TourVista AI</button>
  <section class="tv-ai-panel" id="tvAiPanel" role="dialog" aria-label="TourVista AI travel assistant" hidden>
    <header>
      <div><strong>🤖 TourVista AI</strong><small id="tvAiCtx">Ask about any place in India</small></div>
      <div><button id="tvAiClear" title="Start a new chat" aria-label="Start a new chat"><i class="fa-solid fa-rotate-right"></i></button>
      <button id="tvAiClose" aria-label="Close assistant"><i class="fa-solid fa-xmark"></i></button></div>
    </header>
    <div class="tv-ai-log" id="tvAiLog" aria-live="polite"></div>
    <div class="tv-ai-chips">
      <button>Plan 3 days and ₹10,000 from Gwalior</button>
      <button>Suggest tourist places near me</button>
      <button>Best time to visit Manali?</button>
    </div>
    <div class="tv-ai-form">
      <textarea id="tvAiInput" rows="1" maxlength="500" placeholder="Plan a trip, ask for places near you..." aria-label="Message TourVista AI"></textarea>
      <button id="tvAiSend" aria-label="Send message"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
    <p class="tv-ai-foot">AI can make mistakes. Prices and timings are estimates; verify before booking.</p>
  </section>`;
document.body.appendChild(root);

const $ = id => document.getElementById(id);
const log = $('tvAiLog'), input = $('tvAiInput'), panel = $('tvAiPanel');
let history = [], busy = false;
try { history = JSON.parse(sessionStorage.getItem('tv_chat')) || []; } catch { history = []; }

function md(text) {
  let out = '', inList = false;
  for (const raw of esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split('\n')) {
    const li = raw.match(/^\s*[-*•]\s+(.*)/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${li[1]}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    const h = raw.match(/^#{1,4}\s+(.*)/);
    out += h ? `<h5>${h[1]}</h5>` : raw.trim() ? `<p>${raw}</p>` : '';
  }
  return out + (inList ? '</ul>' : '');
}

function bubble(role, html, extra = '') {
  const d = document.createElement('div');
  d.className = `tv-msg tv-msg--${role} ${extra}`;
  d.innerHTML = html;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

function add(role, text, local = false) {
  bubble(role, role === 'user' ? `<p>${esc(text)}</p>` : md(text), local ? 'tv-msg--err' : '');
  if (!local) {
    history.push({ role, content: text });
    history = history.slice(-20);
    try { sessionStorage.setItem('tv_chat', JSON.stringify(history)); } catch { /* ignore */ }
  }
}

function greet() {
  log.innerHTML = '';
  bubble('assistant', md('Namaste! I am **TourVista AI**.\nTell me where you want to go, your days and budget, and I will plan it. I can also find attractions near you or near any place you select on the map.'));
  history.forEach(m => bubble(m.role, m.role === 'user' ? `<p>${esc(m.content)}</p>` : md(m.content)));
}

function refreshCtx() {
  const c = ctx.get();
  $('tvAiCtx').textContent = c.destination ? `Using map selection: ${c.destination.name}` : c.userLocation ? `Using your location: ${c.userLocation.label}` : 'Ask about any place in India';
}

/* ---------------- AI + map connection ---------------- */
async function buildContext(text) {
  const c = ctx.get();
  const out = { userLocation: c.userLocation || null, selectedDestination: c.destination || null, trip: c.trip || [], nearby: null };
  const named = text.match(/\b(?:near|around|close to)\s+(?!me\b|here\b|my\b)([a-z][\w\s.'-]{2,60}?)(?=[?.!,]|$|\s(?:for|with|in|and|within)\s)/i);
  const wantsMe = /\b(near me|around me|close to me|around here)\b/i.test(text);
  let center = null;

  if (named) {
    const found = await searchPlaces(named[1].trim());
    if (found[0]) center = { name: found[0].name, lat: found[0].lat, lon: found[0].lon };
  } else if (wantsMe || (/\bnearby\b/i.test(text) && !c.destination)) {
    if (!out.userLocation) {
      let pos;
      try { pos = await getPosition(); }
      catch (e) { throw new Error(`${e.message} You can also name a place, for example "near Khajuraho".`); }
      let label = 'Current location';
      try { label = (await reverseGeocode(pos.lat, pos.lon)).label; } catch { /* keep default */ }
      out.userLocation = { lat: round(pos.lat, 3), lon: round(pos.lon, 3), label };
      ctx.set({ userLocation: out.userLocation });
    }
    center = { name: out.userLocation.label, lat: out.userLocation.lat, lon: out.userLocation.lon };
  } else if (/\bnearby\b|\bnear\b/i.test(text) && c.destination) {
    center = { name: c.destination.name, lat: c.destination.lat, lon: c.destination.lon };
  }

  if (center) {
    try { out.nearby = { center, places: await nearbyPlaces(center.lat, center.lon, 10000) }; }
    catch { out.nearby = { center, places: [], note: 'Nearby lookup failed; do not guess places.' }; }
  }
  return out;
}

async function send(text) {
  text = text.trim().slice(0, 500);
  if (!text || busy) return;
  busy = true;
  input.value = '';
  add('user', text);
  const typing = bubble('assistant', '<span class="tv-typing"><i></i><i></i><i></i></span>');
  try {
    const context = await buildContext(text);
    const { reply } = await aiChat(history.slice(-10), context);
    typing.remove();
    add('assistant', reply);
  } catch (e) {
    typing.remove();
    add('assistant', e.message || 'TourVista AI is unavailable right now. Please try again shortly.', true);
  } finally { busy = false; }
}

/* ---------------- events ---------------- */
function open(show) {
  panel.hidden = !show;
  $('tvAiFab').classList.toggle('hide', show);
  if (show) { refreshCtx(); input.focus(); log.scrollTop = log.scrollHeight; }
}
$('tvAiFab').addEventListener('click', () => open(true));
$('tvAiClose').addEventListener('click', () => open(false));
$('tvAiClear').addEventListener('click', () => { history = []; try { sessionStorage.removeItem('tv_chat'); } catch { /* ignore */ } greet(); });
$('tvAiSend').addEventListener('click', () => send(input.value));
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
root.querySelector('.tv-ai-chips').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') send(e.target.textContent); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) open(false); });
window.addEventListener('tv:ctx', refreshCtx);
greet();

/* Home page: "Where do you want to go?" opens the map with that place selected */
const homeBtn = document.getElementById('mainSearchBtn'), homeInput = document.getElementById('searchLocation');
if (homeBtn && homeInput) {
  const go = () => {
    const q = homeInput.value.trim();
    if (!q) { homeInput.focus(); return; }
    location.href = `map.html?q=${encodeURIComponent(q)}`;
  };
  homeBtn.addEventListener('click', go);
  homeInput.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
