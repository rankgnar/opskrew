import * as p from "@clack/prompts";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getVault } from "../vault.js";

const MODEL_NAMES: Record<string, string> = {
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-opus-4-5": "Claude Opus 4.5",
  "claude-haiku-4-20250514": "Claude Haiku 4",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "o3": "o3",
  "o4-mini": "o4-mini",
  "deepseek-chat": "DeepSeek V3",
  "deepseek-reasoner": "DeepSeek R1",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "anthropic/claude-sonnet-4-6": "Claude Sonnet 4.6 (OpenRouter)",
  "openai/gpt-4o": "GPT-4o (OpenRouter)",
  "deepseek/deepseek-chat": "DeepSeek V3 (OpenRouter)",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash (OpenRouter)",
  "meta-llama/llama-4-maverick": "Llama 4 Maverick (OpenRouter)",
  "mistral-large-latest": "Mistral Large",
  "mistral-small-latest": "Mistral Small",
  "grok-3": "Grok 3",
  "grok-3-mini": "Grok 3 Mini",
  "llama-3.3-70b-versatile": "Llama 3.3 70B",
  "mixtral-8x7b-32768": "Mixtral 8x7B",
};

function friendlyModelName(model: string): string {
  return MODEL_NAMES[model] ?? model;
}

type Provider = "anthropic" | "openai" | "deepseek" | "google" | "openrouter" | "mistral" | "xai" | "groq" | "custom";
import { getConfig, saveConfig, Features, Config } from "../config.js";
import { validateToken, PROVIDERS, MODELS } from "../claude.js";
import { DATA_DIR } from "../db.js";
import { join } from "node:path";

type Section = "auth" | "personality" | "telegram" | "discord" | "whatsapp" | "dashboard" | "security" | "features" | "all";

function isRoot(): boolean {
  return process.getuid?.() === 0;
}

function runCmd(cmd: string): void {
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    // Ignore errors for optional security setup
  }
}

function hasExistingSetup(): boolean {
  const configPath = join(DATA_DIR, "config.json");
  const vaultPath = join(DATA_DIR, "vault.enc");
  return existsSync(configPath) || existsSync(vaultPath);
}

function printHeader(): void {
  console.log();
  console.log(chalk.cyan("  ╔═══════════════════════════════════════╗"));
  console.log(chalk.cyan("  ║") + chalk.bold.white("         opskrew setup          ") + chalk.cyan("║"));
  console.log(chalk.cyan("  ║") + chalk.gray("   Your personal AI assistant          ") + chalk.cyan("║"));
  console.log(chalk.cyan("  ╚═══════════════════════════════════════╝"));
  console.log();
}

function printBox(lines: string[]): void {
  const width = 51;
  const border = "─".repeat(width);
  console.log(chalk.cyan(`  ┌${border}┐`));
  for (const line of lines) {
    // strip ansi for length calculation
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = width - stripped.length;
    console.log(chalk.cyan("  │") + " " + line + " ".repeat(Math.max(0, padding - 1)) + chalk.cyan("│"));
  }
  console.log(chalk.cyan(`  └${border}┘`));
  console.log();
}

function printSeparator(): void {
  console.log(chalk.gray("  " + "─".repeat(51)));
  console.log();
}

function printCurrentStatus(): void {
  const config = getConfig();
  const vault = getVault();
  const hasToken = !!vault.get("CLAUDE_TOKEN");
  const hasBotToken = !!vault.get("TELEGRAM_BOT_TOKEN");

  console.log(chalk.bold("  Current configuration:"));
  console.log();
  console.log("  " + chalk.gray("Auth token:  ") + (hasToken ? chalk.green("✓ Configured") : chalk.yellow("✗ Not set")));
  console.log("  " + chalk.gray("Provider:    ") + chalk.white(config.provider ?? "anthropic"));
  console.log("  " + chalk.gray("Assistant:   ") + chalk.white(config.name));
  console.log("  " + chalk.gray("Language:    ") + chalk.white(config.language));
  console.log("  " + chalk.gray("Tone:        ") + chalk.white(config.tone));
  console.log("  " + chalk.gray("Model:       ") + chalk.white(friendlyModelName(config.model)));
  console.log("  " + chalk.gray("Telegram:    ") + (hasBotToken ? chalk.green("✓ Configured") : chalk.yellow("✗ Not set")));
  if (config.telegram?.allowedUsers?.length) {
    console.log("  " + chalk.gray("Allowed:     ") + chalk.white("@" + config.telegram.allowedUsers.join(", @")));
  }
  console.log();
}

