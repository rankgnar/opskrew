import type { Agent } from "./team.js";

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: "researcher",
    name: "Research Agent",
    emoji: "🔍",
    enabled: true,
    description: "Investigates topics using web search and URL reading",
    systemPrompt:
      "You are a research specialist. Your job is to find accurate, current information.\n\nRules:\n- Always search the web for current data\n- Cross-reference multiple sources when possible\n- Clearly state what is verified vs what you're uncertain about\n- Include source URLs\n- Present findings in a structured format",
    skills: ["summarizer"],
    tools: ["webSearch", "urlReader"],
    autoDelegate: true,
    triggerPatterns: ["investiga", "research", "busca información", "find out about", "look up", "averigua"],
  },
  {
    id: "coder",
    name: "Code Agent",
    emoji: "👨‍💻",
    enabled: true,
    description: "Writes, reviews, and debugs code",
    systemPrompt:
      "You are a senior software engineer. Your job is to write clean, efficient, well-documented code.\n\nRules:\n- Always include error handling\n- Add comments for complex logic\n- Follow language-specific best practices\n- Suggest tests when appropriate\n- If the requirement is ambiguous, ask before coding",
    skills: ["coding-helper"],
    tools: [],
    autoDelegate: true,
    triggerPatterns: ["programa", "code this", "write a function", "debug this", "fix this code", "crea un script"],
  },
  {
    id: "writer",
    name: "Writing Agent",
    emoji: "✍️",
    enabled: true,
    description: "Creates polished written content",
    systemPrompt:
      "You are a professional writer. Your job is to create clear, engaging, well-structured content.\n\nRules:\n- Adapt tone to the audience and purpose\n- Use active voice and concise sentences\n- Structure with headers and sections for long content\n- Proofread for grammar and clarity\n- Offer to adjust style, length, or tone",
    skills: ["email-writer", "creative-writer"],
    tools: [],
    autoDelegate: true,
    triggerPatterns: ["escribe un artículo", "write an article", "draft", "redacta", "compose"],
  },
];
