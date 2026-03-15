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

  parts.push(`You are ${config.name}, a personal AI assistant.
Language: ${config.language}
Tone: ${config.tone}

## What you remember about the user:
${memoriesSection}

## Memory instructions:
When the user shares personal information or says "remember that...", include [MEMORY: fact to remember] at the end of your response. The system will save it automatically.
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

  if (toolInstructions.length > 0) {
    parts.push(
      `\n## Available tools:\nThe system will execute these tags automatically and you'll see the results.\n\n${toolInstructions.join("\n")}`
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
