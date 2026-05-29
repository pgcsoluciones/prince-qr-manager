import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "https://prince-qr-manager-backend.fliaprince.workers.dev",
    },
  },
});
