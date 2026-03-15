import { getConfig } from "../config.js";
import { chat, Message, TextContent, ImageContent } from "../claude.js";
import { buildSystemPrompt } from "../personality.js";
import { getHistory, addMessage } from "../history.js";
import { parseMemoryFromResponse } from "../memory.js";
import { webSearch } from "../tools/web-search.js";
import { readUrl } from "../tools/url-reader.js";
import { parseRemindersFromResponse } from "../tools/reminders.js";
import { trackUsage } from "../tools/usage.js";
import { checkAndSummarize } from "../tools/auto-summary.js";
import { getActiveSkills } from "../tools/skills.js";
import { findDelegateAgent, delegateToAgent } from "../tools/team.js";

/**
 * Process Claude's response:
 * 1. Parse and save [MEMORY: ...] tags
 * 2. Parse [REMINDER: ...] tags (save to DB)
 * 3. Parse [SEARCH: ...] tags — execute and re-call Claude
 * 4. Parse [READ_URL: ...] tags — fetch and re-call Claude
 * Returns the cleaned final response.
 */
export async function processResponse(
  rawReply: string,
  messages: Message[],
  systemPrompt: string,
  chatId: string,
  model: string,
): Promise<string> {
  const config = getConfig();
  const features = config.features;

  // Step 1: Memory (always)
  let reply = parseMemoryFromResponse(rawReply);

  // Step 2: Reminders
  if (features.reminders) {
    const { cleanText } = parseRemindersFromResponse(reply, chatId);
    reply = cleanText;
  }

  // Step 3: Search
  if (features.webSearch) {
    const searchRegex = /\[SEARCH:\s*([^\]]+)\]/i;
    const searchMatch = searchRegex.exec(reply);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      reply = reply.replace(searchRegex, "").trim();

      console.log(`[shared] Executing search: "${query}"`);
      const searchResults = await webSearch(query);

      const messagesWithResults: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        {
          role: "user" as const,
          content: `Here are the search results for your query:\n\n${searchResults}\n\nPlease provide your response based on these results.`,
        },
      ];

      const secondResult = await chat(messagesWithResults, systemPrompt, model);
      trackUsage(chatId, secondResult.usage.input_tokens, secondResult.usage.output_tokens, model);
      reply = parseMemoryFromResponse(secondResult.text);
      if (features.reminders) {
        const { cleanText } = parseRemindersFromResponse(reply, chatId);
        reply = cleanText;
      }
    }
  }

  // Step 4: Read URL
  if (features.urlReader) {
    const urlRegex = /\[READ_URL:\s*(https?:\/\/[^\]]+)\]/i;
    const urlMatch = urlRegex.exec(reply);
    if (urlMatch) {
      const targetUrl = urlMatch[1].trim();
      reply = reply.replace(urlRegex, "").trim();

      console.log(`[shared] Fetching URL: ${targetUrl}`);
      const urlContent = await readUrl(targetUrl);

      const messagesWithContent: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        {
          role: "user" as const,
          content: `Here is the content from the URL:\n\n${urlContent}\n\nPlease provide your response based on this content.`,
        },
      ];

      const secondResult = await chat(messagesWithContent, systemPrompt, model);
      trackUsage(chatId, secondResult.usage.input_tokens, secondResult.usage.output_tokens, model);
      reply = parseMemoryFromResponse(secondResult.text);
      if (features.reminders) {
        const { cleanText } = parseRemindersFromResponse(reply, chatId);
        reply = cleanText;
      }
    }
  }

  return reply || rawReply;
}

export interface ProcessMessageOpts {
  chatId: string;
  text: string;
  imageBase64?: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  sendReply: (text: string) => Promise<void>;
}

/**
 * Shared message processing pipeline for all channels.
 * 1. Auto-summarize if history is too long
 * 2. Get conversation history
 * 3. Build system prompt (with personality)
 * 4. Call Claude
 * 5. Parse tags (MEMORY, SEARCH, READ_URL, REMINDER)
 * 6. Track token usage
 * 7. Save messages to history
 * 8. Send cleaned response via sendReply
 */
export async function processMessage(opts: ProcessMessageOpts): Promise<void> {
  const { chatId, text, imageBase64, imageMediaType, sendReply } = opts;
  const config = getConfig();

  // Auto-summarize if enabled and history is getting long
  if (config.features.autoSummary) {
    await checkAndSummarize(chatId);
  }

  // Auto-delegation: check if message should be delegated to a team agent
  if (config.features.teamAutoDelegate !== false) {
    const agent = findDelegateAgent(text);
    if (agent) {
      console.log(`[shared] Auto-delegating to agent: ${agent.id}`);
      try {
        const agentReply = await delegateToAgent(agent, text, chatId);
        await sendReply(`${agent.emoji} **${agent.name}:**\n\n${agentReply}`);
        return;
      } catch (err) {
        console.error(`[shared] Agent delegation error:`, err);
        // Fall through to main assistant on error
      }
    }
  }

  const history = getHistory(chatId);
  const activeSkills = getActiveSkills(text);
  const systemPrompt = buildSystemPrompt(chatId, activeSkills);

  let userContent: string | Array<TextContent | ImageContent>;

  if (imageBase64) {
    userContent = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: imageMediaType ?? "image/jpeg",
          data: imageBase64,
        },
      },
      { type: "text", text },
    ];
  } else {
    userContent = text;
  }

  const messages: Message[] = [...history, { role: "user" as const, content: userContent }];
  const result = await chat(messages, systemPrompt, config.model);
  trackUsage(chatId, result.usage.input_tokens, result.usage.output_tokens, config.model);

  const cleanReply = await processResponse(result.text, messages, systemPrompt, chatId, config.model);

  addMessage(chatId, "user", imageBase64 ? `[Image] ${text}` : text);
  addMessage(chatId, "assistant", cleanReply);

  await sendReply(cleanReply);
}
