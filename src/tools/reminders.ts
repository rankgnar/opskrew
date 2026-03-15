import { getDb } from "../db.js";

export interface Reminder {
  id: number;
  text: string;
  remind_at: string;
  chat_id: string;
  delivered: number; // 0 | 1 (SQLite has no boolean)
}

export function addReminder(text: string, remindAt: string, chatId: string): number {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO reminders (text, remind_at, chat_id, delivered) VALUES (?, ?, ?, 0)")
    .run(text, remindAt, chatId);
  return result.lastInsertRowid as number;
}

export function getDueReminders(): Reminder[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM reminders WHERE delivered = 0 AND remind_at <= datetime('now') ORDER BY remind_at ASC"
    )
    .all() as Reminder[];
}

export function markDelivered(id: number): void {
  const db = getDb();
  db.prepare("UPDATE reminders SET delivered = 1 WHERE id = ?").run(id);
}

/**
 * Parse [REMINDER: YYYY-MM-DD HH:mm | text] tags from Claude response.
 * Returns the cleaned text (tags removed) and an array of parsed reminders.
 */
export function parseRemindersFromResponse(
  text: string,
  chatId: string
): { cleanText: string; count: number } {
  const reminderRegex = /\[REMINDER:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*\|\s*([^\]]+)\]/gi;
  const matches = [...text.matchAll(reminderRegex)];

  for (const match of matches) {
    const remindAt = match[1].trim();
    const reminderText = match[2].trim();
    if (remindAt && reminderText) {
      addReminder(reminderText, remindAt, chatId);
    }
  }

  const cleanText = text.replace(reminderRegex, "").trim();
  return { cleanText, count: matches.length };
}

/**
 * Start a background timer that checks for due reminders every 60 seconds.
 * sendFn receives (chatId, text) and should deliver via Telegram.
 */
export function startReminderTimer(
  sendFn: (chatId: string, text: string) => Promise<void>
): NodeJS.Timeout {
  const checkAndDeliver = async (): Promise<void> => {
    try {
      const due = getDueReminders();
      for (const reminder of due) {
        try {
          await sendFn(reminder.chat_id, `⏰ Reminder: ${reminder.text}`);
          markDelivered(reminder.id);
        } catch (err) {
          console.error(`[reminders] Failed to deliver reminder #${reminder.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[reminders] Error checking reminders:", err);
    }
  };

  // Check immediately on startup, then every 60s
  void checkAndDeliver();
  return setInterval(() => void checkAndDeliver(), 60_000);
}
