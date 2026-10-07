import { ping, esc, debounce, searchPlaces, reverseGeocode, nearbyPlaces, getRoute, getPosition, fmtDist, fmtTime, ctx, toast, round } from './services/geo.js';

const $ = id => document.getElementById(id);
const pin = (cls, html) => L.divIcon({ className: '', html: `<div class="tv-pin ${cls}">${html}</div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
const MODES = { driving: 'by car', walking: 'on foot', cycling: 'by bike' };
const state = { origin: null, dest: null, mode: 'driving', trip: [], tripLegs: null, routeShown: false };
let map, userLayer, destMarker, routeLayer, nearbyLayer, tripLayer, nearbyMarkers = [];

/* ---------------- map ---------------- */
function initMap() {
  if (typeof L === 'undefined') { $('tvMap').innerHTML = '<p class="tv-map-fail">The map could not load. Please check your internet connection and refresh.</p>'; return false; }
  map = L.map('tvMap').setView([22.5, 79], 5);
  map.attributionControl.setPosition('bottomleft');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  [routeLayer, nearbyLayer, tripLayer, userLayer] = [0, 1, 2, 3].map(() => L.layerGroup().addTo(map));
  return true;
}

function toggleFs(force) {
  const wrap = $('tvMapWrap');
  const on = typeof force === 'boolean' ? force : !wrap.classList.contains('tv-fs');
  wrap.classList.toggle('tv-fs', on);
  document.body.classList.toggle('tv-lock', on);
  $('tvFs').innerHTML = on ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
  $('tvFs').setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen map');
  setTimeout(() => map.invalidateSize(), 60);
}

/* ---------------- autocomplete search (debounced, cancels stale requests) ---------------- */
function attachSearch(input, list, onPick) {
  let ctrl, items = [];
  const hide = () => { list.hidden = true; list.innerHTML = ''; items = []; };
  const show = html => { list.innerHTML = html; list.hidden = false; };
  const pick = i => { const p = items[i]; if (!p) return; hide(); input.value = p.name; onPick(p); };
  const run = debounce(async () => {
    const text = input.value.trim();
    if (text.length < 3) return hide();
    ctrl?.abort(); ctrl = new AbortController();
    show('<li class="tv-res-msg"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching places in India...</li>');
    try {
      items = await searchPlaces(text, ctrl.signal);
      if (!items.length) return show('<li class="tv-res-msg">No place found. Check the spelling or try a nearby city.</li>');
      show(items.map((p, i) => `<li role="option" data-i="${i}"><i class="fa-solid fa-location-dot"></i><span><strong>${esc(p.name)}</strong><small>${esc(p.label)}</small></span></li>`).join(''));
    } catch (e) { if (e.name !== 'AbortError') show(`<li class="tv-res-msg tv-err">${esc(e.message)}</li>`); }
  }, 500);
  input.addEventListener('input', () => { if (input.value.trim().length < 3) { ctrl?.abort(); hide(); } else run(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!input.value.trim()) return toast('Type a place name to search, e.g. "Taj Mahal".', 'info');
      if (items.length && !list.hidden) pick(0);
    }
  });
  list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) pick(+li.dataset.i); });
  document.addEventListener('click', e => { if (!input.parentElement.contains(e.target)) hide(); });
}

/* ---------------- current / manual origin ---------------- */
function showOrigin(label, lat, lon) {
  const box = $('tvLocInfo');
  box.hidden = false;
  box.innerHTML = `<strong>📍 Your Location: ${esc(label)}</strong><small>Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)}</small>`;
}

function setOrigin(o, { fly = true } = {}) {
  state.origin = o;
  userLayer.clearLayers();
  L.marker([o.lat, o.lon], { icon: pin('tv-pin--user', '<i class="fa-solid fa-location-crosshairs"></i>') }).addTo(userLayer).bindPopup(`<strong>Starting point</strong><br><small>${esc(o.label)}</small>`);
  if (o.accuracy && o.accuracy < 5000) L.circle([o.lat, o.lon], { radius: o.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.08 }).addTo(userLayer);
  if (fly && !state.dest) map.flyTo([o.lat, o.lon], 12, { duration: 1.2 });
  if (state.dest && state.routeShown) getDirections();
}

async function locate() {
  const btn = $('tvLocate'), html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Finding you...';
  try {
    const pos = await getPosition();
    const loc = { lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy, name: 'Your location', label: 'Your current location' };
    setOrigin(loc);
    showOrigin('locating address...', pos.lat, pos.lon);
    try { loc.label = (await reverseGeocode(pos.lat, pos.lon)).label; } catch { loc.label = 'Current location'; }
    showOrigin(loc.label, pos.lat, pos.lon);
    $('tvOrigin').value = loc.label;
    ctx.set({ userLocation: { lat: round(pos.lat, 3), lon: round(pos.lon, 3), label: loc.label } });
    toast('Location found.', 'success');
  } catch (e) {
    const box = $('tvLocInfo');
    box.hidden = false;
    box.innerHTML = `<strong>${esc(e.message)}</strong><small>Type a city or landmark in "Starting point" above.</small>`;
    $('tvOrigin').focus();
  } finally { btn.disabled = false; btn.innerHTML = html; }
}

/* ---------------- destination + place card ---------------- */
function selectDestination(p) {
  state.dest = p;
  clearRoute();
  nearbyLayer.clearLayers(); nearbyMarkers = [];
  destMarker?.remove();
  destMarker = L.marker([p.lat, p.lon], { icon: pin('tv-pin--dest', '<i class="fa-solid fa-flag-checkered"></i>') }).addTo(map)
    .bindPopup(`<strong>${esc(p.name)}</strong><br><small>${esc(p.label)}</small>`).openPopup();
  map.flyTo([p.lat, p.lon], 12, { duration: 1.2 });
  ctx.set({ destination: { name: p.name, label: p.label, lat: round(p.lat, 4), lon: round(p.lon, 4) } });
  renderCard(p);
  loadWiki(p);
}

async function loadWiki(p) {
  const w = p.extra?.wikipedia;
  if (!w || !w.includes(':')) return;
  const [lang, ...t] = w.split(':');
  try {
    const r = await fetch(`https://${encodeURIComponent(lang)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.join(':').replace(/ /g, '_'))}`);
    if (!r.ok) return;
    const d = await r.json();
    p._wiki = { text: d.extract, img: d.thumbnail?.source, url: d.content_urls?.desktop?.page };
    if (state.dest === p) renderCard(p);
  } catch { /* description is optional */ }
}

