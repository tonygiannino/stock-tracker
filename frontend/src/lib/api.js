// In dev, VITE_API_BASE is empty so Vite's proxy handles /api/* → localhost:5001
// In prod, set VITE_API_BASE to your Railway backend URL (no trailing slash)
// e.g. https://stock-tracker-backend.up.railway.app
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
