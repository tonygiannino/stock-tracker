// In dev, VITE_API_BASE is empty so Vite's proxy handles /api/* → localhost:5001
// In prod, set VITE_API_BASE to your Railway backend URL (no trailing slash)
// e.g. https://stock-tracker-backend.up.railway.app
import { useAuth } from "@clerk/clerk-react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

// Hook that returns a fetch wrapper pre-loaded with the Clerk JWT
export function useAuthFetch() {
  const { getToken } = useAuth();

  return async function authFetch(url, options = {}) {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  };
}