function renderCard(p) {
  const el = $('tvPlaceCard'), x = p.extra || {}, wk = p._wiki;
  const cat = [p.category, p.type].filter(Boolean).map(s => s.replace(/_/g, ' ')).join(' / ');
  const fee = x.fee === 'yes' ? 'Paid entry (check price on site)' : x.fee === 'no' ? 'Free entry' : x.fee;
  const rows = [
    ['fa-location-dot', 'Location', p.label],
    cat && ['fa-landmark', 'Category', cat],
    x.opening_hours && ['fa-clock', 'Opening hours', x.opening_hours],
    fee && ['fa-indian-rupee-sign', 'Entry fee', fee]
  ].filter(Boolean);
  el.hidden = false;
  el.innerHTML = `
    ${wk?.img ? `<img class="tv-card-img" loading="lazy" src="${esc(wk.img)}" alt="${esc(p.name)}">` : ''}
    <h3>${esc(p.name)}</h3>
    ${wk?.text ? `<p class="tv-desc">${esc(wk.text.slice(0, 280))}${wk.text.length > 280 ? '...' : ''} <a href="${esc(wk.url)}" target="_blank" rel="noopener">Wikipedia</a></p>` : ''}
    <ul class="tv-facts">${rows.map(r => `<li><i class="fa-solid ${r[0]}"></i><span><small>${r[1]}</small>${esc(r[2])}</span></li>`).join('')}</ul>
    <p class="tv-note">Ratings, prices and photos appear only when an open source provides them.</p>
    <div class="tv-actions">
      <button class="btn btn-primary" data-act="dir"><i class="fa-solid fa-route"></i> Get Directions</button>
      <button class="btn btn-outline" data-act="add"><i class="fa-solid fa-plus"></i> Add to Trip</button>
      <button class="btn btn-outline" data-act="fly"><i class="fa-solid fa-map-location-dot"></i> View on Map</button>
      <button class="btn btn-outline" data-act="nearby"><i class="fa-solid fa-camera"></i> Nearby</button>
    </div>
    <div id="tvNearby"></div>`;
}

