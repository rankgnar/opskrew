import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { chat, Message } from "../claude.js";
import { getConfig } from "../config.js";
import { getHistory, addMessage } from "../history.js";
import { loadSkills, buildSkillInstructions } from "./skills.js";
import { parseMemoryFromResponse } from "../memory.js";
import { webSearch } from "./web-search.js";
import { readUrl } from "./url-reader.js";
import { trackUsage } from "./usage.js";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  enabled: boolean;
  description: string;
  systemPrompt: string;
  skills: string[]; // skill IDs this agent uses
  tools: string[]; // tool names: webSearch, urlReader
  autoDelegate: boolean;
  triggerPatterns: string[];
}

export const AGENTS_DIR = join(homedir(), ".opskrew", "agents");

export function ensureAgentsDir(): void {
  mkdirSync(AGENTS_DIR, { recursive: true });
}

export function loadAgents(): Agent[] {
  ensureAgentsDir();
  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(AGENTS_DIR, f), "utf-8")) as Agent;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Agent[];
}

export function getAgent(id: string): Agent | null {
  const path = join(AGENTS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Agent;
  } catch {
    return null;
  }
}

export function addAgent(agent: Agent): void {
  ensureAgentsDir();
  const safe: Agent = {
    id: agent.id.replace(/[^a-z0-9-_]/gi, "-").slice(0, 64),
    name: String(agent.name).slice(0, 64),
    emoji: String(agent.emoji || "🤖").slice(0, 8),
    enabled: agent.enabled !== false,
    description: String(agent.description || "").slice(0, 256),
    systemPrompt: String(agent.systemPrompt || "").slice(0, 2000),
    skills: Array.isArray(agent.skills) ? agent.skills.map((s) => String(s).slice(0, 64)) : [],
    tools: Array.isArray(agent.tools) ? agent.tools.map((t) => String(t).slice(0, 64)) : [],
    autoDelegate: agent.autoDelegate !== false,
    triggerPatterns: Array.isArray(agent.triggerPatterns)
      ? agent.triggerPatterns.map((p) => String(p).slice(0, 128))
      : [],
  };
  writeFileSync(join(AGENTS_DIR, `${safe.id}.json`), JSON.stringify(safe, null, 2), "utf-8");
}

export function removeAgent(id: string): void {
  const path = join(AGENTS_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`Agent "${id}" not found`);
  unlinkSync(path);
}

export function toggleAgent(id: string, enabled: boolean): void {
  const path = join(AGENTS_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`Agent "${id}" not found`);
  const agent = JSON.parse(readFileSync(path, "utf-8")) as Agent;
  agent.enabled = enabled;
  writeFileSync(path, JSON.stringify(agent, null, 2), "utf-8");
}

/**
 * Check if the message should be auto-delegated to a team agent.
 * Returns the first matching enabled agent with autoDelegate=true, or null.
 */
export function findDelegateAgent(message: string): Agent | null {
  const agents = loadAgents().filter((a) => a.enabled && a.autoDelegate);
  const lowerMsg = message.toLowerCase();
  for (const agent of agents) {
    if (agent.triggerPatterns.some((p) => lowerMsg.includes(p.toLowerCase()))) {
      return agent;
    }
  }
  return null;
}

/**
 * Execute a delegated task using a specific agent.
 * The agent gets its own history prefixed with "agent:{id}:{chatId}".
 */
export async function delegateToAgent(agent: Agent, message: string, chatId: string): Promise<string> {
  const config = getConfig();
  const agentChatId = `agent:${agent.id}:${chatId}`;

  // Build agent-specific system prompt with behavior rules
  const config2 = getConfig();
  let systemPrompt = `Language: ${config2.language}\n\n${agent.systemPrompt}`;

  // Inject agent's own skills (always load assigned skills, regardless of message triggers)
  if (agent.skills && agent.skills.length > 0) {
    const activeSkills = loadSkills().filter((s) => s.enabled && agent.skills.includes(s.id));
    const skillInstructions = buildSkillInstructions(activeSkills);
    if (skillInstructions) {
      systemPrompt += skillInstructions;
    }
  }

  // Inject tool instructions based on agent's tools
  const toolInstructions: string[] = [];
  if (agent.tools.includes("webSearch") && config.features.webSearch) {
    toolInstructions.push(
      "When you need current information, include [SEARCH: your search query] in your response.",
    );
  }
  if (agent.tools.includes("urlReader") && config.features.urlReader) {
    toolInstructions.push(
      "When you need to read a URL, include [READ_URL: https://...] in your response.",
    );
  }
  if (toolInstructions.length > 0) {
    systemPrompt += `\n\n## Available Tools\nThe system will execute these tags automatically:\n${toolInstructions.join("\n")}`;
  }

  // Get agent's own history
  const history = getHistory(agentChatId);
  const messages: Message[] = [...history, { role: "user" as const, content: message }];

  // Call Claude with agent's system prompt
  const result = await chat(messages, systemPrompt, config.model);
  trackUsage(agentChatId, result.usage.input_tokens, result.usage.output_tokens, config.model);

  let reply = parseMemoryFromResponse(result.text);

  // Process SEARCH tag if agent has webSearch tool
  if (agent.tools.includes("webSearch") && config.features.webSearch) {
    const searchRegex = /\[SEARCH:\s*([^\]]+)\]/i;
    const searchMatch = searchRegex.exec(reply);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      reply = reply.replace(searchRegex, "").trim();
      console.log(`[team:${agent.id}] Searching: "${query}"`);
      try {
        const searchResults = await webSearch(query);
        const messagesWithResults: Message[] = [
          ...messages,
          { role: "assistant" as const, content: result.text },
          {
            role: "user" as const,
            content: `Here are the search results:\n\n${searchResults}\n\nPlease provide your response based on these results.`,
          },
        ];
        const secondResult = await chat(messagesWithResults, systemPrompt, config.model);
        trackUsage(agentChatId, secondResult.usage.input_tokens, secondResult.usage.output_tokens, config.model);
        reply = parseMemoryFromResponse(secondResult.text);
      } catch (err) {
        console.error(`[team:${agent.id}] Search error:`, err);
      }
    }
  }

  // Process READ_URL tag if agent has urlReader tool
  if (agent.tools.includes("urlReader") && config.features.urlReader) {
    const urlRegex = /\[READ_URL:\s*(https?:\/\/[^\]]+)\]/i;
    const urlMatch = urlRegex.exec(reply);
    if (urlMatch) {
      const targetUrl = urlMatch[1].trim();
      reply = reply.replace(urlRegex, "").trim();
      console.log(`[team:${agent.id}] Fetching URL: ${targetUrl}`);
      try {
        const urlContent = await readUrl(targetUrl);
        const messagesWithContent: Message[] = [
          ...messages,
          { role: "assistant" as const, content: result.text },
          {
            role: "user" as const,
            content: `Here is the URL content:\n\n${urlContent}\n\nPlease provide your response based on this content.`,
          },
        ];
        const secondResult = await chat(messagesWithContent, systemPrompt, config.model);
        trackUsage(agentChatId, secondResult.usage.input_tokens, secondResult.usage.output_tokens, config.model);
        reply = parseMemoryFromResponse(secondResult.text);
      } catch (err) {
        console.error(`[team:${agent.id}] URL error:`, err);
      }
    }
  }

  // Save to agent history
  addMessage(agentChatId, "user", message);
  addMessage(agentChatId, "assistant", reply);

  return reply || result.text;
}
