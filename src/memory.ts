import { getDb } from "./db.js";

export interface Memory {
  id: number;
  fact: string;
  created_at: string;
}

export function getMemories(): Memory[] {
  const db = getDb();
  return db.prepare("SELECT * FROM memories ORDER BY created_at ASC").all() as Memory[];
}

export function addMemory(fact: string): void {
  const db = getDb();
  db.prepare("INSERT INTO memories (fact) VALUES (?)").run(fact);
}

export function deleteMemory(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM memories WHERE id = ?").run(id);
}

export function clearMemories(): void {
  const db = getDb();
  db.prepare("DELETE FROM memories").run();
}

/**
 * Parses [MEMORY: ...] tags from Claude's response.
 * Extracts and saves each memory, then returns the cleaned text.
 */
export function parseMemoryFromResponse(text: string): string {
  const memoryRegex = /\[MEMORY:\s*([^\]]+)\]/gi;
  const matches = [...text.matchAll(memoryRegex)];

  for (const match of matches) {
    const fact = match[1].trim();
    if (fact) {
      addMemory(fact);
    }
  }

  // Remove all [MEMORY: ...] tags from the response
  return text.replace(memoryRegex, "").trim();
}