function printCompletionSummary(): void {
  const config = getConfig();
  const vault = getVault();
  const botToken = vault.get("TELEGRAM_BOT_TOKEN");
  // Try to extract bot username hint from token format
  const botHint = botToken ? "configured" : "not set";

  console.log();
  console.log(chalk.cyan("  ┌─────────────────────────────────────────┐"));
  console.log(chalk.cyan("  │") + chalk.bold.green("  opskrew is ready!                   ") + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + " ".repeat(43) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + "  " + chalk.gray("Assistant:") + " " + chalk.white(String(config.name).padEnd(30)) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + "  " + chalk.gray("Language: ") + " " + chalk.white(String(config.language).padEnd(30)) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + "  " + chalk.gray("Telegram: ") + " " + chalk.white(botHint.padEnd(30)) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + "  " + chalk.gray("Model:    ") + " " + chalk.white(friendlyModelName(config.model).padEnd(30)) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + " ".repeat(43) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + "  " + chalk.cyan("Start with: ") + chalk.bold("opskrew start") + " ".repeat(16) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + "  " + chalk.cyan("View logs:  ") + chalk.bold("opskrew logs") + " ".repeat(17) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + "  " + chalk.cyan("Status:     ") + chalk.bold("opskrew status") + " ".repeat(15) + chalk.cyan("│"));
  console.log(chalk.cyan("  └─────────────────────────────────────────┘"));
  console.log();
}

const PROVIDER_VAULT_KEYS: Record<Provider, string> = {
  anthropic:  "CLAUDE_TOKEN",
  openai:     "OPENAI_TOKEN",
  deepseek:   "DEEPSEEK_TOKEN",
  google:     "GOOGLE_TOKEN",
  openrouter: "OPENROUTER_TOKEN",
  mistral:    "MISTRAL_TOKEN",
  xai:        "XAI_TOKEN",
  groq:       "GROQ_LLM_TOKEN",
  custom:     "CUSTOM_TOKEN",
};

const PROVIDER_TOKEN_HINTS: Record<Provider, string[]> = {
  anthropic: [
    chalk.gray("opskrew uses your Claude Max/Pro subscription"),
    chalk.gray("(no extra API costs)."),
    "",
    chalk.white("To get your token:"),
    chalk.white("1. Open a terminal on your computer (not here)"),
    chalk.white("2. Run: ") + chalk.cyan("claude setup-token"),
    chalk.white("3. Follow the browser authorization"),
    chalk.white("4. Copy the token that starts with ") + chalk.cyan("sk-ant-..."),
    "",
    chalk.gray("Don't have Claude CLI? Install it first:"),
    chalk.cyan("   npm install -g @anthropic-ai/claude-code"),
  ],
  openai: [
    chalk.gray("Connect your OpenAI account via API key."),
    "",
    chalk.white("To get your key:"),
    chalk.white("1. Go to ") + chalk.cyan("platform.openai.com/api-keys"),
    chalk.white("2. Create a new secret key"),
    chalk.white("3. Copy the key that starts with ") + chalk.cyan("sk-..."),
  ],
  deepseek: [
    chalk.gray("Connect your DeepSeek account via API key."),
    "",
    chalk.white("To get your key:"),
    chalk.white("1. Go to ") + chalk.cyan("platform.deepseek.com"),
    chalk.white("2. Create an API key"),
  ],
  google: [
    chalk.gray("Connect your Google AI account via API key (Gemini)."),
    "",
    chalk.white("To get your key:"),
    chalk.white("1. Go to ") + chalk.cyan("aistudio.google.com/apikey"),
    chalk.white("2. Create an API key"),
  ],
  openrouter: [
    chalk.gray("OpenRouter lets you access multiple AI models with one key."),
    "",
    chalk.white("To get your key:"),
    chalk.white("1. Go to ") + chalk.cyan("openrouter.ai/keys"),
    chalk.white("2. Create an API key"),
    chalk.white("3. Copy the key that starts with ") + chalk.cyan("sk-or-..."),
  ],
  mistral: [
    chalk.gray("Connect your Mistral AI account via API key."),
    "",
    chalk.white("To get your key:"),
    chalk.white("1. Go to ") + chalk.cyan("console.mistral.ai/api-keys"),
    chalk.white("2. Create an API key"),
  ],
  xai: [
    chalk.gray("Connect your xAI account via API key (Grok)."),
    "",
    chalk.white("To get your key:"),
    chalk.white("1. Go to ") + chalk.cyan("console.x.ai"),
    chalk.white("2. Create an API key"),
  ],
  groq: [
    chalk.gray("Connect your Groq account via API key (ultra-fast inference)."),
    chalk.gray("Note: this is for LLM inference, separate from Groq Whisper voice."),
    "",
    chalk.white("To get your key:"),
    chalk.white("1. Go to ") + chalk.cyan("console.groq.com/keys"),
    chalk.white("2. Create an API key"),
  ],
  custom: [
    chalk.gray("Connect any OpenAI-compatible API endpoint."),
    "",
    chalk.white("Examples: LM Studio, Ollama, LocalAI, vLLM, etc."),
    chalk.white("You will be asked for the endpoint URL and model name."),
  ],
};

