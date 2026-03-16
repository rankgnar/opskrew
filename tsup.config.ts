import { defineConfig } from "tsup";

const external = [
  "better-sqlite3",
  "telegraf",
  "discord.js",
  "@whiskeysockets/baileys",
  "express",
];

export default defineConfig({
  entry: ["src/index.ts", "src/runtime.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "es2022",
  external,
  banner: (ctx) => {
    // Only add shebang to the CLI entry
    if (ctx.entryPoint === "src/index.ts") {
      return { js: "#!/usr/bin/env node" };
    }
    return { js: "" };
  },
});
