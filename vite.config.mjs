import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/forTianYu/" : "/",
  build: {
    rollupOptions: {
      input: {
        carousel: resolve(import.meta.dirname, "index.html"),
        lottery: resolve(import.meta.dirname, "lottery.html"),
      },
    },
  },
});
