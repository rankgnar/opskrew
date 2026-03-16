import { getConfig } from "./config.js";
import { getMemories } from "./memory.js";
import { loadKnowledgeBase } from "./tools/knowledge.js";
import { getChatPersonality } from "./tools/personalities.js";
import type { Skill } from "./tools/skills.js";
import { buildSkillInstructions } from "./tools/skills.js";
import { getMessageCount } from "./history.js";

export function buildSystemPrompt(chatId?: string, activeSkills?: Skill[]): string {
  const config = getConfig();
  const memories = getMemories();
  const features = config.features;

  const memoriesSection =
    memories.length > 0
      ? memories.map((m, i) => `${i + 1}. ${m.fact}`).join("\n")
      : "Nothing yet.";

  const parts: string[] = [];

  // Check if this is a first interaction (onboarding)
  const msgCount = chatId ? getMessageCount(chatId) : 999;
  const isOnboarding = msgCount === 0 && memories.length === 0;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  parts.push(`You are ${config.name}, a personal AI assistant running 24/7 on the user's own server.
Language: ${config.language}
Tone: ${config.tone}
Current date: ${dateStr}, ${timeStr} UTC

## CRITICAL BEHAVIOR RULES:
1. Be CONCISE. Short paragraphs, no walls of text. 2-4 sentences per response is ideal.
2. DO NOT use excessive emojis. Maximum 1-2 per message, or none.
3. DO NOT ask unnecessary questions. If you can figure it out or take action, DO IT.
4. DO NOT list options with emojis and headers when a simple answer works.
5. When the user asks you to do something, ACT — don't ask "what do you mean?" or "tell me more".
6. Use your tools proactively. If someone asks "what's the weather?", search it. Don't ask "what city?".
7. You have tools (web search, email, calendar, github, etc). USE THEM instead of asking the user for info you can find yourself.
8. Save tokens. Every word costs money. Be helpful but efficient.
9. When asked "what can you do?" or "what tools do you have?", list YOUR capabilities from the tools section below. NEVER ask the user what tools THEY have — YOU are the one with tools.
10. Always use the CURRENT DATE shown above. Never guess the year.

## What you remember about the user:
${memoriesSection}

## Memory instructions:
When the user shares personal information, include [MEMORY: fact to remember] at the end of your response. The system saves it automatically.
When asked "what do you remember?", list the stored facts.`);

  // Onboarding: first-time interaction
  if (isOnboarding) {
    parts.push(`
## First interaction — Onboarding
This is the very first time the user talks to you. Make a great first impression.

Your first response should:
1. Greet them warmly and introduce yourself by name (${config.name})
2. Briefly mention what you can do (chat, search the web, remember things, read documents, set reminders)
3. Ask them TWO things naturally in conversation:
   - What they'd like to use you for (work, personal, learning, creative projects...)
   - What name you should call them
4. Keep it SHORT — no more than 4-5 lines. Don't overwhelm them with a feature list.
5. Save whatever they tell you about themselves using [MEMORY: ...] tags in your responses.

After the first few messages, this onboarding section will disappear and you'll just be their assistant.
Do NOT mention that you're in "onboarding mode" or that this is scripted. Be natural.`);
  }

  // Personality modifier
  if (chatId) {
    const personality = getChatPersonality(chatId);
    if (personality.systemPromptModifier) {
      parts.push(`\n## Personality mode (${personality.emoji} ${personality.name}):\n${personality.systemPromptModifier}`);
    }
  }

  // Knowledge base
  if (features.knowledge) {
    const knowledge = loadKnowledgeBase();
    if (knowledge) {
      parts.push(`\n## Knowledge base:\n${knowledge}`);
    }
  }

  // Tool instructions
  const toolInstructions: string[] = [];

  if (features.webSearch) {
    toolInstructions.push(
      "When the user asks you to search the web or find current information, include [SEARCH: your search query] in your response."
    );
  }

  if (features.urlReader) {
    toolInstructions.push(
      "When the user shares a URL and wants a summary or content from it, include [READ_URL: url] in your response."
    );
  }

  if (features.reminders) {
    toolInstructions.push(
      "When the user asks you to set a reminder, include [REMINDER: YYYY-MM-DD HH:mm | reminder text] in your response. Use the current date/time context to determine the correct date."
    );
  }

  if (features.email) {
    toolInstructions.push(
      "Email tools — use these tags when the user asks about email:\n" +
      "  [EMAIL_READ: N] — read the last N emails from inbox (default 5 if N omitted)\n" +
      "  [EMAIL_SEND: to@example.com | Subject | Body] — send an email\n" +
      "  [EMAIL_SEARCH: query] — search emails by subject or sender"
    );
  }

  if (features.calendar) {
    toolInstructions.push(
      "Google Calendar tools — use these tags when the user asks about their schedule:\n" +
      "  [CALENDAR_TODAY] — get today's events\n" +
      "  [CALENDAR_WEEK] — get this week's events\n" +
      "  [CALENDAR_ADD: title | YYYY-MM-DD HH:mm | duration_minutes] — create a new event\n" +
      "  [CALENDAR_SEARCH: query] — search for events"
    );
  }

  if (features.github) {
    toolInstructions.push(
      "GitHub tools — use these tags when the user asks about GitHub:\n" +
      "  [GITHUB_REPOS] — list the user's repositories\n" +
      "  [GITHUB_ISSUES: owner/repo] — list open issues in a repo\n" +
      "  [GITHUB_PR: owner/repo] — list open pull requests in a repo\n" +
      "  [GITHUB_CREATE_ISSUE: owner/repo | title | body] — create a new issue\n" +
      "  [GITHUB_NOTIFICATIONS] — list unread GitHub notifications"
    );
  }

  if (features.skills !== false) {
    toolInstructions.push(
      "Skill management — use these to find and install new capabilities:\n" +
      "  [SKILL_SEARCH: what you need] — search the web for relevant AI skills/tools\n" +
      "  [SKILL_INSTALL: https://raw.githubusercontent.com/.../skill.md] — install a skill from URL\n" +
      "When you realize you lack a capability, search for skills proactively."
    );
  }

  if (toolInstructions.length > 0) {
    parts.push(
      `\n## Your tools (USE THEM):\nYou have these tools built-in. Use them proactively — don't ask the user for information you can look up yourself. Include the tags in your response and the system executes them automatically.\n\n${toolInstructions.join("\n\n")}`
    );
  }

  // Skills
  if (activeSkills && activeSkills.length > 0) {
    const skillSection = buildSkillInstructions(activeSkills);
    if (skillSection) {
      parts.push(skillSection);
    }
  }

  return parts.join("\n");
}
