const currentOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : 'http://localhost:5124';
const LOCAL_API_BASES = [
  `${currentOrigin}/api`,
  'http://localhost:5124/api',
  'http://127.0.0.1:5124/api',
  'http://localhost:5000/api',
  'http://127.0.0.1:5000/api'
];
const API_BASES = [...new Set(LOCAL_API_BASES.filter(Boolean))];

async function request(endpoint) {
  let lastError;

  for (const base of API_BASES) {
    const url = `${base}${endpoint}`;
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`Request failed: ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Request failed for ${endpoint}`);
}

export async function fetchDestinations() {
  return request('/destinations');
}

export async function fetchPackages() {
  return request('/packages');
}

export async function fetchPackageById(id) {
  return request(`/packages/${id}`);
}

export async function fetchDestinationById(id) {
  return request(`/destinations/${id}`);
}
