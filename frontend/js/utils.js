export function formatCurrency(value, currency = 'INR') {
  const numericValue = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(numericValue);
}

export function safeText(value) {
  return String(value ?? '').trim();
}

export function getStoredTheme() {
  try {
    return localStorage.getItem('tourvista_theme') || 'light';
  } catch (error) {
    return 'light';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  if (!root.getAttribute('data-theme')) {
    root.setAttribute('data-theme', getStoredTheme());
  }
});
