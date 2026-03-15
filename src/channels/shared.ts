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
import { emailRead, emailSend, emailSearch } from "../tools/email.js";
import { calendarToday, calendarWeek, calendarAdd, calendarSearch } from "../tools/calendar.js";
import {
  githubRepos,
  githubIssues,
  githubPRs,
  githubCreateIssue,
  githubNotifications,
} from "../tools/github.js";

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

  // Step 5: Email
  if (features.email) {
    // EMAIL_READ
    const emailReadRegex = /\[EMAIL_READ(?::\s*(\d+))?\]/i;
    const emailReadMatch = emailReadRegex.exec(reply);
    if (emailReadMatch) {
      const n = parseInt(emailReadMatch[1] ?? "5", 10);
      reply = reply.replace(emailReadRegex, "").trim();
      console.log(`[shared] Reading ${n} emails`);
      const result = await emailRead(n);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `Email inbox results:\n\n${result}\n\nPlease summarize and present these emails to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // EMAIL_SEND
    const emailSendRegex = /\[EMAIL_SEND:\s*([^\]|]+)\|([^\]|]+)\|([^\]]+)\]/i;
    const emailSendMatch = emailSendRegex.exec(reply);
    if (emailSendMatch) {
      const to = emailSendMatch[1].trim();
      const subject = emailSendMatch[2].trim();
      const body = emailSendMatch[3].trim();
      reply = reply.replace(emailSendRegex, "").trim();
      console.log(`[shared] Sending email to: ${to}`);
      const result = await emailSend(to, subject, body);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `Email send result: ${result}` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // EMAIL_SEARCH
    const emailSearchRegex = /\[EMAIL_SEARCH:\s*([^\]]+)\]/i;
    const emailSearchMatch = emailSearchRegex.exec(reply);
    if (emailSearchMatch) {
      const query = emailSearchMatch[1].trim();
      reply = reply.replace(emailSearchRegex, "").trim();
      console.log(`[shared] Searching emails: "${query}"`);
      const result = await emailSearch(query);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `Email search results:\n\n${result}\n\nPlease present these results to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }
  }

  // Step 6: Calendar
  if (features.calendar) {
    // CALENDAR_TODAY
    if (/\[CALENDAR_TODAY\]/i.test(reply)) {
      reply = reply.replace(/\[CALENDAR_TODAY\]/i, "").trim();
      console.log(`[shared] Fetching today's calendar events`);
      const result = await calendarToday();
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `Calendar events for today:\n\n${result}\n\nPlease present these events to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // CALENDAR_WEEK
    if (/\[CALENDAR_WEEK\]/i.test(reply)) {
      reply = reply.replace(/\[CALENDAR_WEEK\]/i, "").trim();
      console.log(`[shared] Fetching this week's calendar events`);
      const result = await calendarWeek();
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `Calendar events for this week:\n\n${result}\n\nPlease present these events to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // CALENDAR_ADD
    const calAddRegex = /\[CALENDAR_ADD:\s*([^\]|]+)\|([^\]|]+)\|([^\]]+)\]/i;
    const calAddMatch = calAddRegex.exec(reply);
    if (calAddMatch) {
      const title = calAddMatch[1].trim();
      const dateStr = calAddMatch[2].trim();
      const duration = parseInt(calAddMatch[3].trim(), 10) || 60;
      reply = reply.replace(calAddRegex, "").trim();
      console.log(`[shared] Adding calendar event: "${title}"`);
      const result = await calendarAdd(title, dateStr, duration);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `Calendar event creation result: ${result}` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // CALENDAR_SEARCH
    const calSearchRegex = /\[CALENDAR_SEARCH:\s*([^\]]+)\]/i;
    const calSearchMatch = calSearchRegex.exec(reply);
    if (calSearchMatch) {
      const query = calSearchMatch[1].trim();
      reply = reply.replace(calSearchRegex, "").trim();
      console.log(`[shared] Searching calendar: "${query}"`);
      const result = await calendarSearch(query);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `Calendar search results:\n\n${result}\n\nPlease present these results to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }
  }

  // Step 7: GitHub
  if (features.github) {
    // GITHUB_REPOS
    if (/\[GITHUB_REPOS\]/i.test(reply)) {
      reply = reply.replace(/\[GITHUB_REPOS\]/i, "").trim();
      console.log(`[shared] Fetching GitHub repos`);
      const result = await githubRepos();
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `GitHub repositories:\n\n${result}\n\nPlease present this list to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // GITHUB_ISSUES
    const ghIssuesRegex = /\[GITHUB_ISSUES:\s*([^\]]+)\]/i;
    const ghIssuesMatch = ghIssuesRegex.exec(reply);
    if (ghIssuesMatch) {
      const ownerRepo = ghIssuesMatch[1].trim();
      reply = reply.replace(ghIssuesRegex, "").trim();
      console.log(`[shared] Fetching GitHub issues for: ${ownerRepo}`);
      const result = await githubIssues(ownerRepo);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `GitHub issues for ${ownerRepo}:\n\n${result}\n\nPlease present these issues to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // GITHUB_PR
    const ghPRRegex = /\[GITHUB_PR:\s*([^\]]+)\]/i;
    const ghPRMatch = ghPRRegex.exec(reply);
    if (ghPRMatch) {
      const ownerRepo = ghPRMatch[1].trim();
      reply = reply.replace(ghPRRegex, "").trim();
      console.log(`[shared] Fetching GitHub PRs for: ${ownerRepo}`);
      const result = await githubPRs(ownerRepo);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `GitHub pull requests for ${ownerRepo}:\n\n${result}\n\nPlease present these PRs to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // GITHUB_CREATE_ISSUE
    const ghCreateIssueRegex = /\[GITHUB_CREATE_ISSUE:\s*([^\]|]+)\|([^\]|]+)\|([^\]]+)\]/i;
    const ghCreateIssueMatch = ghCreateIssueRegex.exec(reply);
    if (ghCreateIssueMatch) {
      const ownerRepo = ghCreateIssueMatch[1].trim();
      const title = ghCreateIssueMatch[2].trim();
      const body = ghCreateIssueMatch[3].trim();
      reply = reply.replace(ghCreateIssueRegex, "").trim();
      console.log(`[shared] Creating GitHub issue in: ${ownerRepo}`);
      const result = await githubCreateIssue(ownerRepo, title, body);
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `GitHub issue creation result: ${result}` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
    }

    // GITHUB_NOTIFICATIONS
    if (/\[GITHUB_NOTIFICATIONS\]/i.test(reply)) {
      reply = reply.replace(/\[GITHUB_NOTIFICATIONS\]/i, "").trim();
      console.log(`[shared] Fetching GitHub notifications`);
      const result = await githubNotifications();
      const toolMessages: Message[] = [
        ...messages,
        { role: "assistant" as const, content: rawReply },
        { role: "user" as const, content: `GitHub notifications:\n\n${result}\n\nPlease present these notifications to the user.` },
      ];
      const r = await chat(toolMessages, systemPrompt, model);
      trackUsage(chatId, r.usage.input_tokens, r.usage.output_tokens, model);
      reply = parseMemoryFromResponse(r.text);
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
