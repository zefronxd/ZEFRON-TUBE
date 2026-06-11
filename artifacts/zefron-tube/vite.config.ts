import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// import.meta.dirname is only available in Node.js 21.2+; Vercel runs Node 20.
// Use fileURLToPath as the universal ESM equivalent of __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PORT is only needed for the dev/preview server, not for `vite build`.
const rawPort = process.env.PORT;
const port = rawPort && Number(rawPort) > 0 ? Number(rawPort) : 5173;

// BASE_PATH controls Vite's `base` option. Defaults to "/" for Vercel/production.
const basePath = process.env.BASE_PATH ?? "/";

// Output to repo-root dist/ so Vercel's Project Setting "Output Directory: dist"
// resolves correctly. outDir is absolute so pnpm CWD changes don't affect it.
const outDir = path.resolve(__dirname, "../../dist");

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(__dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@assets": path.resolve(__dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname),
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
