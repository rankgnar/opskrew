import { getDb } from "./db.js";
import type { Message } from "./claude.js";

export function getHistory(chatId: string, limit = 20): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT role, content FROM messages
       WHERE chat_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(chatId, limit) as Array<{ role: string; content: string }>;

  // Reverse so oldest is first (chronological order for the API)
  return rows.reverse().map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));
}

export interface RawMessage {
  id: number;
  chat_id: string;
  role: string;
  content: string;
  created_at: string;
}

export function getMessageCount(chatId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM messages WHERE chat_id = ?")
    .get(chatId) as { count: number };
  return row.count;
}

export function getOldestMessages(chatId: string, count: number): RawMessage[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, chat_id, role, content, created_at FROM messages
       WHERE chat_id = ?
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(chatId, count) as RawMessage[];
}

export function deleteMessagesByIds(ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
}

export function addMessage(
  chatId: string,
  role: "user" | "assistant",
  content: string,
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
  ).run(chatId, role, content);
}

export function clearHistory(chatId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
}
