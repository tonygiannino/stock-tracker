import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev only: proxy /api to local Flask
    proxy: {
      "/api": "http://localhost:5001",
    },
  },
  preview: {
    // Production: bind to Railway's PORT and all interfaces
    port: parseInt(process.env.PORT) || 4173,
    host: true,
  },
});
