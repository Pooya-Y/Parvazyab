import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router"],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    // Same-origin API in development so the session cookie behaves as in production.
    proxy: {
      "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:4000", changeOrigin: true },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
