import { defineConfig } from "tsup";
import { rmSync } from "node:fs";

const external = [
  "better-sqlite3",
  "telegraf",
  "discord.js",
  "@whiskeysockets/baileys",
  "express",
];

// Clean dist/ once before both builds
try { rmSync("dist", { recursive: true, force: true }); } catch {}

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    target: "es2022",
    external,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: ["src/runtime.ts"],
    format: ["esm"],
    dts: false,
    target: "es2022",
    external,
  },
]);
