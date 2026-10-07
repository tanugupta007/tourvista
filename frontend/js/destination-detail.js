import { fetchDestinationById } from "./services/api.js";

const FALLBACK_DESTINATIONS = [
  {
    id: "mitawali-1",
    name: "Mitawali Chausath Yogini Temple",
    title: "Mitawali Chausath Yogini Temple",
    category: "heritage",
    location: "Morena, MP",
    rating: 4.9,
    price: 3499,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    description: "A stunning circular temple complex inspired by the classic geometry of ancient Indian architecture, offering panoramic views and spiritual calm.",
    attractions: ["Sunrise photography", "Temple architecture", "Heritage walk", "Local market visit"],
    lat: 26.3762,
    lng: 78.2325
  },
  {
    id: "padavali-1",
    name: "Bateshwar & Padavali Temples",
    title: "Bateshwar & Padavali Temples",
    category: "heritage",
    location: "Morena, MP",
    rating: 4.8,
    price: 3999,
    image: "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1200&q=80",
    description: "A cluster of sandstone shrines tied to the rich history of central India, where every stone tells a story of devotion and craft.",
    attractions: ["Temple complex", "Stone carvings", "Countryside drive", "Heritage narration"],
    lat: 26.3989,
    lng: 78.1884
  },
  {
    id: "chambal-safari-1",
    name: "National Chambal Sanctuary",
    title: "National Chambal Sanctuary",
    category: "wildlife",
    location: "Morena Border",
    rating: 4.7,
    price: 4999,
    image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80",
    description: "A protected river ecosystem where gharials, dolphins, and exotic birds thrive in a beautiful and peaceful environment.",
    attractions: ["Boat safari", "Birdwatching", "Riverbank views", "Eco-tour guide"],
    lat: 26.6854,
    lng: 78.0706
  },
  {
    id: "goa-03",
    name: "Goa Coastal Escape",
    title: "Goa Coastal Escape",
    category: "beach",
    location: "Canacona, Goa",
    rating: 4.8,
    price: 8999,
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    description: "Golden beaches, vibrant nightlife, and breezy coastal views make this an easy favorite for a relaxing tropical holiday.",
    attractions: ["Beach club", "Sunset cruise", "Water sports", "Nightlife tours"],
    lat: 15.2736,
    lng: 74.1237
  }
];

const normalizeDestination = (destination = {}) => {
  const title = destination.title || destination.name || "Tour Destination";
  const category = destination.category || "heritage";
  const location = destination.location || "India";
  const description = destination.description || "Find an unforgettable experience designed for your next getaway.";
  const rating = Number(destination.rating || 4.8);
  const image = destination.image || destination.images?.[0] || "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80";
  const price = Number(destination.price || 3999);
  return {
    ...destination,
    id: destination.id || "destination-1",
    title,
    category: category.toString().toLowerCase(),
    location,
    description,
    rating,
    image,
    price,
    attractions: destination.attractions || destination.highlights || ["Scenic views", "Local experiences", "Memorable stays"]
  };
};

