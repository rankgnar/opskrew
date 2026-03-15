import { chat } from "../claude.js";
import {
  getMessageCount,
  getOldestMessages,
  deleteMessagesByIds,
  addMessage,
} from "../history.js";

const MAX_HISTORY_MESSAGES = 50; // Keep last 50 messages
const SUMMARY_THRESHOLD = 40; // Trigger summary when reaching 40
const MESSAGES_TO_SUMMARIZE = 30; // Summarize oldest 30 at a time

export async function checkAndSummarize(chatId: string): Promise<void> {
  const count = getMessageCount(chatId);
  if (count < SUMMARY_THRESHOLD) return;

  console.log(
    `[auto-summary] Chat ${chatId} has ${count} messages (>= ${SUMMARY_THRESHOLD}). Summarizing oldest ${MESSAGES_TO_SUMMARIZE}...`,
  );

  const oldest = getOldestMessages(chatId, MESSAGES_TO_SUMMARIZE);
  if (oldest.length === 0) return;

  const conversationText = oldest
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const summaryPrompt =
    "Summarize this conversation concisely, preserving key facts, decisions, and context that may be relevant for future messages. Be brief but complete:\n\n" +
    conversationText;

  try {
    const result = await chat(
      [{ role: "user", content: summaryPrompt }],
      "You are a helpful assistant. Summarize conversations concisely and accurately.",
    );

    const summary = result.text;

    // Delete the old messages
    const ids = oldest.map((m) => m.id);
    deleteMessagesByIds(ids);

    // Insert summary as a user+assistant pair so Claude understands the context
    addMessage(
      chatId,
      "user",
      `[CONVERSATION HISTORY SUMMARY — ${oldest.length} messages condensed]\n\n${summary}`,
    );
    addMessage(
      chatId,
      "assistant",
      "Understood. I have the context from our earlier conversation and will continue from there.",
    );

    console.log(`[auto-summary] Chat ${chatId}: summarized ${oldest.length} messages into 2.`);
  } catch (err) {
    console.error("[auto-summary] Failed to summarize:", err);
    // Don't throw — auto-summary failure should not block the message
  }
}

export { MAX_HISTORY_MESSAGES, SUMMARY_THRESHOLD };
