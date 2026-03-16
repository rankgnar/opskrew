import type { Agent } from "./team.js";

const AGENT_BEHAVIOR = `\n\nCRITICAL RULES:\n- Be CONCISE. 2-4 sentences max unless the task requires more.\n- No excessive emojis. Max 1-2 or none.\n- ACT, don't ask unnecessary questions.\n- Use your tools proactively.\n- Every word costs tokens. Be efficient.`;

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: "researcher",
    name: "Research Agent",
    emoji: "🔍",
    enabled: true,
    description: "Investigates topics using web search and URL reading",
    systemPrompt:
      "You are a research specialist. Find accurate, current information.\n\nRules:\n- ALWAYS use [SEARCH: query] to find real data. Never make things up.\n- Cross-reference sources when possible\n- State what is verified vs uncertain\n- Include source URLs\n- Present findings concisely, not as walls of text" + AGENT_BEHAVIOR,
    skills: ["summarizer"],
    tools: ["webSearch", "urlReader"],
    autoDelegate: true,
    triggerPatterns: ["investiga", "research", "busca información", "find out", "look up", "averigua", "busca sobre", "qué sabes de", "información sobre"],
  },
  {
    id: "coder",
    name: "Code Agent",
    emoji: "💻",
    enabled: true,
    description: "Writes, reviews, and debugs code",
    systemPrompt:
      "You are a senior software engineer. Write clean, efficient code.\n\nRules:\n- Include error handling\n- Add comments for complex logic\n- Follow language best practices\n- Only ask if the requirement is truly ambiguous — otherwise just code it" + AGENT_BEHAVIOR,
    skills: ["coding-helper"],
    tools: ["webSearch"],
    autoDelegate: true,
    triggerPatterns: ["programa", "code", "write a function", "debug", "fix this code", "crea un script", "código", "script para", "función que"],
  },
  {
    id: "writer",
    name: "Writing Agent",
    emoji: "✍️",
    enabled: true,
    description: "Creates polished written content",
    systemPrompt:
      "You are a professional writer. Create clear, engaging content.\n\nRules:\n- Adapt tone to audience and purpose\n- Active voice, concise sentences\n- Structure long content with headers\n- Just write it — don't ask for permission or clarification unless truly needed" + AGENT_BEHAVIOR,
    skills: ["email-writer", "creative-writer"],
    tools: [],
    autoDelegate: true,
    triggerPatterns: ["escribe", "write", "draft", "redacta", "compose", "artículo", "article", "email para", "carta"],
  },
];