async function setupAuth(vault: ReturnType<typeof getVault>): Promise<{ provider: Provider; customEndpoint?: string }> {
  console.log();
  printBox([
    chalk.bold.yellow("Step — Connect your AI provider"),
    "",
    chalk.white("Choose the AI provider that powers your assistant."),
    chalk.gray("Anthropic (Claude) is recommended for subscribers."),
  ]);

  const currentConfig = getConfig();
  const currentProvider = (currentConfig.provider ?? "anthropic") as Provider;

  const provider = await p.select<Provider>({
    message: "AI Provider:",
    initialValue: currentProvider,
    options: [
      { value: "anthropic",  label: "Anthropic (Claude) — recommended for subscribers" },
      { value: "openai",     label: "OpenAI — GPT-4o, o3" },
      { value: "deepseek",   label: "DeepSeek — affordable & powerful" },
      { value: "google",     label: "Google (Gemini) — Gemini 2.5" },
      { value: "openrouter", label: "OpenRouter — access all models with one key" },
      { value: "mistral",    label: "Mistral AI — European AI" },
      { value: "xai",        label: "xAI (Grok) — by Elon Musk" },
      { value: "groq",       label: "Groq — ultra-fast inference" },
      { value: "custom",     label: "Custom (OpenAI-compatible) — any compatible API" },
    ],
  });

  if (p.isCancel(provider)) { p.cancel("Setup cancelled."); process.exit(0); }

  const selectedProvider = provider as Provider;
  const vaultKey = PROVIDER_VAULT_KEYS[selectedProvider];
  const hints = PROVIDER_TOKEN_HINTS[selectedProvider];

  printBox([
    chalk.bold.yellow(`${PROVIDERS[selectedProvider]?.name ?? selectedProvider} Token`),
    "",
    ...hints,
  ]);

  // Custom provider: ask for endpoint URL first
  let customEndpoint: string | undefined;
  if (selectedProvider === "custom") {
    const currentEndpoint = currentConfig.customEndpoint ?? "";
    const endpointInput = await p.text({
      message: "API endpoint URL (e.g. http://localhost:11434/v1/chat/completions):",
      placeholder: "https://your-api.example.com/v1/chat/completions",
      initialValue: currentEndpoint,
      validate(value) {
        if (!value.trim()) return "Endpoint URL is required.";
        if (!value.startsWith("http")) return "Must be a valid HTTP/HTTPS URL.";
      },
    });
    if (p.isCancel(endpointInput)) { p.cancel("Setup cancelled."); process.exit(0); }
    customEndpoint = String(endpointInput).trim();
  }

  const currentToken = vault.get(vaultKey);
  if (currentToken) {
    const keep = await p.confirm({
      message: `A ${selectedProvider} token is already saved. Keep it?`,
      initialValue: true,
    });
    if (p.isCancel(keep)) { p.cancel("Setup cancelled."); process.exit(0); }
    if (keep) return { provider: selectedProvider, customEndpoint };
  }

  const tokenValidate = selectedProvider === "anthropic"
    ? (value: string) => {
        if (!value.trim()) return "Token is required.";
        if (!value.startsWith("sk-ant-")) return "Claude token should start with sk-ant-";
      }
    : (value: string) => {
        if (!value.trim()) return "API key is required.";
      };

  const token = await p.password({
    message: `Paste your ${selectedProvider} ${selectedProvider === "anthropic" ? "OAuth token" : "API key"}:`,
    validate: tokenValidate,
  });

  if (p.isCancel(token)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const validating = p.spinner();
  validating.start("Validating token...");
  const isValid = await validateToken(String(token), selectedProvider, customEndpoint);
  if (isValid) {
    validating.stop(chalk.green(`✓ Token valid — connected to ${selectedProvider}`));
  } else {
    validating.stop(chalk.yellow("Warning: Could not validate token (API may be temporarily unavailable). Saving anyway."));
    const proceed = await p.confirm({
      message: "Token could not be validated. Save it anyway?",
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
  }

  vault.set(vaultKey, String(token));
  return { provider: selectedProvider, customEndpoint };
}

async function setupPersonality(
  config: ReturnType<typeof getConfig>,
  provider: Provider = "anthropic",
): Promise<Partial<ReturnType<typeof getConfig>>> {
  printSeparator();
  printBox([
    chalk.bold.magenta("Step — Personalize your assistant"),
    "",
    chalk.gray("Give your assistant a name, choose the language"),
    chalk.gray("it speaks, and set its personality."),
  ]);

  const name = await p.text({
    message: "Assistant name:",
    placeholder: "Opskrew",
    initialValue: config.name,
  });
  if (p.isCancel(name)) { p.cancel("Setup cancelled."); process.exit(0); }

  const languageChoice = await p.select({
    message: "Response language:",
    initialValue: config.language || "English",
    options: [
      { value: "English", label: "English" },
      { value: "Español", label: "Español" },
      { value: "Français", label: "Français" },
      { value: "Deutsch", label: "Deutsch" },
      { value: "Português", label: "Português" },
      { value: "Italiano", label: "Italiano" },
      { value: "日本語", label: "日本語 (Japanese)" },
      { value: "中文", label: "中文 (Chinese)" },
      { value: "한국어", label: "한국어 (Korean)" },
      { value: "العربية", label: "العربية (Arabic)" },
      { value: "custom", label: "Other (type it)" },
    ],
  });
  if (p.isCancel(languageChoice)) { p.cancel("Setup cancelled."); process.exit(0); }

  let language: string;
  if (languageChoice === "custom") {
    const customLang = await p.text({
      message: "Type your language:",
      placeholder: "e.g. Svenska, Nederlands, Hindi...",
      validate(v) { if (!v.trim()) return "Language is required."; },
    });
    if (p.isCancel(customLang)) { p.cancel("Setup cancelled."); process.exit(0); }
    language = String(customLang);
  } else {
    language = String(languageChoice);
  }

  const tone = await p.select({
    message: "Personality:",
    initialValue: config.tone || "helpful and friendly",
    options: [
      { value: "helpful and friendly", label: "Friendly — warm, approachable, supportive" },
      { value: "professional and concise", label: "Professional — focused, efficient, to the point" },
      { value: "casual and witty", label: "Casual — relaxed, humorous, conversational" },
      { value: "academic and thorough", label: "Academic — detailed, analytical, precise" },
      { value: "creative and expressive", label: "Creative — imaginative, playful, expressive" },
      { value: "custom", label: "Custom (describe it)" },
    ],
  });
  if (p.isCancel(tone)) { p.cancel("Setup cancelled."); process.exit(0); }

  let finalTone: string;
  if (tone === "custom") {
    const customTone = await p.text({
      message: "Describe the personality:",
      placeholder: "e.g. sarcastic but helpful, like a wise mentor...",
      validate(v) { if (!v.trim()) return "Personality description is required."; },
    });
    if (p.isCancel(customTone)) { p.cancel("Setup cancelled."); process.exit(0); }
    finalTone = String(customTone);
  } else {
    finalTone = String(tone);
  }

  // For custom provider, let the user type the model name
  let chosenModel: string;
  const providerModels = MODELS[provider] ?? [];
  if (provider === "custom" || providerModels.length === 0) {
    const modelInput = await p.text({
      message: "Model name (as required by your API endpoint):",
      placeholder: "gpt-4o",
      initialValue: config.model ?? "",
      validate(v) {
        if (!v.trim()) return "Model name is required.";
      },
    });
    if (p.isCancel(modelInput)) { p.cancel("Setup cancelled."); process.exit(0); }
    chosenModel = String(modelInput).trim();
  } else {
    const defaultModel = config.model && providerModels.some((m) => m.id === config.model)
      ? config.model
      : providerModels[0].id;
    const providerLabel = PROVIDERS[provider]?.name ?? provider;
    const model = await p.select({
      message: `${providerLabel} model:`,
      initialValue: defaultModel,
      options: providerModels.map((m) => ({ value: m.id, label: m.name })),
    });
    if (p.isCancel(model)) { p.cancel("Setup cancelled."); process.exit(0); }
    chosenModel = String(model);
  }

  return { name: String(name), language: String(language), tone: finalTone, model: chosenModel };
}

async function setupTelegram(vault: ReturnType<typeof getVault>, config: ReturnType<typeof getConfig>): Promise<{ allowedUsers: string[] }> {
  printSeparator();
  printBox([
    chalk.bold.blue("Step — Connect Telegram"),
    "",
    chalk.white("You need a Telegram bot token:"),
    chalk.white("1. Open Telegram and search for ") + chalk.cyan("@BotFather"),
    chalk.white("2. Send ") + chalk.cyan("/newbot") + chalk.white(" and follow the instructions"),
    chalk.white("3. Copy the token (looks like ") + chalk.cyan("123456:ABC-...") + chalk.white(")"),
    "",
    chalk.gray("Your username is needed so the bot only"),
    chalk.gray("responds to YOU (security)."),
  ]);

  const currentBotToken = vault.get("TELEGRAM_BOT_TOKEN");
  if (currentBotToken) {
    const keep = await p.confirm({
      message: "A Telegram bot token is already saved. Keep it?",
      initialValue: true,
    });
    if (p.isCancel(keep)) { p.cancel("Setup cancelled."); process.exit(0); }
    if (!keep) {
      const botToken = await p.text({
        message: "Telegram bot token (from @BotFather):",
        placeholder: "123456:ABC-...",
        validate(value) {
          if (!value.trim()) return "Bot token is required.";
        },
      });
      if (p.isCancel(botToken)) { p.cancel("Setup cancelled."); process.exit(0); }
      vault.set("TELEGRAM_BOT_TOKEN", String(botToken));
    }
  } else {
    const botToken = await p.text({
      message: "Telegram bot token (from @BotFather):",
      placeholder: "123456:ABC-...",
      validate(value) {
        if (!value.trim()) return "Bot token is required.";
      },
    });
    if (p.isCancel(botToken)) { p.cancel("Setup cancelled."); process.exit(0); }
    vault.set("TELEGRAM_BOT_TOKEN", String(botToken));
  }

  const currentUsers = config.telegram?.allowedUsers ?? [];
  const allowedUser = await p.text({
    message: "Your personal Telegram username, not the bot's (without @):",
    placeholder: "yourusername",
    initialValue: currentUsers[0] ?? "",
  });
  if (p.isCancel(allowedUser)) { p.cancel("Setup cancelled."); process.exit(0); }

  const allowedUsers = String(allowedUser).trim()
    ? [String(allowedUser).trim().replace(/^@/, "")]
    : currentUsers;

  return { allowedUsers };
}

async function setupFeatures(config: ReturnType<typeof getConfig>): Promise<{ features: Features; autoUpdate: boolean }> {
  printSeparator();
  printBox([
    chalk.bold.cyan("Step — Features"),
    "",
    chalk.gray("Which features would you like to enable?"),
    chalk.gray("All features are enabled by default."),
    chalk.gray("You can change this anytime with: opskrew setup --section features"),
  ]);

  const current = config.features ?? {
    webSearch: true,
    urlReader: true,
    knowledge: true,
    reminders: true,
    vision: true,
  };

  const webSearch = await p.confirm({
    message: "Web search — search the internet",
    initialValue: current.webSearch,
  });
  if (p.isCancel(webSearch)) { p.cancel("Setup cancelled."); process.exit(0); }

  const urlReader = await p.confirm({
    message: "URL reader — summarize web pages",
    initialValue: current.urlReader,
  });
  if (p.isCancel(urlReader)) { p.cancel("Setup cancelled."); process.exit(0); }

  const knowledge = await p.confirm({
    message: "Knowledge base — load your own documents",
    initialValue: current.knowledge,
  });
  if (p.isCancel(knowledge)) { p.cancel("Setup cancelled."); process.exit(0); }

  const reminders = await p.confirm({
    message: "Reminders — schedule reminders",
    initialValue: current.reminders,
  });
  if (p.isCancel(reminders)) { p.cancel("Setup cancelled."); process.exit(0); }

  const vision = await p.confirm({
    message: "Vision — analyze images you send",
    initialValue: current.vision,
  });
  if (p.isCancel(vision)) { p.cancel("Setup cancelled."); process.exit(0); }

  const autoUpdate = await p.confirm({
    message: "Auto-update — automatically install updates (checks every hour)",
    initialValue: config.autoUpdate !== false,
  });
  if (p.isCancel(autoUpdate)) { p.cancel("Setup cancelled."); process.exit(0); }

  // Voice messages via Groq Whisper
  const vault = getVault();
  const currentGroqKey = vault.get("GROQ_API_KEY") ?? "";
  const voiceEnabled = await p.confirm({
    message: "Voice messages — transcribe audio (requires free Groq API key)",
    initialValue: !!currentGroqKey,
  });
  if (p.isCancel(voiceEnabled)) { p.cancel("Setup cancelled."); process.exit(0); }

  if (voiceEnabled) {
    if (currentGroqKey) {
      const keepGroq = await p.confirm({ message: "A Groq API key is already saved. Keep it?", initialValue: true });
      if (p.isCancel(keepGroq)) { p.cancel("Setup cancelled."); process.exit(0); }
      if (!keepGroq) {
        const groqKey = await p.text({
          message: "Groq API key (get one free at console.groq.com):",
          validate(v) { if (!v.trim()) return "API key required."; },
        });
        if (p.isCancel(groqKey)) { p.cancel("Setup cancelled."); process.exit(0); }
        vault.set("GROQ_API_KEY", String(groqKey));
      }
    } else {
      const groqKey = await p.text({
        message: "Groq API key (get one free at console.groq.com):",
        validate(v) { if (!v.trim()) return "API key required."; },
      });
      if (p.isCancel(groqKey)) { p.cancel("Setup cancelled."); process.exit(0); }
      vault.set("GROQ_API_KEY", String(groqKey));
      p.log.success("Groq API key saved — voice transcription enabled!");
    }
  }

  const features: Features = {
    webSearch: Boolean(webSearch),
    urlReader: Boolean(urlReader),
    knowledge: Boolean(knowledge),
    reminders: Boolean(reminders),
    vision: Boolean(vision),
  };

  const enabled = Object.entries(features)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");
  const autoUpdateStr = Boolean(autoUpdate) ? "auto-update" : "";
  p.log.success(`Features enabled: ${[enabled, autoUpdateStr].filter(Boolean).join(", ") || "none"}`);

  return { features, autoUpdate: Boolean(autoUpdate) };
}

async function setupDiscord(
  vault: ReturnType<typeof getVault>,
  config: ReturnType<typeof getConfig>,
): Promise<{ enabled: boolean; token?: string; allowedUsers: string[] }> {
  printSeparator();
  printBox([
    chalk.bold.blue("Step — Discord (optional)"),
    "",
    chalk.gray("Connect a Discord bot so you can chat via Discord."),
    "",
    chalk.white("To get a bot token:"),
    chalk.white("1. Go to ") + chalk.cyan("discord.com/developers/applications"),
    chalk.white("2. Create a new Application, then go to ") + chalk.cyan("Bot"),
    chalk.white("3. Click ") + chalk.cyan("Reset Token") + chalk.white(" and copy it"),
    chalk.white("4. Enable ") + chalk.cyan("Message Content Intent") + chalk.white(" under Privileged Gateway Intents"),
    "",
    chalk.white("To find your Discord user ID:"),
    chalk.white("Enable Developer Mode → right-click yourself → ") + chalk.cyan("Copy ID"),
  ]);

  const wantDiscord = await p.confirm({
    message: "Connect Discord?",
    initialValue: !!(config.discord?.token),
  });
  if (p.isCancel(wantDiscord)) { p.cancel("Setup cancelled."); process.exit(0); }
  if (!wantDiscord) {
    p.log.warn("Discord skipped. You can add it later with: opskrew setup --section discord");
    return { enabled: false, allowedUsers: [] };
  }

  const currentToken = vault.get("DISCORD_BOT_TOKEN");
  if (currentToken) {
    const keep = await p.confirm({ message: "A Discord bot token is already saved. Keep it?", initialValue: true });
    if (p.isCancel(keep)) { p.cancel("Setup cancelled."); process.exit(0); }
    if (!keep) {
      const tok = await p.text({
        message: "Discord bot token:",
        validate(v) { if (!v.trim()) return "Token is required."; },
      });
      if (p.isCancel(tok)) { p.cancel("Setup cancelled."); process.exit(0); }
      vault.set("DISCORD_BOT_TOKEN", String(tok));
    }
  } else {
    const tok = await p.text({
      message: "Discord bot token:",
      validate(v) { if (!v.trim()) return "Token is required."; },
    });
    if (p.isCancel(tok)) { p.cancel("Setup cancelled."); process.exit(0); }
    vault.set("DISCORD_BOT_TOKEN", String(tok));
  }

  const currentUsers = config.discord?.allowedUsers ?? [];
  const userId = await p.text({
    message: "Your Discord user ID (or comma-separated IDs):",
    placeholder: "123456789012345678",
    initialValue: currentUsers.join(", "),
    validate(v) { if (!v.trim()) return "At least one user ID is required."; },
  });
  if (p.isCancel(userId)) { p.cancel("Setup cancelled."); process.exit(0); }

  const allowedUsers = String(userId)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  p.log.success(`Discord bot configured — ${allowedUsers.length} allowed user(s)`);
  return { enabled: true, allowedUsers };
}

async function setupWhatsApp(
  config: ReturnType<typeof getConfig>,
): Promise<{ enabled: boolean; allowedNumbers: string[] }> {
  printSeparator();
  printBox([
    chalk.bold.green("Step — WhatsApp (optional)"),
    "",
    chalk.gray("Connect WhatsApp to chat with your assistant there."),
    chalk.gray("Uses Baileys — no API key needed, scans a QR code."),
    "",
    chalk.white("First run: scan the QR code that appears in the terminal."),
    chalk.white("Auth is saved locally — you only scan once."),
    "",
    chalk.yellow("Warning: Only works on one WhatsApp account at a time."),
  ]);

  const wantWA = await p.confirm({
    message: "Connect WhatsApp?",
    initialValue: config.whatsapp?.enabled ?? false,
  });
  if (p.isCancel(wantWA)) { p.cancel("Setup cancelled."); process.exit(0); }
  if (!wantWA) {
    p.log.warn("WhatsApp skipped. You can add it later with: opskrew setup --section whatsapp");
    return { enabled: false, allowedNumbers: [] };
  }

  const currentNumbers = config.whatsapp?.allowedNumbers ?? [];
  const numbers = await p.text({
    message: "Your phone number(s) for allowlist (e.g. 34612345678, comma-separated):",
    placeholder: "34612345678",
    initialValue: currentNumbers.join(", "),
    validate(v) { if (!v.trim()) return "At least one phone number is required."; },
  });
  if (p.isCancel(numbers)) { p.cancel("Setup cancelled."); process.exit(0); }

  const allowedNumbers = String(numbers)
    .split(",")
    .map((s) => s.trim().replace(/[^0-9]/g, ""))
    .filter(Boolean);

  p.log.success(`WhatsApp configured — QR code will appear when you run: opskrew start`);
  return { enabled: true, allowedNumbers };
}

async function setupDashboard(
  config: ReturnType<typeof getConfig>,
): Promise<{ enabled: boolean; port: number }> {
  printSeparator();
  printBox([
    chalk.bold.cyan("Step — Web Dashboard (optional)"),
    "",
    chalk.gray("A local web UI to view conversations, memories & reminders."),
    chalk.gray("Binds to 127.0.0.1 only (not exposed to the internet)."),
    "",
    chalk.white("Access via SSH tunnel:"),
    chalk.cyan("   ssh -L 3000:127.0.0.1:3000 your-vps"),
    chalk.white("Then open: ") + chalk.cyan("http://localhost:3000"),
  ]);

  const wantDash = await p.confirm({
    message: "Enable web dashboard?",
    initialValue: config.dashboard?.enabled ?? false,
  });
  if (p.isCancel(wantDash)) { p.cancel("Setup cancelled."); process.exit(0); }
  if (!wantDash) {
    p.log.warn("Dashboard skipped. You can add it later with: opskrew setup --section dashboard");
    return { enabled: false, port: 3000 };
  }

  const portInput = await p.text({
    message: "Port number:",
    placeholder: "3000",
    initialValue: String(config.dashboard?.port ?? 3000),
    validate(v) {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1 || n > 65535) return "Enter a valid port (1-65535).";
    },
  });
  if (p.isCancel(portInput)) { p.cancel("Setup cancelled."); process.exit(0); }

  const port = parseInt(String(portInput), 10);
  p.log.success(`Dashboard will be available at http://127.0.0.1:${port}`);
  return { enabled: true, port };
}

async function setupSecurity(): Promise<void> {
  printSeparator();

  if (!isRoot()) {
    printBox([
      chalk.bold.yellow("Step — Secure your server"),
      "",
      chalk.yellow("Warning: Not running as root."),
      chalk.gray("Security hardening requires root privileges."),
      "",
      chalk.gray("To apply security settings, re-run as root:"),
      chalk.cyan("   sudo opskrew setup --section security"),
    ]);
    return;
  }

  printBox([
    chalk.bold.green("Step — Secure your server"),
    "",
    chalk.white("We'll protect your VPS with:"),
    chalk.white("• ") + chalk.cyan("Firewall") + chalk.gray(" — blocks unauthorized access"),
    chalk.white("• ") + chalk.cyan("Login protection") + chalk.gray(" — bans repeated login fails"),
    chalk.white("• ") + chalk.cyan("Memory boost") + chalk.gray(" — prevents crashes under load"),
    "",
    chalk.green("Recommended: Yes") + chalk.gray(" (safe, reversible)"),
  ]);

  const doSecurity = await p.confirm({
    message: "Apply server security hardening?",
    initialValue: true,
  });

  if (!p.isCancel(doSecurity) && doSecurity) {
    const sec = p.spinner();

    // UFW
    sec.start("Installing firewall (ufw)...");
    runCmd("apt-get install -y ufw > /dev/null 2>&1");
    runCmd("ufw --force reset");
    runCmd("ufw default deny incoming");
    runCmd("ufw default allow outgoing");
    runCmd("ufw allow ssh");
    runCmd("ufw --force enable");
    sec.stop(chalk.green("✓ Firewall configured"));

    // fail2ban
    const sec2 = p.spinner();
    sec2.start("Installing login protection (fail2ban)...");
    runCmd("apt-get install -y fail2ban > /dev/null 2>&1");
    runCmd("systemctl enable fail2ban");
    runCmd("systemctl start fail2ban");
    sec2.stop(chalk.green("✓ Login protection enabled"));

    // Swap (1GB if none exists)
    try {
      const swapInfo = execSync("swapon --show", { encoding: "utf8" }).trim();
      if (!swapInfo) {
        const sec3 = p.spinner();
        sec3.start("Creating swap memory...");
        runCmd("fallocate -l 1G /swapfile");
        runCmd("chmod 600 /swapfile");
        runCmd("mkswap /swapfile");
        runCmd("swapon /swapfile");
        runCmd("echo '/swapfile none swap sw 0 0' >> /etc/fstab");
        sec3.stop(chalk.green("✓ 1GB swap created"));
      }
    } catch {
      // Swap check failed, skip
    }

    p.log.success("Server secured — firewall active, login protection enabled");
  } else {
    p.log.warn("Security hardening skipped. You can run it later with: sudo opskrew setup --section security");
  }
}

export async function setupCommand(options: { section?: string } = {}): Promise<void> {
  printHeader();

  const vault = getVault();
  const config = getConfig();
  const alreadyConfigured = hasExistingSetup();

  let sectionsToRun: Section[] = ["auth", "personality", "telegram", "discord", "whatsapp", "dashboard", "features", "security"];

  // Handle --section flag
  if (options.section) {
    const valid: Section[] = ["auth", "personality", "telegram", "discord", "whatsapp", "dashboard", "security", "features", "all"];
    if (!valid.includes(options.section as Section)) {
      console.error(chalk.red(`✗ Unknown section: ${options.section}`));
      console.error(chalk.gray("  Valid options: auth, personality, telegram, discord, whatsapp, dashboard, security, features, all"));
      process.exit(1);
    }
    if (options.section === "all") {
      sectionsToRun = ["auth", "personality", "telegram", "discord", "whatsapp", "dashboard", "features", "security"];
    } else {
      sectionsToRun = [options.section as Section];
    }
  } else if (alreadyConfigured) {
    // Already configured — show status and ask what to change
    printCurrentStatus();

    const choice = await p.select({
      message: "opskrew is already configured. What would you like to change?",
      options: [
        { value: "auth", label: " Auth — Update your Claude token" },
        { value: "personality", label: " Personality — Name, language, tone, model" },
        { value: "telegram", label: " Telegram — Bot token and allowed users" },
        { value: "discord", label: " Discord — Bot token and allowed users" },
        { value: "whatsapp", label: " WhatsApp — Phone number allowlist" },
        { value: "dashboard", label: " Dashboard — Web UI port" },
        { value: "features", label: " Features — Web search, reminders, vision, voice..." },
        { value: "security", label: " Security — Apply server hardening" },
        { value: "all", label: "Everything — Re-run the full setup" },
      ],
    });

    if (p.isCancel(choice)) {
      p.cancel("Aborted.");
      process.exit(0);
    }

    sectionsToRun = choice === "all"
      ? ["auth", "personality", "telegram", "discord", "whatsapp", "dashboard", "features", "security"]
      : [choice as Section];
  } else {
    p.intro(chalk.bold("Welcome! Let's get opskrew running in a few quick steps."));
  }

  // Track accumulated config changes
  let personalityChanges: Partial<ReturnType<typeof getConfig>> = {};
  let telegramChanges: { allowedUsers?: string[] } = {};
  let discordChanges: { enabled: boolean; token?: string; allowedUsers: string[] } | null = null;
  let whatsappChanges: { enabled: boolean; allowedNumbers: string[] } | null = null;
  let dashboardChanges: { enabled: boolean; port: number } | null = null;
  let featuresChanges: Features | null = null;
  let autoUpdateChange: boolean | null = null;
  let selectedProvider: Provider = (config.provider ?? "anthropic") as Provider;
  let selectedCustomEndpoint: string | undefined = config.customEndpoint;

  for (const section of sectionsToRun) {
    if (section === "auth") {
      const authResult = await setupAuth(vault);
      selectedProvider = authResult.provider;
      if (authResult.customEndpoint !== undefined) {
        selectedCustomEndpoint = authResult.customEndpoint;
      }
    } else if (section === "personality") {
      personalityChanges = await setupPersonality(config, selectedProvider);
    } else if (section === "telegram") {
      telegramChanges = await setupTelegram(vault, config);
    } else if (section === "discord") {
      discordChanges = await setupDiscord(vault, config);
    } else if (section === "whatsapp") {
      whatsappChanges = await setupWhatsApp(config);
    } else if (section === "dashboard") {
      dashboardChanges = await setupDashboard(config);
    } else if (section === "features") {
      const result = await setupFeatures(config);
      featuresChanges = result.features;
      autoUpdateChange = result.autoUpdate;
    } else if (section === "security") {
      await setupSecurity();
    }
  }

  // Build discord config
  let discordConfig: Config["discord"] = config.discord;
  if (discordChanges !== null) {
    if (!discordChanges.enabled) {
      discordConfig = undefined;
    } else {
      const token = vault.get("DISCORD_BOT_TOKEN") ?? config.discord?.token ?? "";
      discordConfig = { token, allowedUsers: discordChanges.allowedUsers };
    }
  }

  // Build whatsapp config
  let whatsappConfig: Config["whatsapp"] = config.whatsapp;
  if (whatsappChanges !== null) {
    whatsappConfig = whatsappChanges.enabled
      ? { enabled: true, allowedNumbers: whatsappChanges.allowedNumbers }
      : undefined;
  }

  // Build dashboard config
  let dashboardConfig: Config["dashboard"] = config.dashboard;
  if (dashboardChanges !== null) {
    dashboardConfig = dashboardChanges.enabled
      ? { enabled: true, port: dashboardChanges.port }
      : undefined;
  }

  // Read groq key if set
  const groqApiKey = vault.get("GROQ_API_KEY") ?? config.groqApiKey;

  // Save config with any changes
  const finalConfig: Config = {
    name: String(personalityChanges.name ?? config.name),
    language: String(personalityChanges.language ?? config.language),
    tone: String(personalityChanges.tone ?? config.tone),
    model: String(personalityChanges.model ?? config.model),
    provider: selectedProvider,
    ...(selectedCustomEndpoint ? { customEndpoint: selectedCustomEndpoint } : {}),
    telegram: {
      allowedUsers: telegramChanges.allowedUsers ?? config.telegram?.allowedUsers ?? [],
    },
    ...(discordConfig ? { discord: discordConfig } : {}),
    ...(whatsappConfig ? { whatsapp: whatsappConfig } : {}),
    ...(dashboardConfig ? { dashboard: dashboardConfig } : {}),
    ...(groqApiKey ? { groqApiKey } : {}),
    features: featuresChanges ?? config.features ?? {
      webSearch: true,
      urlReader: true,
      knowledge: true,
      reminders: true,
      vision: true,
    },
    autoUpdate: autoUpdateChange !== null ? autoUpdateChange : (config.autoUpdate !== false),
  };

  saveConfig(finalConfig);

  printSeparator();
  printCompletionSummary();

  // Ask to start
  const startNow = await p.confirm({
    message: "Start opskrew now?",
    initialValue: true,
  });

  if (!p.isCancel(startNow) && startNow) {
    const starter = p.spinner();
    starter.start("Starting opskrew...");
    try {
      execSync("pm2 delete opskrew 2>/dev/null; true", { stdio: "ignore" });
      const runtimePath = "/opt/opskrew/dist/runtime.js";
      execSync(`pm2 start "${runtimePath}" --name opskrew`, { stdio: "ignore" });
      execSync("pm2 save --force", { stdio: "ignore" });
      starter.stop(chalk.green("✓ opskrew is running"));
      console.log();
      console.log(chalk.gray("  View logs:  ") + chalk.cyan("opskrew logs"));
      console.log(chalk.gray("  Status:     ") + chalk.cyan("opskrew status"));
      console.log();
    } catch {
      starter.stop(chalk.yellow("Could not start automatically"));
      console.log(chalk.gray("  Run manually: ") + chalk.cyan("opskrew start"));
      console.log();
    }
  }
}
