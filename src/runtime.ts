import { getDb } from "./db.js";
import { getConfig } from "./config.js";
import { getVault } from "./vault.js";
import { startTelegram } from "./channels/telegram.js";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR, ensureSkillsDir } from "./tools/skills.js";
import { DEFAULT_SKILL_FILES } from "./tools/default-skills.js";
import { AGENTS_DIR, ensureAgentsDir, addAgent } from "./tools/team.js";
import { DEFAULT_AGENTS } from "./tools/default-agents.js";

function installDefaultSkills(): void {
  ensureSkillsDir();
  const existing = readdirSync(SKILLS_DIR).filter(
    (f) => f.endsWith(".md") || f.endsWith(".json"),
  );
  if (existing.length === 0) {
    console.log("[opskrew] Installing default skills...");
    for (const { filename, content } of DEFAULT_SKILL_FILES) {
      writeFileSync(join(SKILLS_DIR, filename), content, "utf-8");
    }
    console.log(`[opskrew] Installed ${DEFAULT_SKILL_FILES.length} default skills`);
  }
}

function installDefaultAgents(): void {
  ensureAgentsDir();
  const existing = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".json"));
  if (existing.length === 0) {
    console.log("[opskrew] Installing default agents...");
    for (const agent of DEFAULT_AGENTS) {
      addAgent(agent);
    }
    console.log(`[opskrew] Installed ${DEFAULT_AGENTS.length} default agents`);
  }
}

async function main(): Promise<void> {
  console.log("[opskrew] Starting...");

  // Ensure DB is initialized
  getDb();

  // Install default skills and agents if not present
  installDefaultSkills();
  installDefaultAgents();

  const config = getConfig();
  const vault = getVault();
  console.log(`[opskrew] Name: ${config.name} | Model: ${config.model}`);

  // Start Telegram
  startTelegram();

  // Start Discord (if configured)
  if (config.discord?.token) {
    const { startDiscord } = await import("./channels/discord.js");
    startDiscord(config.discord.token, config.discord.allowedUsers ?? []);
    console.log("[opskrew] Discord channel enabled");
  }

  // Start WhatsApp (if configured)
  if (config.whatsapp?.enabled) {
    const { startWhatsApp } = await import("./channels/whatsapp.js");
    startWhatsApp(config.whatsapp.allowedNumbers ?? []).catch((err: unknown) => {
      console.error("[opskrew] WhatsApp failed to start:", err);
    });
    console.log("[opskrew] WhatsApp channel enabled");
  }

  // Start Dashboard (if configured)
  if (config.dashboard?.enabled) {
    const { startDashboard } = await import("./dashboard/server.js");
    startDashboard(config.dashboard.port ?? 3000);
    console.log("[opskrew] Dashboard enabled");
  }

  // Start auto-update checker (default: on, opt-out with autoUpdate: false)
  if (config.autoUpdate !== false) {
    const { startAutoUpdate } = await import("./tools/auto-update.js");
    startAutoUpdate();
    console.log("[opskrew] Auto-update enabled (checks every hour)");
  }

  console.log("[opskrew] Running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[opskrew] Fatal error:", err);
  process.exit(1);
});