async function loadNearby(p) {
  const box = $('tvNearby');
  box.innerHTML = '<p class="tv-note"><i class="fa-solid fa-circle-notch fa-spin"></i> Finding attractions within 10 km...</p>';
  try {
    const places = await nearbyPlaces(p.lat, p.lon);
    nearbyLayer.clearLayers(); nearbyMarkers = [];
    if (!places.length) { box.innerHTML = '<p class="tv-note">No mapped attractions found within 10 km.</p>'; return; }
    places.forEach(n => nearbyMarkers.push(L.marker([n.lat, n.lon], { icon: pin('tv-pin--near', '<i class="fa-solid fa-camera"></i>') }).addTo(nearbyLayer)
      .bindPopup(`<strong>${esc(n.name)}</strong><br><small>${esc(n.kind)} - ${n.distance_km} km away</small>`)));
    box.innerHTML = `<h4>Nearby attractions</h4><ul class="tv-near">${places.map((n, i) =>
      `<li data-i="${i}"><span><strong>${esc(n.name)}</strong><small>${esc(n.kind)} - ${n.distance_km} km</small></span><button data-add="${i}" title="Add to trip" aria-label="Add ${esc(n.name)} to trip">+</button></li>`).join('')}</ul>`;
    box.onclick = e => {
      const add = e.target.closest('[data-add]'), li = e.target.closest('li[data-i]');
      if (add) { const n = places[+add.dataset.add]; addToTrip({ id: `${n.lat},${n.lon}`, name: n.name, lat: n.lat, lon: n.lon }); }
      else if (li) { const n = places[+li.dataset.i]; map.flyTo([n.lat, n.lon], 14); nearbyMarkers[+li.dataset.i].openPopup(); }
    };
  } catch (e) { box.innerHTML = `<p class="tv-note tv-err">${esc(e.message)}</p>`; }
}

/* ---------------- directions ---------------- */
function clearRoute() { routeLayer.clearLayers(); state.routeShown = false; $('tvRoutePanel').hidden = true; }

async function drawRoute(points, mode) {
  try {
    const r = await getRoute(points, mode);
    routeLayer.clearLayers();
    const line = L.geoJSON(r.geometry, { style: { color: '#2563eb', weight: 6, opacity: 0.85 } }).addTo(routeLayer);
    map.fitBounds(line.getBounds(), { padding: [40, 40] });
    return r;
  } catch (e) { toast(e.message, 'error'); return null; }
}

async function getDirections() {
  if (!state.dest) return toast('Search for a destination and select it first.', 'info');
  if (!state.origin) { toast('Set a starting point: use your location or search for one.', 'info'); return $('tvOrigin').focus(); }
  const panel = $('tvRoutePanel');
  panel.hidden = false;
  $('tvRouteSummary').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Calculating route...';
  const r = await drawRoute([state.origin, state.dest], state.mode);
  state.routeShown = !!r;
  $('tvRouteSummary').innerHTML = r
    ? `<div><small>Distance</small><strong>${fmtDist(r.distance_m)}</strong></div><div><small>Estimated time ${MODES[state.mode]}</small><strong>${fmtTime(r.duration_s)}</strong></div>
       <p class="tv-note">Approximate, from OpenStreetMap routing. Traffic, stops and road conditions are not included.</p>`
    : '<p class="tv-note tv-err">We could not calculate this route. Try another travel mode or a different starting point.</p>';
}

/* ---------------- trip planner ---------------- */
function loadTrip() { try { state.trip = JSON.parse(localStorage.getItem('tv_trip')) || []; } catch { state.trip = []; } }
function saveTrip() {
  try { localStorage.setItem('tv_trip', JSON.stringify(state.trip)); } catch { /* ignore */ }
  ctx.set({ trip: state.trip.map(s => ({ name: s.name, lat: round(s.lat, 4), lon: round(s.lon, 4) })) });
}

function addToTrip(p) {
  if (state.trip.some(s => Math.abs(s.lat - p.lat) < 1e-4 && Math.abs(s.lon - p.lon) < 1e-4)) return toast(`${p.name} is already in your trip.`, 'info');
  if (state.trip.length >= 20) return toast('A trip can have up to 20 stops.', 'info');
  state.trip.push({ id: p.id || `${p.lat},${p.lon}`, name: p.name, lat: p.lat, lon: p.lon });
  tripChanged();
  toast(`${p.name} added to My Trip.`, 'success');
}

function tripChanged() { state.tripLegs = null; saveTrip(); renderTrip(); }

