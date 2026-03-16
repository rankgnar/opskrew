import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { DATA_DIR } from "./db.js";

const CONFIG_PATH = join(DATA_DIR, "config.json");

export interface Features {
  webSearch: boolean;
  urlReader: boolean;
  knowledge: boolean;
  reminders: boolean;
  vision: boolean;
  autoSummary: boolean;
  teamAutoDelegate: boolean;
  email?: boolean;
  calendar?: boolean;
  github?: boolean;
  skills?: boolean;
}

export interface Config {
  name: string;
  language: string;
  tone: string;
  model: string;
  provider?: string; // "anthropic" | "openai" | "deepseek" | "google" | "openrouter" | "mistral" | "xai" | "groq" | "custom"
  customEndpoint?: string; // Only for "custom" provider
  telegram: {
    botToken?: string; // vault key reference
    allowedUsers: string[];
  };
  discord?: {
    token: string;
    allowedUsers: string[]; // Discord user IDs
  };
  whatsapp?: {
    enabled: boolean;
    allowedNumbers: string[]; // e.g. ["34612345678"]
  };
  dashboard?: {
    enabled: boolean;
    port: number; // default 3000
  };
  groqApiKey?: string; // optional, for voice transcription
  voiceEnabled?: boolean; // when false, disables voice even if groqApiKey is set
  features: Features;
  autoUpdate?: boolean; // default true
}

const DEFAULT_FEATURES: Features = {
  webSearch: true,
  urlReader: true,
  knowledge: true,
  reminders: true,
  vision: true,
  autoSummary: true,
  teamAutoDelegate: true,
};

const DEFAULT_CONFIG: Config = {
  name: "Opskrew",
  language: "English",
  tone: "helpful and friendly",
  model: "claude-sonnet-4-6",
  telegram: {
    allowedUsers: [],
  },
  features: { ...DEFAULT_FEATURES },
};

export function getConfig(): Config {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      features: { ...DEFAULT_FEATURES, ...(parsed.features ?? {}) },
    } as Config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}
