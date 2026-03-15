import { getVault } from "./vault.js";
import { getConfig } from "./config.js";

// ── Provider definitions ──────────────────────────────────────────────────────

export interface ProviderModel {
  id: string;
  name: string;
}

export interface ProviderConfig {
  name: string;
  endpoint: string;
  format: "anthropic" | "openai";
  authHeader: string;
  authPrefix: string;
  extraHeaders?: (token: string) => Record<string, string>;
  models: ProviderModel[];
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    name: "Anthropic (Claude)",
    endpoint: "https://api.anthropic.com/v1/messages",
    format: "anthropic",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    extraHeaders: (_token: string) => ({
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
      "user-agent": "opskrew/1.0.0",
      "x-app": "cli",
    }),
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (recommended)" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6 (most powerful)" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (fastest)" },
    ],
  },
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    models: [
      { id: "gpt-4o", name: "GPT-4o (recommended)" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini (fastest)" },
      { id: "o3", name: "o3 (reasoning)" },
      { id: "o4-mini", name: "o4-mini (reasoning, fast)" },
    ],
  },
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3 (recommended)" },
      { id: "deepseek-reasoner", name: "DeepSeek R1 (reasoning)" },
    ],
  },
  google: {
    name: "Google (Gemini)",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/chat/completions",
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (recommended)" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (most powerful)" },
    ],
  },
  openrouter: {
    name: "OpenRouter (multi-model)",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    extraHeaders: (_token: string) => ({
      "HTTP-Referer": "https://github.com/rankgnar/opskrew",
      "X-Title": "opskrew",
    }),
    models: [
      { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6 via OpenRouter" },
      { id: "openai/gpt-4o", name: "GPT-4o via OpenRouter" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3 via OpenRouter" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash via OpenRouter" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick via OpenRouter" },
    ],
  },
  mistral: {
    name: "Mistral AI",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large (recommended)" },
      { id: "mistral-small-latest", name: "Mistral Small (fastest)" },
    ],
  },
  xai: {
    name: "xAI (Grok)",
    endpoint: "https://api.x.ai/v1/chat/completions",
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    models: [
      { id: "grok-3", name: "Grok 3 (recommended)" },
      { id: "grok-3-mini", name: "Grok 3 Mini (fastest)" },
    ],
  },
  groq: {
    name: "Groq (fast inference)",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (recommended)" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B (fastest)" },
    ],
  },
  custom: {
    name: "Custom (OpenAI-compatible)",
    endpoint: "", // User provides via config.customEndpoint
    format: "openai",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    models: [], // User provides model name via config.model
  },
};

// ── Backwards-compat MODELS export ───────────────────────────────────────────

export const MODELS: Record<string, ProviderModel[]> = Object.fromEntries(
  Object.entries(PROVIDERS).map(([k, v]) => [k, v.models]),
);

export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_PROVIDER = "anthropic";

// ── Message types ─────────────────────────────────────────────────────────────

export interface TextContent {
  type: "text";
  text: string;
}

/** Anthropic-style image content block */
export interface ImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
}

export type MessageContent = string | Array<TextContent | ImageContent>;

export interface Message {
  role: "user" | "assistant";
  content: MessageContent;
}

export interface ChatUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ChatResult {
  text: string;
  usage: ChatUsage;
}

// ── Format conversion ─────────────────────────────────────────────────────────

/** OpenAI-style content block */
type OpenAiContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Convert Anthropic-style MessageContent to OpenAI-compatible content.
 * - Plain strings pass through as-is.
 * - Text-only arrays collapse to a plain string.
 * - Arrays with images use OpenAI `image_url` blocks.
 */
function toOpenAiContent(content: MessageContent): string | OpenAiContentBlock[] {
  if (typeof content === "string") return content;

  const hasImages = content.some((b) => b.type === "image");
  if (!hasImages) {
    return content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  }

  return content.map((block): OpenAiContentBlock => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    // Anthropic image → OpenAI image_url (data URI)
    const img = block as ImageContent;
    return {
      type: "image_url",
      image_url: { url: `data:${img.source.media_type};base64,${img.source.data}` },
    };
  });
}

