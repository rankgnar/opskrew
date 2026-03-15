import { defineConfig } from "tsup";

const external = [
  "better-sqlite3",
  "telegraf",
  "discord.js",
  "@whiskeysockets/baileys",
  "express",
];

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    clean: true,
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
