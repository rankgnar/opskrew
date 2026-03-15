import { Telegraf, Context } from "telegraf";
import { getConfig } from "../config.js";
import { getVault } from "../vault.js";
import { chat, Message, TextContent, ImageContent } from "../claude.js";
import { buildSystemPrompt } from "../personality.js";
import { getHistory, addMessage } from "../history.js";
import { getMemories, deleteMemory } from "../memory.js";
import { startReminderTimer } from "../tools/reminders.js";
import { processMessage, processResponse } from "./shared.js";
import {
  PERSONALITIES,
  getChatPersonality,
  setChatPersonality,
} from "../tools/personalities.js";
import { getUsageStats, estimateCost } from "../tools/usage.js";
import { loadSkills, toggleSkill, downloadSkill, addSkill } from "../tools/skills.js";
import { scanSkillRemote } from "../tools/skill-scanner.js";
import { loadAgents, delegateToAgent } from "../tools/team.js";

function isAllowed(username: string | undefined, allowedUsers: string[]): boolean {
  if (allowedUsers.length === 0) return true;
  if (!username) return false;
  const normalized = username.replace(/^@/, "").toLowerCase();
  return allowedUsers.some((u) => u.replace(/^@/, "").toLowerCase() === normalized);
}

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    // Retry without parse_mode if HTML fails
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}

async function downloadTelegramFile(botToken: string, fileId: string): Promise<Buffer> {
  // Step 1: Get file path
  const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  if (!infoRes.ok) throw new Error(`getFile failed: HTTP ${infoRes.status}`);
  const info = (await infoRes.json()) as { ok: boolean; result: { file_path: string } };
  if (!info.ok) throw new Error("getFile response not ok");
  const filePath = info.result.file_path;

  // Step 2: Download file
  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!fileRes.ok) throw new Error(`File download failed: HTTP ${fileRes.status}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Transcribe an audio buffer using Groq Whisper API.
 */
async function transcribeWithGroq(audioBuffer: Buffer, groqApiKey: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" });
  formData.append("file", blob, "voice.ogg");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "text");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqApiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq Whisper error ${res.status}: ${err}`);
  }

  // response_format=text returns plain string
  return (await res.text()).trim();
}

