import { fetchDestinations, fetchPackages } from "./services/api.js";

document.addEventListener("DOMContentLoaded", async () => {
  initThemeToggle();
  await loadPlatformStats();
});

/**
 * Initialize Light / Dark Theme Switcher
 */
function initThemeToggle() {
  const toggleBtn = document.getElementById("themeToggleBtn");
  if (!toggleBtn) return;

  const currentTheme = localStorage.getItem("tourvista_theme") || "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeIcon(toggleBtn, currentTheme);

  toggleBtn.addEventListener("click", () => {
    const activeTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = activeTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("tourvista_theme", newTheme);
    updateThemeIcon(toggleBtn, newTheme);
  });
}

function updateThemeIcon(btn, theme) {
  const icon = btn.querySelector("i");
  if (!icon) return;
  if (theme === "dark") {
    icon.className = "fa-solid fa-sun";
  } else {
    icon.className = "fa-solid fa-moon";
  }
}

/**
 * Dynamically Update Metrics Counter from API Data
 */
async function loadPlatformStats() {
  try {
    const destinations = await fetchDestinations();
    const packages = await fetchPackages();

    const destStat = document.getElementById("statDestinations");
    const pkgStat = document.getElementById("statPackages");

    if (destStat && destinations.length > 0) {
      destStat.innerText = `${destinations.length}+`;
    }

    if (pkgStat && packages.length > 0) {
      pkgStat.innerText = `${packages.length}+`;
    }
  } catch (err) {
    console.warn("Could not load dynamic stats for about page, falling back to static defaults.", err);
  }
}