/** Build OpenAI messages array from Anthropic-style messages + system prompt */
function toOpenAiMessages(
  messages: Message[],
  systemPrompt: string,
): Array<{ role: string; content: string | OpenAiContentBlock[] }> {
  const result: Array<{ role: string; content: string | OpenAiContentBlock[] }> = [];
  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }
  for (const m of messages) {
    result.push({ role: m.role, content: toOpenAiContent(m.content) });
  }
  return result;
}

/** Normalize Anthropic messages (pass-through) */
function normalizeMessages(
  messages: Message[],
): Array<{ role: "user" | "assistant"; content: MessageContent }> {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

// ── Token vault keys per provider ─────────────────────────────────────────────

export function vaultKeyForProvider(provider: string): string {
  switch (provider) {
    case "anthropic":  return "CLAUDE_TOKEN";
    case "openai":     return "OPENAI_TOKEN";
    case "deepseek":   return "DEEPSEEK_TOKEN";
    case "google":     return "GOOGLE_TOKEN";
    case "openrouter": return "OPENROUTER_TOKEN";
    case "mistral":    return "MISTRAL_TOKEN";
    case "xai":        return "XAI_TOKEN";
    case "groq":       return "GROQ_LLM_TOKEN"; // distinct from GROQ_API_KEY (Whisper)
    case "custom":     return "CUSTOM_TOKEN";
    default:           return "CLAUDE_TOKEN";
  }
}

// ── chat() ────────────────────────────────────────────────────────────────────

export async function chat(
  messages: Message[],
  systemPrompt: string,
  model: string = DEFAULT_MODEL,
  providerOverride?: string,
): Promise<ChatResult> {
  const config = getConfig();
  const provider = providerOverride ?? config.provider ?? DEFAULT_PROVIDER;
  const vault = getVault();

  const vaultKey = vaultKeyForProvider(provider);
  const token = vault.get(vaultKey);
  if (!token) {
    throw new Error(`No ${provider} token configured. Run: opskrew setup`);
  }

  const providerDef = PROVIDERS[provider] ?? PROVIDERS.anthropic;

  // For custom provider, use user-supplied endpoint from config
  let endpoint = providerDef.endpoint;
  if (provider === "custom" && config.customEndpoint) {
    endpoint = config.customEndpoint;
  }
  if (!endpoint) {
    throw new Error(`No endpoint configured for provider "${provider}". Run: opskrew setup`);
  }

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [providerDef.authHeader]: `${providerDef.authPrefix} ${token}`,
    "user-agent": "opskrew/1.0.0",
  };
  if (providerDef.extraHeaders) {
    Object.assign(headers, providerDef.extraHeaders(token));
  }

  if (providerDef.format === "anthropic") {
    // ── Anthropic format ─────────────────────────────────────────────────────
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: normalizeMessages(messages),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      content: Array<{ text: string }>;
      usage?: ChatUsage;
    };
    return {
      text: data.content[0].text,
      usage: data.usage ?? { input_tokens: 0, output_tokens: 0 },
    };
  } else {
    // ── OpenAI-compatible format ──────────────────────────────────────────────
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: toOpenAiMessages(messages, systemPrompt),
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${provider} API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      text: data.choices[0].message.content,
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

// ── validateToken() ───────────────────────────────────────────────────────────

export async function validateToken(
  token: string,
  provider: string = DEFAULT_PROVIDER,
  customEndpoint?: string,
): Promise<boolean> {
  try {
    const providerDef = PROVIDERS[provider] ?? PROVIDERS.anthropic;

    let endpoint = providerDef.endpoint;
    if (provider === "custom" && customEndpoint) {
      endpoint = customEndpoint;
    }
    if (!endpoint) return false;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      [providerDef.authHeader]: `${providerDef.authPrefix} ${token}`,
      "user-agent": "opskrew/1.0.0",
    };
    if (providerDef.extraHeaders) {
      Object.assign(headers, providerDef.extraHeaders(token));
    }

    if (providerDef.format === "anthropic") {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 5,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      return res.ok;
    } else {
      // OpenAI-compatible — use first available model or a sensible default
      const firstModel = providerDef.models[0]?.id ?? "gpt-4o";
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: firstModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
      });
      return res.ok;
    }
  } catch {
    return false;
  }
}
