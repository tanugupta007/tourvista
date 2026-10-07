import { fetchPackageById } from "./services/api.js";
import { db, collection, addDoc } from "./services/firebase-config.js";

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const packageId = urlParams.get("id") || "chambal-safari-1";

  await loadPackageData(packageId);

  const dateInput = document.getElementById("bookingDate");
  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

  const bookingForm = document.getElementById("bookingForm");
  if (bookingForm) {
    bookingForm.addEventListener("submit", (e) => handleBooking(e, packageId));
  }
});

let currentPackage = null;

/**
 * Load Package Details & Map Preview
 */
async function loadPackageData(id) {
  const skeleton = document.getElementById("packageDetailSkeleton");
  const container = document.getElementById("packageDetailContainer");

  try {
    const pkg = await fetchPackageById(id);
    currentPackage = pkg;

    if (!pkg) {
      if (skeleton) skeleton.innerHTML = `<p style="color: red;">Package details not found.</p>`;
      return;
    }

    // Populate Fields
    const put = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    put("pkgTitle", pkg.title);
    const image = document.getElementById("pkgDetailImg");
    if (image) { image.src = pkg.image || ""; image.alt = pkg.title || "Tour package"; }
    put("pkgCategoryBadge", pkg.category || "Tour package");
    put("pkgDuration", pkg.duration || "");
    put("pkgLocation", pkg.location || "");
    put("pkgRating", pkg.rating || "4.8");
    put("pkgPrice", `₹${Number(pkg.price || 0).toLocaleString("en-IN")}`);
    put("pkgDescription", pkg.description || "");

    // Render Highlights
    const highlightsList = document.getElementById("pkgHighlights");
    highlightsList.innerHTML = "";
    if (pkg.highlights && pkg.highlights.length > 0) {
      pkg.highlights.forEach((item) => {
        const li = document.createElement("li");
        li.style.cssText = "display: flex; align-items: center; gap: 10px; font-size: 0.95rem; color: var(--text-main);";
        li.textContent = item;
        highlightsList.appendChild(li);
      });
    }

    // Initialize Leaflet Mini Map
    if (Number.isFinite(Number(pkg.lat)) && Number.isFinite(Number(pkg.lng))) {
      initMiniMap(pkg.lat, pkg.lng, pkg.title);
    }

    // Display Content
    if (skeleton) skeleton.style.display = "none";
    if (container) container.style.display = "grid";

  } catch (error) {
    console.error("Error displaying package details:", error);
    if (skeleton) skeleton.innerHTML = `<p style="color: red;">Failed to load package details.</p>`;
  }
}

/**
 * Leaflet Mini Map Initializer
 */
function initMiniMap(lat, lng, title) {
  const mapElement = document.getElementById("pkgMapPreview");
  if (!mapElement) return;

  const map = L.map("pkgMapPreview", {
    center: [lat, lng],
    zoom: 12,
    zoomControl: false
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  L.marker([lat, lng])
    .addTo(map)
    .bindPopup(`<b>${title}</b>`)
    .openPopup();
}

/**
 * Handle Booking Form Submission
 */
async function handleBooking(e, packageId) {
  e.preventDefault();

  const date = document.getElementById("bookingDate")?.value;
  const guests = Number(document.getElementById("bookingGuests")?.value || 1);
  const userName = document.getElementById("bookingName")?.value.trim();
  const email = document.getElementById("bookingEmail")?.value.trim();
  const alertBox = document.getElementById("bookingAlert");
  const submitBtn = document.getElementById("confirmBookingBtn");

  if (!date || date < new Date().toISOString().slice(0, 10) || !Number.isInteger(guests) || guests < 1 || !currentPackage) {
    showBookingAlert("Please select a valid travel date.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...`;

  const bookingData = {
    packageId,
    packageTitle: currentPackage.title,
    date,
    travelDate: date,
    travelers: guests,
    userName,
    userEmail: email,
    totalAmount: Number(currentPackage.price || 0) * guests,
    bookedAt: new Date().toISOString(),
    status: "Pending",
    paymentStatus: "Not paid"
  };

  try {
    await addDoc(collection(db, "bookings"), bookingData);
    showBookingAlert("Booking request saved. No payment was taken. Redirecting to My Bookings...", "success");

    setTimeout(() => {
      window.location.href = "bookings.html";
    }, 1500);

  } catch (err) {
    console.warn("Firestore save failed, persisting locally in localStorage:", err);
    
    // Offline Fallback
    const localBookings = JSON.parse(localStorage.getItem("tourvista_bookings") || "[]");
    localBookings.push(bookingData);
    localStorage.setItem("tourvista_bookings", JSON.stringify(localBookings));

    showBookingAlert("Booking request saved on this device. No payment was taken. Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "bookings.html";
    }, 1500);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> Book Package Now`;
  }
}

function showBookingAlert(msg, type) {
  const alertBox = document.getElementById("bookingAlert");
  if (!alertBox) return;

  alertBox.style.display = "block";
  if (type === "success") {
    alertBox.style.background = "rgba(16, 185, 129, 0.15)";
    alertBox.style.color = "#065F46";
    alertBox.style.border = "1px solid #10B981";
  } else {
    alertBox.style.background = "rgba(239, 68, 68, 0.15)";
    alertBox.style.color = "#991B1B";
    alertBox.style.border = "1px solid #EF4444";
  }
  alertBox.innerText = msg;
}
