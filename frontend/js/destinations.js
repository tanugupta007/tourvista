import { fetchDestinations } from "./services/api.js";
import { searchPlaces, debounce, esc } from "./services/geo.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80";
const FALLBACK_DESTINATIONS = [
  { id: "mitawali-1", name: "Mitawali Chausath Yogini Temple", category: "heritage", location: "Morena, MP", rating: 4.9, price: 3499, image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80", description: "A remarkable circular hilltop temple with panoramic views and distinctive ancient architecture." },
  { id: "padavali-1", name: "Bateshwar & Padavali Temples", category: "heritage", location: "Morena, MP", rating: 4.8, price: 3999, image: "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=900&q=80", description: "Explore a historic sandstone temple complex and the intricate craftsmanship of central India." },
  { id: "chambal-safari-1", name: "National Chambal Sanctuary", category: "wildlife", location: "Morena Border", rating: 4.7, price: 4999, image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=900&q=80", description: "Cruise the quiet river habitat of gharials, Gangetic dolphins, and migratory birds." },
  { id: "goa-03", name: "Goa Coastal Escape", category: "beach", location: "Canacona, Goa", rating: 4.8, price: 8999, image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80", description: "Unwind on palm-lined beaches, explore the coastline, and catch a sunset over the Arabian Sea." },
  { id: "manali-04", name: "Manali & Solang Valley", category: "adventure", location: "Manali, Himachal Pradesh", rating: 4.9, price: 12500, image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80", description: "Mountain scenery, alpine trails, and seasonal adventures in the Himalayas." },
  { id: "gwalior-05", name: "Gwalior Fort & Jai Vilas Palace", category: "heritage", location: "Gwalior, Madhya Pradesh", rating: 4.8, price: 5499, image: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=900&q=80", description: "Discover hilltop fortifications, historic palaces, and the layered heritage of Gwalior." }
];

const normalizeDestination = (destination, index = 0) => {
  const title = destination.title || destination.name || `Destination ${index + 1}`;
  const rawCategory = (destination.category || "heritage").toLowerCase();
  const category = rawCategory.includes("wildlife") ? "wildlife"
    : rawCategory.includes("beach") ? "beach"
      : rawCategory.includes("adventure") || rawCategory.includes("mountain") ? "adventure"
        : "heritage";
  const location = destination.location || "India";
  const description = destination.description || "Explore a breathtaking destination curated for your next memorable trip.";
  const rating = Number(destination.rating || 4.8);
  const image = destination.image || destination.images?.[0] || FALLBACK_IMAGE;
  const price = Number(destination.price || 3499 + index * 800);

  return {
    ...destination,
    id: destination.id || `destination-${index + 1}`,
    title,
    category,
    location,
    description,
    rating,
    image,
    price
  };
};

const searchIndia = debounce(async (text) => {
  const box = document.getElementById("indiaSearchResults");
  if (!box) return;
  const q = text.trim();
  if (q.length < 3) { box.innerHTML = ""; return; }
  box.innerHTML = `<p style="color: var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching places across India...</p>`;
  try {
    const places = await searchPlaces(q);
    box.innerHTML = places.length
      ? `<h3 style="font-family: var(--font-heading); margin-bottom: 14px; color: var(--text-main);">Places across India matching "${esc(q)}"</h3>
         <div style="display: grid; gap: 10px;">${places.map(p => `
           <a href="map.html?q=${encodeURIComponent(p.label)}" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-main); text-decoration: none;">
             <span><strong><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> ${esc(p.name)}</strong><br><small style="color: var(--text-muted);">${esc(p.label)}</small></span>
             <span class="btn btn-outline" style="padding: 8px 12px; font-size: 0.8rem; white-space: nowrap;">View on map</span>
           </a>`).join("")}</div>`
      : `<p style="color: var(--text-muted);">No place found for "${esc(q)}". Check the spelling or try a nearby city.</p>`;
  } catch (error) {
    box.innerHTML = `<p style="color: #dc2626;">${esc(error.message)}</p>`;
  }
}, 600);

let allDestinations = [];

document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await loadDestinations();
});

async function loadDestinations() {
  const container = document.getElementById("destinationsContainer");
  if (!container) return;

  try {
    const data = await fetchDestinations();
    allDestinations = Array.isArray(data) ? data.map(normalizeDestination) : [];
  } catch (error) {
    console.warn("Falling back to static destination data:", error);
    allDestinations = FALLBACK_DESTINATIONS.map(normalizeDestination);
  }

  renderDestinations(allDestinations);
}

function renderDestinations(items) {
  const container = document.getElementById("destinationsContainer");
  const countDisplay = document.getElementById("resultsCount");

  if (!container) return;

  if (countDisplay) {
    countDisplay.textContent = `Showing ${items.length} destination${items.length === 1 ? "" : "s"}`;
  }

  if (items.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No TourVista packages match these filters. Try "All Categories", or see places across India below.</div>`;
    return;
  }

  container.innerHTML = items.map(dest => `
    <article class="premium-card" style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.96)); border-radius: 22px; overflow: hidden; border: 1px solid rgba(148,163,184,0.18); box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);">
      <div style="position: relative; height: 210px; overflow: hidden;">
        <img src="${dest.image}" alt="${dest.title}" style="width: 100%; height: 100%; object-fit: cover;">
        <span style="position: absolute; top: 14px; right: 14px; background: rgba(15, 23, 42, 0.7); color: #fff; backdrop-filter: blur(8px); padding: 6px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">
          <i class="fa-solid fa-star" style="color: #FBBF24;"></i> ${Number(dest.rating).toFixed(1)}
        </span>
      </div>
      <div style="padding: 22px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span style="display: inline-flex; background: rgba(37,99,235,0.08); color: var(--primary); padding: 5px 10px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${dest.category}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">From</span>
        </div>
        <h3 style="font-family: var(--font-heading); font-size: 1.2rem; margin: 0 0 8px; color: var(--navy);">${dest.title}</h3>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.6;"><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> ${dest.location}</p>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 18px; min-height: 54px;">${dest.description}</p>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid rgba(148,163,184,0.18); padding-top: 14px;">
          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px;">Estimated</div>
            <div style="font-weight: 800; font-size: 1.15rem; color: var(--navy);">₹${Number(dest.price).toLocaleString("en-IN")}</div>
          </div>
          <a href="destination-details.html?id=${dest.id}" class="btn btn-primary" style="padding: 10px 14px; font-size: 0.82rem; border-radius: 12px;">View Details</a>
        </div>
      </div>
    </article>
  `).join("");
}

function setupEventListeners() {
  const searchInput = document.getElementById("filterSearchInput");
  const categorySelect = document.getElementById("filterCategory");
  const priceRange = document.getElementById("filterPriceRange");
  const priceValue = document.getElementById("priceValue");
  const sortBySelect = document.getElementById("filterSortBy");
  const clearBtn = document.getElementById("clearFiltersBtn");

  const applyFilters = () => {
    const search = searchInput?.value.toLowerCase() || "";
    const category = categorySelect?.value || "all";
    const maxPrice = Number(priceRange?.value) || 20000;
    const sortBy = sortBySelect?.value || "featured";

    if (priceValue && priceRange) {
      priceValue.textContent = Number(priceRange.value).toLocaleString("en-IN");
    }

    let filtered = allDestinations.filter(item => {
      const title = (item.title || "").toLowerCase();
      const location = (item.location || "").toLowerCase();
      const matchesSearch = title.includes(search) || location.includes(search);
      const matchesCategory = category === "all" || item.category === category;
      const matchesPrice = !item.price || item.price <= maxPrice;
      return matchesSearch && matchesCategory && matchesPrice;
    });

    if (sortBy === "price-low") filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sortBy === "price-high") filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sortBy === "rating") filtered.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));

    renderDestinations(filtered);
    searchIndia(searchInput?.value || "");
  };

  searchInput?.addEventListener("input", applyFilters);
  categorySelect?.addEventListener("change", applyFilters);
  priceRange?.addEventListener("input", applyFilters);
  sortBySelect?.addEventListener("change", applyFilters);

  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (categorySelect) categorySelect.value = "all";
    if (priceRange) priceRange.value = "15000";
    if (priceValue) priceValue.textContent = "15,000";
    if (sortBySelect) sortBySelect.value = "featured";
    renderDestinations(allDestinations);
    const box = document.getElementById("indiaSearchResults");
    if (box) box.innerHTML = "";
  });
}