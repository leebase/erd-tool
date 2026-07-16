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
        "node:os",
        "node:path",
        "node:url",
        "smol-toml",
        "snowflake-sdk",
      ],
    },
  },
});