function renderTrip() {
  const list = $('tvTripList'), n = state.trip.length;
  $('tvTripCount').textContent = n;
  $('tvTripSummary').hidden = true;
  list.innerHTML = n ? state.trip.map((s, i) => `
    <li data-i="${i}"><span class="tv-num">${i + 1}</span>
      <span class="tv-trip-name">${esc(s.name)}${state.tripLegs?.[i - 1] ? `<small>${fmtDist(state.tripLegs[i - 1].distance_m)} - ${fmtTime(state.tripLegs[i - 1].duration_s)} from previous stop</small>` : ''}</span>
      <span class="tv-trip-btns"><button data-mv="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-up"></i></button>
      <button data-mv="1" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-down"></i></button>
      <button data-rm aria-label="Remove ${esc(s.name)}"><i class="fa-solid fa-xmark"></i></button></span></li>`).join('')
    : '<li class="tv-res-msg">No stops yet. Search a place and choose "Add to Trip".</li>';
  $('tvTripRoute').disabled = n < 2;
  $('tvTripClear').disabled = n === 0;
  tripLayer.clearLayers();
  state.trip.forEach((s, i) => L.marker([s.lat, s.lon], { icon: pin('tv-pin--trip', `<b>${i + 1}</b>`) }).addTo(tripLayer).bindPopup(`<strong>${i + 1}. ${esc(s.name)}</strong>`));
}

async function showTripRoute() {
  if (state.trip.length < 2) return toast('Add at least two stops to see a route.', 'info');
  const btn = $('tvTripRoute'), html = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Routing...';
  $('tvRoutePanel').hidden = true;
  const r = await drawRoute(state.trip, 'driving');
  btn.innerHTML = html; btn.disabled = false;
  if (!r) return;
  state.tripLegs = r.legs;
  renderTrip();
  const s = $('tvTripSummary');
  s.hidden = false;
  s.innerHTML = `<div><small>Total distance</small><strong>${fmtDist(r.distance_m)}</strong></div><div><small>Total driving time</small><strong>${fmtTime(r.duration_s)}</strong></div>
    <p class="tv-note">Approximate driving estimate, excluding stops and traffic.</p>`;
}

/* ---------------- boot ---------------- */
function checkServer() {
  const bar = $('tvStatus');
  ping().then(r => { if (!r.fetch) throw new Error('Node.js 18 or newer is required. Run "node -v" and update Node.'); })
    .catch(e => {
      bar.hidden = false;
      bar.innerHTML = `<strong>Map services are not reachable.</strong> ${esc(e.message)}<br>Fix: open a terminal in the <code>backend</code> folder, stop any old server (Ctrl+C), run <code>npm start</code>, then open <code>http://localhost:5124/map.html</code>.`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
  checkServer();
  if (!initMap()) return;
  loadTrip(); renderTrip();
  attachSearch($('tvSearch'), $('tvResults'), selectDestination);
  attachSearch($('tvOrigin'), $('tvOriginResults'), p => {
    setOrigin({ lat: p.lat, lon: p.lon, name: p.name, label: p.label });
    showOrigin(p.name, p.lat, p.lon);
  });
  $('tvLocate').addEventListener('click', locate);
  $('tvFs').addEventListener('click', () => toggleFs());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleFs(false); });
  $('tvPlaceCard').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || !state.dest) return;
    ({ dir: getDirections, add: () => addToTrip(state.dest), fly: () => map.flyTo([state.dest.lat, state.dest.lon], 14), nearby: () => loadNearby(state.dest) })[b.dataset.act]();
  });
  $('tvModes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    state.mode = b.dataset.mode;
    $('tvModes').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    getDirections();
  });
  $('tvTripList').addEventListener('click', e => {
    const li = e.target.closest('li[data-i]'), b = e.target.closest('button');
    if (!li || !b) return;
    const i = +li.dataset.i;
    if (b.hasAttribute('data-rm')) state.trip.splice(i, 1);
    else { const j = i + +b.dataset.mv; if (j < 0 || j >= state.trip.length) return; [state.trip[i], state.trip[j]] = [state.trip[j], state.trip[i]]; }
    tripChanged();
  });
  $('tvTripRoute').addEventListener('click', showTripRoute);
  $('tvTripClear').addEventListener('click', () => { state.trip = []; routeLayer.clearLayers(); tripChanged(); });
  window.addEventListener('offline', () => toast('You are offline. Map tiles and search need an internet connection.', 'error'));

  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    $('tvSearch').value = q;
    searchPlaces(q).then(r => r.length ? selectDestination(r[0]) : toast(`No place found for "${q}".`, 'info')).catch(e => toast(e.message, 'error'));
  }
});