export function startTelegram(): void {
  const vault = getVault();
  const config = getConfig();

  const botToken = vault.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    console.error("[telegram] No bot token. Run: opskrew setup");
    return;
  }

  const bot = new Telegraf(botToken);

  // Start reminder timer
  if (config.features.reminders) {
    startReminderTimer(async (chatId, text) => {
      await sendTelegramMessage(botToken, chatId, text);
    });
    console.log("[telegram] Reminder timer started");
  }

  bot.command("start", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    await sendTelegramMessage(
      botToken,
      ctx.chat!.id,
      `👋 Hi! I'm ${cfg.name}. How can I help you today?\n\nCommands:\n/memory — list what I remember\n/forget &lt;id&gt; — delete a memory\n/mode — show or change personality\n/usage — show token usage stats\n/skills — list installed skills\n/skill &lt;id&gt; — toggle a skill\n/install &lt;url&gt; — scan &amp; install a skill from URL\n/team — list team agents\n/ask &lt;agent&gt; &lt;msg&gt; — ask a specific agent`,
    );
  });

  bot.command("memory", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const memories = getMemories();
    if (memories.length === 0) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "I don't remember anything yet.");
      return;
    }
    const list = memories.map((m) => `[${m.id}] ${m.fact}`).join("\n");
    await sendTelegramMessage(botToken, ctx.chat!.id, `📝 What I remember:\n\n${list}`);
  });

  bot.command("forget", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const text = (ctx.message as { text?: string })?.text ?? "";
    const parts = text.split(" ");
    const id = parseInt(parts[1] ?? "", 10);
    if (isNaN(id)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "Usage: /forget <id>\nUse /memory to list memory IDs.");
      return;
    }
    deleteMemory(id);
    await sendTelegramMessage(botToken, ctx.chat!.id, `🗑 Memory #${id} deleted.`);
  });

  bot.command("mode", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const chatId = String(ctx.chat!.id);
    const msgText = (ctx.message as { text?: string })?.text ?? "";
    const args = msgText.split(" ").slice(1).filter(Boolean);

    if (args.length === 0) {
      // Show current mode + list all available
      const current = getChatPersonality(chatId);
      const list = PERSONALITIES.map((p) =>
        `${p.emoji} <b>${p.id}</b>${p.id === current.id ? " ✓" : ""} — ${p.description}`,
      ).join("\n");
      await sendTelegramMessage(
        botToken,
        ctx.chat!.id,
        `🎭 <b>Current mode:</b> ${current.emoji} ${current.name}\n\n<b>Available modes:</b>\n${list}\n\n<i>Switch with: /mode &lt;id&gt;</i>`,
      );
      return;
    }

    const requestedId = args[0].toLowerCase();
    const found = PERSONALITIES.find((p) => p.id === requestedId);
    if (!found) {
      const ids = PERSONALITIES.map((p) => p.id).join(", ");
      await sendTelegramMessage(
        botToken,
        ctx.chat!.id,
        `❌ Unknown mode: <b>${requestedId}</b>\n\nAvailable: ${ids}`,
      );
      return;
    }

    setChatPersonality(chatId, found.id);
    await sendTelegramMessage(
      botToken,
      ctx.chat!.id,
      `${found.emoji} Switched to <b>${found.name}</b> mode.\n<i>${found.description}</i>`,
    );
  });

  bot.command("skills", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const skills = loadSkills();
    if (skills.length === 0) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "No skills installed yet.");
      return;
    }
    const list = skills
      .map((s) => `${s.emoji} <b>${s.name}</b> [${s.id}] — ${s.enabled ? "✅ enabled" : "❌ disabled"}\n<i>${s.description}</i>`)
      .join("\n\n");
    await sendTelegramMessage(botToken, ctx.chat!.id, `🧩 <b>Skills</b>\n\n${list}\n\n<i>Toggle with: /skill &lt;id&gt;</i>`);
  });

  bot.command("skill", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const text = (ctx.message as { text?: string })?.text ?? "";
    const args = text.split(" ").slice(1).filter(Boolean);
    if (args.length === 0) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "Usage: /skill <id>\nUse /skills to list all skills.");
      return;
    }
    const id = args[0].toLowerCase();
    const skills = loadSkills();
    const skill = skills.find((s) => s.id === id);
    if (!skill) {
      await sendTelegramMessage(botToken, ctx.chat!.id, `❌ Skill not found: <b>${id}</b>`);
      return;
    }
    const newState = !skill.enabled;
    try {
      toggleSkill(id, newState);
      await sendTelegramMessage(
        botToken,
        ctx.chat!.id,
        `${skill.emoji} <b>${skill.name}</b> ${newState ? "✅ enabled" : "❌ disabled"}`,
      );
    } catch (err) {
      await sendTelegramMessage(botToken, ctx.chat!.id, `❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command("install", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const text = (ctx.message as { text?: string })?.text ?? "";
    const args = text.split(" ").slice(1).filter(Boolean);
    if (args.length === 0) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "Usage: /install &lt;url&gt;\nExample: /install https://example.com/skill.md");
      return;
    }
    const url = args[0];
    await sendTelegramMessage(botToken, ctx.chat!.id, `🔍 Scanning skill from:\n<code>${url}</code>`);
    try {
      // Remote scan via Gen Digital Trust Hub
      const remoteScan = await scanSkillRemote(url);
      if (remoteScan.status === "malicious") {
        await sendTelegramMessage(botToken, ctx.chat!.id, `❌ <b>Blocked by Gen Digital Trust Hub</b>\n${remoteScan.message}`);
        return;
      }

      // Download + local scan
      const { skill } = await downloadSkill(url);
      addSkill(skill);
      await sendTelegramMessage(
        botToken,
        ctx.chat!.id,
        `${skill.emoji} ✅ <b>Skill installed: ${skill.name}</b> [${skill.id}]\n<i>${skill.description}</i>`,
      );
    } catch (err) {
      await sendTelegramMessage(botToken, ctx.chat!.id, `❌ Failed to install skill:\n${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command("team", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const agents = loadAgents();
    if (agents.length === 0) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "No team agents configured yet.");
      return;
    }
    const list = agents
      .map(
        (a) =>
          `${a.emoji} <b>${a.name}</b> [${a.id}] — ${a.enabled ? "✅ active" : "❌ disabled"}\n<i>${a.description}</i>`,
      )
      .join("\n\n");
    await sendTelegramMessage(botToken, ctx.chat!.id, `🤖 <b>Team Agents</b>\n\n${list}\n\n<i>Delegate with: /ask &lt;id&gt; &lt;message&gt;</i>`);
  });

  bot.command("ask", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }
    const text = (ctx.message as { text?: string })?.text ?? "";
    const parts = text.split(" ").slice(1);
    if (parts.length < 2) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "Usage: /ask <agent_id> <message>\nUse /team to list available agents.");
      return;
    }
    const agentId = parts[0].toLowerCase();
    const message = parts.slice(1).join(" ").trim();
    const agents = loadAgents();
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      await sendTelegramMessage(botToken, ctx.chat!.id, `❌ Agent not found: <b>${agentId}</b>\nUse /team to list available agents.`);
      return;
    }
    if (!agent.enabled) {
      await sendTelegramMessage(botToken, ctx.chat!.id, `❌ Agent <b>${agent.name}</b> is disabled.`);
      return;
    }
    const chatId = String(ctx.chat!.id);
    try {
      await sendTelegramMessage(botToken, ctx.chat!.id, `${agent.emoji} <i>Asking ${agent.name}…</i>`);
      const reply = await delegateToAgent(agent, message, chatId);
      await sendTelegramMessage(botToken, ctx.chat!.id, `${agent.emoji} <b>${agent.name}:</b>\n\n${reply}`);
    } catch (err) {
      console.error("[telegram] /ask error:", err);
      await sendTelegramMessage(botToken, ctx.chat!.id, "❌ Error processing request. Please try again.");
    }
  });

  bot.command("usage", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }

    const day = getUsageStats("day");
    const week = getUsageStats("week");
    const month = getUsageStats("month");
    const all = getUsageStats("all");

    const fmt = (n: number) => n.toLocaleString();
    const costFmt = (c: number) => `$${c.toFixed(4)}`;

    const model = all.model || cfg.model;
    const allCost = estimateCost(model, all.inputTokens, all.outputTokens);

    const msg =
      `📊 <b>Usage Stats</b>\n\n` +
      `Today: ${fmt(day.inputTokens)} in / ${fmt(day.outputTokens)} out\n` +
      `This week: ${fmt(week.inputTokens)} / ${fmt(week.outputTokens)}\n` +
      `This month: ${fmt(month.inputTokens)} / ${fmt(month.outputTokens)}\n` +
      `All time: ${fmt(all.inputTokens)} / ${fmt(all.outputTokens)}\n\n` +
      `Model: <code>${model}</code>\n` +
      `Equivalent API cost: ${costFmt(allCost)} <i>(covered by subscription)</i>`;

    await sendTelegramMessage(botToken, ctx.chat!.id, msg);
  });

  bot.on("text", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }

    const userText = (ctx.message as { text?: string })?.text ?? "";
    const chatId = String(ctx.chat!.id);

    try {
      await processMessage({
        chatId,
        text: userText,
        sendReply: async (reply) => {
          await sendTelegramMessage(botToken, ctx.chat!.id, reply);
        },
      });
    } catch (err) {
      console.error("[telegram] Error:", err);
      await sendTelegramMessage(botToken, ctx.chat!.id, "❌ Error processing your message. Please try again.");
    }
  });

  // Handle voice messages
  bot.on("voice", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }

    const chatId = String(ctx.chat!.id);
    const message = ctx.message as { voice?: { file_id: string; duration: number } };
    const voice = message.voice;
    if (!voice) return;

    if (!cfg.groqApiKey) {
      await sendTelegramMessage(
        botToken,
        ctx.chat!.id,
        "🎤 Voice transcription requires a free Groq API key.\n\nGet one at https://console.groq.com (free tier)\nThen run: opskrew setup --section features",
      );
      return;
    }

    try {
      const transcribing = sendTelegramMessage(botToken, ctx.chat!.id, "🎤 Transcribing...");

      const audioBuffer = await downloadTelegramFile(botToken, voice.file_id);
      const transcription = await transcribeWithGroq(audioBuffer, cfg.groqApiKey);

      await transcribing;

      if (!transcription) {
        await sendTelegramMessage(botToken, ctx.chat!.id, "❌ Could not transcribe voice message. Please try again.");
        return;
      }

      console.log(`[telegram] Voice transcribed: "${transcription}"`);

      await processMessage({
        chatId,
        text: transcription,
        sendReply: async (reply) => {
          await sendTelegramMessage(botToken, ctx.chat!.id, `🎤 <i>${transcription}</i>\n\n${reply}`);
        },
      });
    } catch (err) {
      console.error("[telegram] Voice error:", err);
      await sendTelegramMessage(botToken, ctx.chat!.id, "❌ Error transcribing voice message. Please try again.");
    }
  });

  // Handle photo messages
  bot.on("photo", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }

    if (!cfg.features.vision) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "Vision is not enabled. Enable it in setup.");
      return;
    }

    const chatId = String(ctx.chat!.id);
    const message = ctx.message as {
      photo?: Array<{ file_id: string; width: number; height: number }>;
      caption?: string;
    };

    const photos = message.photo;
    if (!photos || photos.length === 0) return;

    // Use the largest photo (last in array)
    const photo = photos[photos.length - 1];
    const caption = message.caption ?? "What's in this image?";

    try {
      const imageBuffer = await downloadTelegramFile(botToken, photo.file_id);
      const base64Data = imageBuffer.toString("base64");

      await processMessage({
        chatId,
        text: caption,
        imageBase64: base64Data,
        imageMediaType: "image/jpeg",
        sendReply: async (reply) => {
          await sendTelegramMessage(botToken, ctx.chat!.id, reply);
        },
      });
    } catch (err) {
      console.error("[telegram] Photo error:", err);
      await sendTelegramMessage(botToken, ctx.chat!.id, "❌ Error processing image. Please try again.");
    }
  });

  // Handle document messages
  bot.on("document", async (ctx: Context) => {
    const username = ctx.from?.username;
    const cfg = getConfig();
    if (!isAllowed(username, cfg.telegram.allowedUsers)) {
      await sendTelegramMessage(botToken, ctx.chat!.id, "⛔ Unauthorized.");
      return;
    }

    const chatId = String(ctx.chat!.id);
    const message = ctx.message as {
      document?: { file_id: string; file_name?: string; mime_type?: string };
      caption?: string;
    };

    const doc = message.document;
    if (!doc) return;

    const filename = doc.file_name ?? "document";
    const caption = message.caption ?? "Analyze this document and summarize the key points.";

    const textExtensions = [".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".html"];
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
    const isPdf = ext === ".pdf" || doc.mime_type === "application/pdf";
    const isText = textExtensions.includes(ext);

    if (!isText && !isPdf) {
      await sendTelegramMessage(
        botToken,
        ctx.chat!.id,
        "I can read text files (.txt, .md, .json, .csv) and code files (.py, .js, .ts, .html). PDFs have limited support.",
      );
      return;
    }

    try {
      const fileBuffer = await downloadTelegramFile(botToken, doc.file_id);

      let documentText: string;

      if (isPdf) {
        const raw = fileBuffer.toString("latin1");
        const textParts: string[] = [];
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let match: RegExpExecArray | null;
        while ((match = streamRegex.exec(raw)) !== null) {
          const printable = match[1].replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
          if (printable.length > 20) {
            textParts.push(printable);
          }
        }
        const parenRegex = /\(([^)]{3,200})\)/g;
        let parenMatch: RegExpExecArray | null;
        while ((parenMatch = parenRegex.exec(raw)) !== null) {
          const t = parenMatch[1].replace(/[^\x20-\x7E]/g, "").trim();
          if (t.length > 3) textParts.push(t);
        }
        const combined = textParts.join(" ").replace(/\s+/g, " ").trim();
        documentText = combined.slice(0, 8000) || "[No readable text could be extracted from this PDF]";
      } else {
        documentText = fileBuffer.toString("utf-8").slice(0, 8000);
      }

      const userMessage = `Document content (${filename}):\n\n${documentText}\n\n---\n\n${caption}`;

      const history = getHistory(chatId);
      const systemPrompt = buildSystemPrompt(chatId);
      const messages: Message[] = [...history, { role: "user" as const, content: userMessage }];

      const result = await chat(messages, systemPrompt, cfg.model);
      const cleanReply = await processResponse(result.text, messages, systemPrompt, chatId, cfg.model);

      addMessage(chatId, "user", `[Document: ${filename}] ${caption}`);
      addMessage(chatId, "assistant", cleanReply);

      await sendTelegramMessage(botToken, ctx.chat!.id, cleanReply);
    } catch (err) {
      console.error("[telegram] Document error:", err);
      await sendTelegramMessage(botToken, ctx.chat!.id, "❌ Error processing document. Please try again.");
    }
  });

  bot.launch().then(() => {
    console.log("[telegram] Bot started");
  }).catch((err: unknown) => {
    console.error("[telegram] Failed to start bot:", err);
  });

  // Graceful shutdown
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
