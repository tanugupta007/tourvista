// TourVista – shared location/AI service layer. The UI only talks to our own /api; providers are configured in backend/.env.
const currentOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : 'http://localhost:5124';
const BASE = window.TOURVISTA_API_BASE || `${currentOrigin}/api`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const debounce = (fn, ms = 500) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const round = (n, d = 3) => Number(Number(n).toFixed(d));
export const fmtDist = m => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`);
export const fmtTime = s => {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

async function api(path, opts = {}) {
  let res;
  try { res = await fetch(BASE + path, opts); }
  catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error(navigator.onLine ? 'Cannot reach the TourVista server. Please make sure the backend is running.' : 'You seem to be offline. Please check your internet connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Something went wrong (${res.status}). Please try again.`);
    error.status = res.status;
    throw error;
  }
  return body;
}
const qs = o => new URLSearchParams(o).toString();
const canUsePublicFallback = error =>
  error.name !== 'AbortError' &&
  navigator.onLine &&
  (!error.status || error.status === 404 || error.status >= 500);

async function publicJSON(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(25000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Public service returned ${response.status}.`);
  return body;
}

export async function ping() {
  try {
    return await api('/geo/ping');
  } catch (error) {
    if (error.status !== 404) throw error;
    await api('/health');
    return { fetch: true };
  }
}
async function searchWithPhoton(text, signal) {
  const url = `https://photon.komoot.io/api/?${qs({ q: text, limit: 8, lang: 'en', lat: 22.5, lon: 79 })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Place search provider returned ${res.status}.`);
  const data = await res.json();
  return (data.features || []).filter(f => f.properties?.countrycode === 'IN').slice(0, 6).map(f => {
    const p = f.properties;
    const name = p.name || p.street || text;
    const parts = [name, p.district || p.city || p.county, p.state, p.country].filter((part, i, all) => part && all.indexOf(part) === i);
    return {
      id: `${p.osm_type || ''}${p.osm_id || ''}`,
      name,
      label: parts.join(', '),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      category: p.osm_key,
      type: p.osm_value,
      extra: {}
    };
  });
}

export async function searchPlaces(text, signal) {
  try {
    const places = await api('/geo/search?' + qs({ q: text }), { signal });
    if (!Array.isArray(places)) throw new Error('Unexpected place search response.');
    return places;
  } catch (error) {
    if (!canUsePublicFallback(error)) throw error;
    try {
      return await searchWithPhoton(text, signal);
    } catch (fallbackError) {
      if (fallbackError.name === 'AbortError') throw fallbackError;
      throw new Error('Place search is temporarily unavailable. Please try again shortly.');
    }
  }
}
export async function reverseGeocode(lat, lon) {
  try {
    return await api('/geo/reverse?' + qs({ lat, lon }));
  } catch (error) {
    if (!canUsePublicFallback(error)) throw error;
    try {
      const data = await publicJSON(`https://photon.komoot.io/reverse/?${qs({ lat, lon, lang: 'en' })}`);
      const p = data.features?.[0]?.properties;
      if (!p) return { label: 'Current location', full: '' };
      const parts = [p.city || p.district || p.county || p.name, p.state, p.country].filter((part, i, all) => part && all.indexOf(part) === i);
      return { label: parts.join(', ') || 'Current location', full: parts.join(', ') };
    } catch (fallbackError) {
      if (fallbackError.name === 'AbortError') throw fallbackError;
      return { label: 'Current location', full: '' };
    }
  }
}

export async function nearbyPlaces(lat, lon, radius = 10000) {
  try {
    return await api('/geo/nearby?' + qs({ lat: round(lat, 3), lon: round(lon, 3), radius }));
  } catch (error) {
    if (!canUsePublicFallback(error)) throw error;
    const searchRadius = Math.min(Math.max(Number(radius) || 10000, 1000), 25000);
    const query = `[out:json][timeout:20];(nwr(around:${searchRadius},${lat},${lon})["tourism"]["name"];nwr(around:${searchRadius},${lat},${lon})["historic"]["name"];);out center 60;`;
    let data;
    try {
      data = await publicJSON('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });
    } catch (primaryError) {
      if (primaryError.name === 'AbortError') throw primaryError;
      try {
        data = await publicJSON('https://overpass.kumi.systems/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`
        });
      } catch (fallbackError) {
        if (fallbackError.name === 'AbortError') throw fallbackError;
        throw new Error('Nearby attractions are temporarily unavailable. Please try again shortly.');
      }
    }
    const distanceKm = (a, b, c, d) => {
      const radians = value => value * Math.PI / 180;
      const dLat = radians(c - a), dLon = radians(d - b);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a)) * Math.cos(radians(c)) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.sqrt(h));
    };
    const seen = new Set();
    return (data.elements || []).map(element => {
      const pLat = element.lat ?? element.center?.lat;
      const pLon = element.lon ?? element.center?.lon;
      const tags = element.tags || {};
      return pLat === undefined || pLon === undefined ? null : {
        name: tags['name:en'] || tags.name,
        lat: pLat,
        lon: pLon,
        kind: (tags.tourism || tags.historic || 'attraction').replace(/_/g, ' '),
        distance_km: Number(distanceKm(lat, lon, pLat, pLon).toFixed(1))
      };
    }).filter(place => place && place.name && !seen.has(place.name) && seen.add(place.name))
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 12);
  }
}