const reviewKey = id => `tourvista_reviews_${id}`;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
function renderReviews(id) {
  const box = document.getElementById("destinationReviews");
  if (!box) return;
  let reviews = [];
  try { reviews = JSON.parse(localStorage.getItem(reviewKey(id)) || "[]"); } catch { reviews = []; }
  box.innerHTML = reviews.length ? reviews.map(review => `
    <article style="padding:14px 0;border-bottom:1px solid var(--border-color);">
      <strong>${escapeHtml(review.name)}</strong> <span aria-label="${Number(review.rating)} out of 5 stars">${"★".repeat(Number(review.rating))}${"☆".repeat(5 - Number(review.rating))}</span>
      <small style="display:block;color:var(--text-muted);">${escapeHtml(new Date(review.date).toLocaleDateString())}</small>
      <p style="margin:8px 0;">${escapeHtml(review.text)}</p>
      ${typeof review.image === "string" && review.image.startsWith("data:image/") ? `<img src="${escapeHtml(review.image)}" alt="Photo shared by ${escapeHtml(review.name)}" loading="lazy" style="max-width:100%;max-height:240px;object-fit:contain;border-radius:10px;">` : ""}
    </article>`).join("") : '<p>No reviews yet. Share your experience.</p>';
}
function setupReviews(id) {
  renderReviews(id);
  document.getElementById("destinationReviewForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const file = document.getElementById("reviewImage")?.files?.[0];
    if (file && (!file.type.startsWith("image/") || file.size > 1024 * 1024)) {
      window.alert("Choose an image smaller than 1 MB.");
      return;
    }
    const save = image => {
      try {
        const key = reviewKey(id);
        const reviews = JSON.parse(localStorage.getItem(key) || "[]");
        reviews.unshift({
          name: document.getElementById("reviewName").value.trim(),
          rating: Number(document.getElementById("reviewRating").value),
          text: document.getElementById("reviewText").value.trim(),
          date: new Date().toISOString(), image
        });
        localStorage.setItem(key, JSON.stringify(reviews.slice(0, 30)));
        event.target.reset();
        renderReviews(id);
      } catch {
        window.alert("This browser could not save the review. Try a smaller photo or clear some local storage.");
      }
    };
    if (!file) return save("");
    const reader = new FileReader();
    reader.onload = () => save(String(reader.result));
    reader.onerror = () => window.alert("The selected photo could not be read.");
    reader.readAsDataURL(file);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const destinationId = urlParams.get("id") || "mitawali-1";
  setupReviews(destinationId);
  await loadDestinationData(destinationId);
});

async function loadDestinationData(id) {
  const skeleton = document.getElementById("destSkeleton");
  const container = document.getElementById("destContainer");

  try {
    let destination = null;
    try {
      destination = await fetchDestinationById(id);
    } catch (error) {
      console.warn("Destination fetch failed, using fallback data:", error);
    }

    if (!destination) {
      destination = FALLBACK_DESTINATIONS.find(item => item.id === id) || FALLBACK_DESTINATIONS[0];
    }

    const dest = normalizeDestination(destination);

    const detailImage = document.getElementById("destDetailImg");
    const categoryBadge = document.getElementById("destCategoryBadge");
    const title = document.getElementById("destTitle");
    const location = document.getElementById("destLocation");
    const rating = document.getElementById("destRating");
    const description = document.getElementById("destDescription");
    const bestTime = document.getElementById("destBestTime");
    const attractionGrid = document.getElementById("destAttractionsGrid");

    if (detailImage) {
      detailImage.src = dest.image;
      detailImage.alt = dest.title;
    }

    if (categoryBadge) categoryBadge.textContent = dest.category;
    if (title) title.textContent = dest.title;
    if (location) location.textContent = dest.location;
    if (rating) rating.textContent = Number(dest.rating).toFixed(1);
    if (description) description.textContent = dest.description;
    if (bestTime) bestTime.textContent = dest.bestTime || "Oct - Mar";

    if (attractionGrid) {
      attractionGrid.innerHTML = (dest.attractions || []).map(item => `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px 18px; color: var(--navy); font-weight: 600; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm);">
          <i class="fa-solid fa-circle-check" style="color: var(--secondary);"></i>
          <span>${item}</span>
        </div>
      `).join("");
    }

    if (dest.lat && dest.lng) {
      initMiniMap(dest.lat, dest.lng, dest.title);
    }

    if (skeleton) skeleton.style.display = "none";
    if (container) container.style.display = "grid";
  } catch (error) {
    console.error("Error loading destination details:", error);
    if (skeleton) skeleton.innerHTML = `<p style="color: red;">Destination details could not be loaded.</p>`;
  }
}

function initMiniMap(lat, lng, title) {
  const mapElement = document.getElementById("destMap");
  if (!mapElement || typeof L === "undefined") return;

  const map = L.map("destMap", {
    center: [lat, lng],
    zoom: 12,
    zoomControl: false
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  L.marker([lat, lng]).addTo(map).bindPopup(`<b>${title}</b>`).openPopup();
}
