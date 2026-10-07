/**
 * TourVista – location, routing and AI proxy.
 * Every third-party provider is configured in .env, so any of them can be swapped
 * (self-hosted Nominatim/OSRM, Photon, OpenRouteService, Groq, Ollama, ...) without touching the frontend.
 * Requires Node 18+ (global fetch). No extra npm packages.
 */
const express = require('express');
const router = express.Router();

const UA = process.env.GEO_USER_AGENT || 'TourVista/1.0 (set GEO_USER_AGENT in backend/.env)';
const NOMINATIM = (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const ROUTERS = {
  driving: process.env.ROUTE_URL_DRIVING || 'https://router.project-osrm.org/route/v1/driving',
  walking: process.env.ROUTE_URL_WALKING || 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
  cycling: process.env.ROUTE_URL_CYCLING || 'https://routing.openstreetmap.de/routed-bike/route/v1/driving'
};

/* ---------- helpers: cache, rate limit, upstream calls ---------- */
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

const hits = new Map();
const limit = (name, max) => (req, res, next) => {
  const key = `${name}:${req.ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < 60000);
  if (recent.length >= max) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  recent.push(now);
  hits.set(key, recent);
  next();
};

async function getJSON(url, opts = {}, timeoutMs = 15000) {
  const r = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

// Nominatim usage policy: max 1 request/second, so calls are queued.
let nominatimQueue = Promise.resolve();
function nominatim(path) {
  const run = nominatimQueue.then(() => getJSON(NOMINATIM + path));
  nominatimQueue = run.catch(() => {}).then(() => new Promise(r => setTimeout(r, 1100)));
  return run;
}

const num = v => (v === undefined || v === '' ? NaN : Number(v));
const validLat = v => Number.isFinite(v) && v >= -90 && v <= 90;
const validLon = v => Number.isFinite(v) && v >= -180 && v <= 180;

function haversineKm(a, b, c, d) {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(c - a), dLon = rad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- fallback geocoder (Photon, also OpenStreetMap data) ---------- */
const PHOTON = (process.env.PHOTON_URL || 'https://photon.komoot.io').replace(/\/$/, '');
const uniq = a => a.filter((v, i) => v && a.indexOf(v) === i);
const photonLabel = p => uniq([p.name || p.street, p.district || p.city || p.county, p.state, p.country]).join(', ');

async function nominatimSearch(q) {
  const data = await nominatim(`/search?format=jsonv2&addressdetails=1&extratags=1&limit=6&countrycodes=in&accept-language=en&q=${encodeURIComponent(q)}`);
  return data.map(d => ({
    id: `${d.osm_type}${d.osm_id}`,
    name: d.name || String(d.display_name).split(',')[0],
    label: d.display_name,
    lat: Number(d.lat), lon: Number(d.lon),
    category: d.category, type: d.type,
    extra: { opening_hours: d.extratags?.opening_hours, fee: d.extratags?.fee, wikipedia: d.extratags?.wikipedia, website: d.extratags?.website }
  }));
}
async function photonSearch(q) {
  const d = await getJSON(`${PHOTON}/api/?limit=8&lang=en&lat=22.5&lon=79&q=${encodeURIComponent(q)}`);
  return (d.features || []).filter(f => f.properties.countrycode === 'IN').slice(0, 6).map(f => {
    const p = f.properties;
    return { id: `${p.osm_type}${p.osm_id}`, name: p.name || p.street || q, label: photonLabel(p), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], category: p.osm_key, type: p.osm_value, extra: {} };
  });
}

/* ---------- GET /api/geo/ping (lets the map page show a clear status) ---------- */
router.get('/geo/ping', (req, res) => res.json({ ok: true, fetch: typeof fetch === 'function', ai: !!process.env.AI_API_KEY || /localhost|127\.0\.0\.1/.test(process.env.AI_BASE_URL || '') }));

/* ---------- GET /api/geo/search?q=Taj Mahal ---------- */
router.get('/geo/search', limit('search', 30), async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.status(400).json({ error: 'Please type at least 2 characters to search.' });
  try {
    const results = await cached('s:' + q.toLowerCase(), 3600e3, async () => {
      try { return await nominatimSearch(q); }
      catch (e) { console.error('[geo] Nominatim search failed, trying Photon:', e.message); return photonSearch(q); }
    });
    res.json(results);
  } catch (e) {
    console.error('[geo] search failed:', e.message);
    res.status(502).json({ error: 'Place search is temporarily unavailable. Please check your internet connection and try again.' });
  }
});

/* ---------- GET /api/geo/reverse?lat=..&lon=.. ---------- */
router.get('/geo/reverse', limit('reverse', 20), async (req, res) => {
  const lat = num(req.query.lat), lon = num(req.query.lon);
  if (!validLat(lat) || !validLon(lon)) return res.status(400).json({ error: 'Invalid coordinates.' });
  try {
    const key = `r:${lat.toFixed(3)},${lon.toFixed(3)}`; // rounded, short-lived cache only
    const out = await cached(key, 6 * 3600e3, async () => {
      try {
        const d = await nominatim(`/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=en&lat=${lat}&lon=${lon}`);
        const a = d.address || {};
        const parts = uniq([a.city || a.town || a.village || a.suburb || a.county || a.state_district, a.state, a.country]);
        return { label: parts.length ? parts.join(', ') : d.display_name || 'Unknown location', full: d.display_name || '' };
      } catch (e) {
        console.error('[geo] Nominatim reverse failed, trying Photon:', e.message);
        const d = await getJSON(`${PHOTON}/reverse?lang=en&lat=${lat}&lon=${lon}`);
        const p = d.features?.[0]?.properties;
        if (!p) throw new Error('no result');
        return { label: uniq([p.city || p.district || p.county || p.name, p.state, p.country]).join(', '), full: photonLabel(p) };
      }
    });
    res.json(out);
  } catch (e) {
    console.error('[geo] reverse failed:', e.message);
    res.status(502).json({ error: 'Could not read the address for this location.' });
  }
});

/* ---------- GET /api/geo/nearby?lat=..&lon=..&radius=10000 (Overpass / OpenStreetMap) ---------- */
router.get('/geo/nearby', limit('nearby', 15), async (req, res) => {
  const lat = num(req.query.lat), lon = num(req.query.lon);
  const radius = Math.min(Math.max(num(req.query.radius) || 10000, 1000), 25000);
  if (!validLat(lat) || !validLon(lon)) return res.status(400).json({ error: 'Invalid coordinates.' });
  const query = `[out:json][timeout:20];(
    nwr(around:${radius},${lat},${lon})["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|gallery)$"]["name"];
    nwr(around:${radius},${lat},${lon})["historic"~"^(fort|castle|monument|palace|archaeological_site|ruins|temple|memorial)$"]["name"];
  );out center 60;`;
  try {
    const places = await cached(`n:${lat.toFixed(2)},${lon.toFixed(2)},${radius}`, 3600e3, async () => {
      const post = url => getJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      }, 25000);
      const data = await post(OVERPASS).catch(() => post('https://overpass.kumi.systems/api/interpreter'));
      const seen = new Set();
      return (data.elements || [])
        .map(e => {
          const pLat = e.lat ?? e.center?.lat, pLon = e.lon ?? e.center?.lon;
          const t = e.tags || {};
          return pLat === undefined ? null : {
            name: t['name:en'] || t.name,
            lat: pLat, lon: pLon,
            kind: (t.tourism || t.historic || 'attraction').replace(/_/g, ' '),
            distance_km: Number(haversineKm(lat, lon, pLat, pLon).toFixed(1))
          };
        })
        .filter(p => p && p.name && !seen.has(p.name) && seen.add(p.name))
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, 12);
    });
    res.json(places);
  } catch (e) {
    console.error('[geo] nearby failed:', e.message);
    res.status(502).json({ error: 'Nearby attractions are temporarily unavailable.' });
  }
});

/* ---------- GET /api/route?mode=driving&coords=lon,lat;lon,lat ---------- */
router.get('/route', limit('route', 30), async (req, res) => {
  const base = ROUTERS[req.query.mode || 'driving'];
  const coords = String(req.query.coords || '');
  const pairs = coords.split(';');
  const ok = base && pairs.length >= 2 && pairs.length <= 25 &&
    pairs.every(p => /^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/.test(p));
  if (!ok) return res.status(400).json({ error: 'Invalid route request.' });
  try {
    const data = await cached(`rt:${req.query.mode}:${coords}`, 600e3, () =>
      getJSON(`${base}/${coords}?overview=full&geometries=geojson&steps=false`));
    const route = data.routes && data.routes[0];
    if (data.code !== 'Ok' || !route) return res.status(404).json({ error: 'No route could be found between these places for this travel mode.' });
    res.json({
      distance_m: route.distance,
      duration_s: route.duration,
      geometry: route.geometry,
      legs: route.legs.map(l => ({ distance_m: l.distance, duration_s: l.duration }))
    });
  } catch (e) {
    console.error('[geo] route failed:', e.message);
    res.status(502).json({ error: 'The routing service is not responding. Please try again shortly.' });
  }
});

/* ---------- POST /api/ai/chat  (OpenAI-compatible provider: Groq, OpenRouter, Ollama, ...) ---------- */
const SYSTEM_PROMPT = `You are TourVista AI, a friendly travel assistant for tourists in India.
Rules:
- Use ONLY the coordinates, user location and nearby places given in CONTEXT. Never invent coordinates. If CONTEXT has no user location or nearby list but the question needs it, say so and ask the user to use the map's location button or name a place.
- You have no live data. Never state exact prices, availability, opening hours or ticket fees as facts. Give rounded ranges in INR labelled "(approx.)" and tell the user to verify before booking.
- For itineraries use "Day N" headings with Morning / Afternoon / Evening, food ideas and travel suggestions. If the user gives a budget, end with an approximate budget split: Transport, Hotel, Food, Entry tickets, Miscellaneous, and say whether it fits.
- Be concise. Use short lists, not tables. Match the user's trip type (family, couple, solo, weekend).`;

router.post('/ai/chat', limit('ai', 12), async (req, res) => {
  const base = (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'openai/gpt-oss-20b';
  const key = process.env.AI_API_KEY;
  const isLocal = /localhost|127\.0\.0\.1/.test(base);
  if (!key && !isLocal) {
    return res.status(503).json({ error: 'The AI assistant is not configured yet. Add AI_API_KEY to backend/.env (see .env.example).' });
  }
  const messages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
    .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Please type a question for the assistant.' });
  }
  const context = JSON.stringify(req.body?.context || {}).slice(0, 6000);
  try {
    const data = await getJSON(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model, temperature: 0.5, max_tokens: 1100,
        messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXT (JSON): ${context}` }, ...messages]
      })
    }, 60000);
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('empty');
    res.json({ reply });
  } catch {
    res.status(502).json({ error: 'TourVista AI is unavailable right now. Please try again in a moment.' });
  }
});

module.exports = router;
