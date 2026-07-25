import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        main: "src/electron/main.ts",
        preload: "src/electron/preload.ts",
      },
      formats: ["cjs"],
      fileName: (_format, entryName) => `${entryName}.cjs`,
    },
    outDir: "dist-electron",
    rollupOptions: {
      external: [
        "electron",
        "node:crypto",
        "node:fs",
        "node:module",
        "node:os",
        "node:path",
        "node:process",
        "node:url",
        "node:buffer",
        "smol-toml",
        "snowflake-sdk",
      ],
    },
  },
});
