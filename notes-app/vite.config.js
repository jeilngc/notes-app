import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Notes",
        short_name: "Notes",
        description: "A private, password-protected notes app.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0A0A0F",
        theme_color: "#0A0A0F",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Never let the service worker cache API responses — notes must
        // always come from the network so the password gate and sync stay correct.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly"
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      // During `vite dev`, forward /api to `wrangler dev` running on 8787
      "/api": { target: "https://127.0.0.1:8787", secure: false }
    }
  }
});