export async function getRoute(points, mode = 'driving') {
  const coords = points.map(p => `${p.lon},${p.lat}`).join(';');
  try {
    return await api('/route?' + qs({ mode, coords }));
  } catch (error) {
    if (!canUsePublicFallback(error)) throw error;
    const profiles = {
      driving: 'https://router.project-osrm.org/route/v1/driving',
      walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
      cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving'
    };
    const base = profiles[mode];
    if (!base) throw error;
    let data;
    try {
      data = await publicJSON(`${base}/${coords}?overview=full&geometries=geojson&steps=false`);
    } catch (fallbackError) {
      if (fallbackError.name === 'AbortError') throw fallbackError;
      throw new Error('The routing service is not responding. Please try another travel mode or starting point.');
    }
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) throw new Error('No route could be found between these places for this travel mode.');
    return {
      distance_m: route.distance,
      duration_s: route.duration,
      geometry: route.geometry,
      legs: route.legs.map(leg => ({ distance_m: leg.distance, duration_s: leg.duration }))
    };
  }
}
export const aiChat = (messages, context) => api('/ai/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, context })
});

export function getPosition() {
  return new Promise((resolve, reject) => {
    const allowedHost = ['localhost', '127.0.0.1'];
    if (!window.isSecureContext && !allowedHost.includes(window.location.hostname)) {
      return reject(new Error('Location only works on https or http://localhost:5124. Open the site at http://localhost:5124/map.html.'));
    }
    if (!navigator.geolocation) return reject(new Error('Your browser does not support location services. Please search for your starting point instead.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      err => reject(new Error(
        err.code === 1 ? 'Location permission was denied. No problem - search for your starting point instead.'
        : err.code === 3 ? 'Finding your location took too long. Please try again or search manually.'
        : 'We could not determine your location. Please search for it manually.')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });
}

// Session-only context shared between the map page and the AI widget (cleared when the tab closes).
export const ctx = {
  get() { try { return JSON.parse(sessionStorage.getItem('tv_ctx')) || {}; } catch { return {}; } },
  set(patch) {
    try { sessionStorage.setItem('tv_ctx', JSON.stringify({ ...ctx.get(), ...patch })); } catch { /* storage unavailable */ }
    window.dispatchEvent(new CustomEvent('tv:ctx'));
  }
};

export function toast(message, type = 'info') {
  let box = document.querySelector('.tv-toasts');
  if (!box) { box = document.createElement('div'); box.className = 'tv-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `tv-toast tv-toast--${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4200);
}
