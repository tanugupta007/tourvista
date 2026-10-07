import { fetchPackages } from "./services/api.js";

let allPackages = [];

document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await loadPackages();
});

/**
 * Fetch packages from the API used by the booking details page
 */
async function loadPackages() {
  const container = document.getElementById("packagesContainer");
  if (!container) return;

  try {
    const packages = await fetchPackages();
    allPackages = packages.map(pkg => {
      const duration = pkg.duration || "1 Day";
      return {
        ...pkg,
        daysCount: Number(pkg.daysCount || duration.match(/\d+/)?.[0] || 1),
        price: Number(pkg.price || 0),
        includes: pkg.includes || pkg.highlights || []
      };
    });
  } catch (error) {
    console.error("Could not load tour packages:", error);
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Packages are temporarily unavailable. Please try again shortly.</div>`;
    return;
  }

  renderPackages(allPackages);
}

/**
 * Render Package Cards
 */
function renderPackages(items) {
  const container = document.getElementById("packagesContainer");
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No packages found.</div>`;
    return;
  }

  container.innerHTML = items.map(pkg => `
    <div class="premium-card package-card" style="background: var(--bg-card); border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); display: flex; flex-direction: column;">
      
      <div style="position: relative; height: 200px; overflow: hidden;">
        <img src="${pkg.image}" alt="${pkg.title}" style="width: 100%; height: 100%; object-fit: cover;">
        ${pkg.discountBadge ? `
          <span style="position: absolute; top: 12px; left: 12px; background: #EF4444; color: #FFF; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 700;">
            ${pkg.discountBadge}
          </span>
        ` : ''}
        <span style="position: absolute; bottom: 12px; right: 12px; background: rgba(11,31,58,0.85); color: #FFF; padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600;">
          <i class="fa-solid fa-clock" style="color: var(--primary);"></i> ${pkg.duration}
        </span>
      </div>

      <div style="padding: 20px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <h3 style="font-family: var(--font-heading); font-size: 1.15rem; margin-bottom: 12px; color: var(--text-main);">${pkg.title}</h3>
          
          <ul style="margin-bottom: 20px; font-size: 0.85rem; color: var(--text-muted);">
            ${(pkg.includes || []).map(inc => `<li style="margin-bottom: 5px;"><i class="fa-solid fa-check" style="color: var(--primary); margin-right: 6px;"></i> ${inc}</li>`).join('')}
          </ul>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 15px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            ${pkg.originalPrice ? `<span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85rem;">₹${pkg.originalPrice.toLocaleString()}</span>` : ''}
            <div style="font-weight: 700; font-size: 1.25rem; color: var(--navy);">₹${pkg.price.toLocaleString()} <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-muted);">/ person</span></div>
          </div>
          <a href="package-details.html?id=${pkg.id}" class="btn btn-primary">Book Now</a>
        </div>

      </div>
    </div>
  `).join('');
}

/**
 * Search & Sorting Handlers
 */
function setupEventListeners() {
  const searchInput = document.getElementById("packageSearchInput");
  const durationSelect = document.getElementById("durationFilter");
  const sortSelect = document.getElementById("packageSortBy");

  const filterData = () => {
    const search = searchInput?.value.toLowerCase() || "";
    const duration = durationSelect?.value || "all";
    const sortBy = sortSelect?.value || "popular";

    let filtered = allPackages.filter(pkg => {
      const matchesSearch = pkg.title.toLowerCase().includes(search);
      let matchesDuration = true;

      if (duration === "short") matchesDuration = pkg.daysCount <= 3;
      if (duration === "medium") matchesDuration = pkg.daysCount >= 4 && pkg.daysCount <= 6;
      if (duration === "long") matchesDuration = pkg.daysCount >= 7;

      return matchesSearch && matchesDuration;
    });

    if (sortBy === "price-low") filtered.sort((a, b) => a.price - b.price);
    if (sortBy === "price-high") filtered.sort((a, b) => b.price - a.price);

    renderPackages(filtered);
  };

  searchInput?.addEventListener("input", filterData);
  durationSelect?.addEventListener("change", filterData);
  sortSelect?.addEventListener("change", filterData);
}