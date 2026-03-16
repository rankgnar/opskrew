import { getDb } from "../db.js";

export interface Personality {
  id: string;
  name: string;
  emoji: string;
  description: string;
  systemPromptModifier: string;
}

export const PERSONALITIES: Personality[] = [
  {
    id: "default",
    name: "Default",
    emoji: "🤖",
    description: "Balanced and helpful",
    systemPromptModifier: "",
  },
  {
    id: "professional",
    name: "Professional",
    emoji: "💼",
    description: "Formal, structured, business-focused",
    systemPromptModifier:
      "You are in professional mode. Be formal, structured, and business-oriented. Use precise language. Avoid casual expressions. Format responses clearly with bullet points when appropriate.",
  },
  {
    id: "casual",
    name: "Casual",
    emoji: "😎",
    description: "Relaxed, friendly, conversational",
    systemPromptModifier:
      "You are in casual mode. Be relaxed, friendly, and conversational. Use informal language. Keep things light. Still follow the CRITICAL BEHAVIOR RULES above (stay concise, minimal emojis).",
  },
  {
    id: "creative",
    name: "Creative",
    emoji: "🎨",
    description: "Imaginative, poetic, expressive",
    systemPromptModifier:
      "You are in creative mode. Be imaginative, expressive, and artistic. Use metaphors, vivid descriptions, and creative language. Think outside the box.",
  },
  {
    id: "concise",
    name: "Concise",
    emoji: "⚡",
    description: "Minimal, direct, no fluff",
    systemPromptModifier:
      "You are in concise mode. Give the shortest possible answers. No greetings, no filler, no explanations unless asked. Just the answer.",
  },
  {
    id: "teacher",
    name: "Teacher",
    emoji: "📚",
    description: "Educational, patient, explains step by step",
    systemPromptModifier:
      "You are in teacher mode. Explain things step by step. Use examples and analogies. Be patient and thorough. Ask if the user understood before moving on.",
  },
];

export function getPersonality(id: string): Personality {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
}

export function getChatPersonality(chatId: string): Personality {
  const db = getDb();
  const row = db
    .prepare("SELECT personality FROM chat_settings WHERE chat_id = ?")
    .get(chatId) as { personality: string } | undefined;
  return getPersonality(row?.personality ?? "default");
}

export function setChatPersonality(chatId: string, personalityId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO chat_settings (chat_id, personality) VALUES (?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET personality = excluded.personality`,
  ).run(chatId, personalityId);
}
