import { db, collection, getDocs, doc, deleteDoc } from "./services/firebase-config.js";

let userBookings = [];
let currentFilter = "all";
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupModalEvents();
  await loadUserBookings();
});

/**
 * Fetch User Bookings from Firestore or Fallback
 */
async function loadUserBookings() {
  const container = document.getElementById("bookingsList");
  if (!container) return;

  try {
    const querySnapshot = await getDocs(collection(db, "bookings"));
    if (!querySnapshot.empty) {
      userBookings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
      userBookings = [];
    }
  } catch (error) {
    console.warn("Using offline fallback bookings data:", error.message);
    userBookings = [];
  }

  renderBookings();
}

/**
 * Render Booking Cards
 */
function renderBookings() {
  const container = document.getElementById("bookingsList");
  if (!container) return;

  let filtered = userBookings;
  if (currentFilter === "confirmed") {
    filtered = userBookings.filter(b => b.status === "Confirmed");
  } else if (currentFilter === "completed") {
    filtered = userBookings.filter(b => b.status === "Completed");
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <i class="fa-regular fa-folder-open" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 10px;"></i>
        <h3 style="font-size: 1.1rem; color: var(--text-main);">No Bookings Found</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 5px;">You don't have any ${currentFilter !== 'all' ? currentFilter : ''} trip reservations yet.</p>
        <a href="packages.html" class="btn btn-primary" style="margin-top: 15px; display: inline-block;">Browse Packages</a>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(bk => `
    <div style="background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 20px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px;">
      
      <div style="flex: 1; min-width: 280px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <span style="font-size: 0.75rem; background: ${bk.status === 'Confirmed' ? '#10B981' : '#64748B'}; color: #FFF; padding: 2px 10px; border-radius: var(--radius-full); font-weight: 700;">
            ${escapeHtml(bk.status || "Pending")}
          </span>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">Ref: ${escapeHtml(bk.id)}</span>
        </div>

        <h3 style="font-family: var(--font-heading); font-size: 1.15rem; color: var(--text-main); margin-bottom: 10px;">${escapeHtml(bk.packageTitle || bk.packageName || "Tour package")}</h3>

        <div style="display: flex; gap: 20px; font-size: 0.85rem; color: var(--text-muted); flex-wrap: wrap;">
          <span><i class="fa-regular fa-calendar-check" style="color: var(--primary);"></i> Travel Date: <strong>${escapeHtml(bk.travelDate || bk.date || "Not set")}</strong></span>
          <span><i class="fa-solid fa-users" style="color: var(--primary);"></i> Guests: <strong>${bk.travelers || bk.guests || 1} Persons</strong></span>
        </div>
      </div>

      <div style="text-align: right; min-width: 180px;">
        <div style="font-size: 1.3rem; font-weight: 700; color: var(--navy); margin-bottom: 10px;">₹${Number(bk.totalAmount ?? bk.totalPrice ?? 0).toLocaleString("en-IN")}</div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button class="btn btn-outline view-receipt-btn" data-id="${bk.id}" style="padding: 6px 14px; font-size: 0.8rem;">View Receipt</button>
          ${bk.status !== 'Completed' ? `
            <button class="btn cancel-btn" data-id="${bk.id}" style="padding: 6px 14px; font-size: 0.8rem; background: #EF4444; color: #FFF; border: none; border-radius: var(--radius-sm); cursor: pointer;">Cancel</button>
          ` : ''}
        </div>
      </div>

    </div>
  `).join('');

  attachBookingActions();
}

/**
 * Handle Buttons inside Cards
 */
function attachBookingActions() {
  document.querySelectorAll(".view-receipt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const booking = userBookings.find(b => b.id === id);
      if (booking) openReceiptModal(booking);
    });
  });

  document.querySelectorAll(".cancel-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (confirm(`Are you sure you want to cancel booking ${id}?`)) {
        await cancelBooking(id);
      }
    });
  });
}

/**
 * Cancel Booking Handler
 */
async function cancelBooking(bookingId) {
  try {
    await deleteDoc(doc(db, "bookings", bookingId));
  } catch (err) {
    console.warn("Offline cancel simulation:", err.message);
  }

  userBookings = userBookings.filter(b => b.id !== bookingId);
  renderBookings();
}

/**
 * Receipt Modal Logic
 */
function openReceiptModal(bk) {
  const modal = document.getElementById("receiptModal");
  const content = document.getElementById("receiptContent");
  if (!modal || !content) return;

  content.innerHTML = `
    <div style="text-align: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 15px; margin-bottom: 15px;">
      <h3 style="font-family: var(--font-heading); color: var(--navy); font-size: 1.3rem;">TourVista Travel Receipt</h3>
      <p style="font-size: 0.8rem; color: var(--text-muted);">Booking Reference ID: <strong>${escapeHtml(bk.id)}</strong></p>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Lead Traveler:</span>
          <strong style="color: var(--text-main);">${escapeHtml(bk.userName || "Guest")}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Email Address:</span>
        <strong style="color: var(--text-main);">${escapeHtml(bk.userEmail)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Tour Package:</span>
          <strong style="color: var(--text-main); text-align: right; max-width: 250px;">${escapeHtml(bk.packageTitle || bk.packageName || "Tour package")}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Scheduled Date:</span>
        <strong style="color: var(--text-main);">${escapeHtml(bk.travelDate || bk.date || "Not set")}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">No. of Travelers:</span>
        <strong style="color: var(--text-main);">${bk.travelers || bk.guests || 1} Person(s)</strong>
      </div>
    </div>

    <div style="background: var(--bg-light); padding: 12px; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <span style="font-weight: 600; color: var(--text-main);">Estimated total (unpaid):</span>
      <span style="font-weight: 700; font-size: 1.2rem; color: var(--primary);">₹${Number(bk.totalAmount ?? bk.totalPrice ?? 0).toLocaleString("en-IN")}</span>
    </div>

    <button onclick="window.print()" class="btn btn-primary" style="width: 100%; justify-content: center;">
      <i class="fa-solid fa-print"></i> Print Receipt
    </button>
  `;

  modal.style.display = "flex";
}

function setupModalEvents() {
  const closeModalBtn = document.getElementById("closeModalBtn");
  const modal = document.getElementById("receiptModal");

  closeModalBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll(".booking-tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => {
        t.style.background = "var(--bg-light)";
        t.style.color = "var(--text-main)";
        t.style.borderColor = "var(--border-color)";
      });

      tab.style.background = "var(--primary)";
      tab.style.color = "#FFF";
      tab.style.borderColor = "var(--primary)";

      currentFilter = tab.getAttribute("data-tab");
      renderBookings();
    });
  });
}
