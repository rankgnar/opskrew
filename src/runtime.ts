import { getDb } from "./db.js";
import { getConfig } from "./config.js";
import { getVault } from "./vault.js";
import { startTelegram } from "./channels/telegram.js";
import { readdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR, ensureSkillsDir } from "./tools/skills.js";
import { DEFAULT_SKILL_FILES } from "./tools/default-skills.js";
import { AGENTS_DIR, ensureAgentsDir, addAgent } from "./tools/team.js";
import { DEFAULT_AGENTS } from "./tools/default-agents.js";

// ── Global error handlers (resilience) ───────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[opskrew] Uncaught exception:', err);
  // No exit — PM2 will restart if needed
});

process.on('unhandledRejection', (reason) => {
  console.error('[opskrew] Unhandled rejection:', reason);
});

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
    // Fresh install — create all defaults
    console.log("[opskrew] Installing default agents...");
    for (const agent of DEFAULT_AGENTS) {
      addAgent(agent);
    }
    console.log(`[opskrew] Installed ${DEFAULT_AGENTS.length} default agents`);
  } else {
    // Update existing default agents (preserves user-created ones)
    for (const agent of DEFAULT_AGENTS) {
      const path = join(AGENTS_DIR, `${agent.id}.json`);
      if (existsSync(path)) {
        try {
          const current = JSON.parse(readFileSync(path, "utf-8"));
          // Only update systemPrompt and triggerPatterns — preserve user customizations
          if (current.systemPrompt !== agent.systemPrompt || JSON.stringify(current.triggerPatterns) !== JSON.stringify(agent.triggerPatterns)) {
            current.systemPrompt = agent.systemPrompt;
            current.triggerPatterns = agent.triggerPatterns;
            current.tools = agent.tools;
            writeFileSync(path, JSON.stringify(current, null, 2), "utf-8");
            console.log(`[opskrew] Updated default agent: ${agent.id}`);
          }
        } catch { /* skip corrupted files */ }
      }
    }
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

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = async () => {
    console.log('[opskrew] Shutting down gracefully...');
    try { getDb().close(); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error("[opskrew] Fatal error:", err);
  process.exit(1);
});
