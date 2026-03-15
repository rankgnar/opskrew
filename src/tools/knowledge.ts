import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { homedir } from "node:os";

export const KNOWLEDGE_DIR = join(homedir(), ".opskrew", "knowledge");

function ensureKnowledgeDir(): void {
  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

export function getKnowledgeFiles(): string[] {
  ensureKnowledgeDir();
  try {
    return readdirSync(KNOWLEDGE_DIR).filter((f) => {
      const ext = extname(f).toLowerCase();
      return ext === ".md" || ext === ".txt";
    });
  } catch {
    return [];
  }
}

export function loadKnowledgeBase(): string {
  ensureKnowledgeDir();
  const files = getKnowledgeFiles();
  if (files.length === 0) return "";

  const parts: string[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(KNOWLEDGE_DIR, file), "utf8").trim();
      if (content) {
        parts.push(`### ${file}\n${content}`);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return parts.join("\n\n");
}

export function addKnowledgeFile(sourcePath: string): void {
  ensureKnowledgeDir();
  const name = basename(sourcePath);
  const ext = extname(name).toLowerCase();
  if (ext !== ".md" && ext !== ".txt") {
    throw new Error(`Only .md and .txt files are supported. Got: ${ext}`);
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`File not found: ${sourcePath}`);
  }
  copyFileSync(sourcePath, join(KNOWLEDGE_DIR, name));
}

export function removeKnowledgeFile(name: string): void {
  ensureKnowledgeDir();
  const target = join(KNOWLEDGE_DIR, name);
  if (!existsSync(target)) {
    throw new Error(`File not found in knowledge base: ${name}`);
  }
  unlinkSync(target);
}

export function listKnowledgeFiles(): Array<{ name: string; size: number }> {
  ensureKnowledgeDir();
  return getKnowledgeFiles().map((f) => {
    try {
      const content = readFileSync(join(KNOWLEDGE_DIR, f), "utf8");
      return { name: f, size: content.length };
    } catch {
      return { name: f, size: 0 };
    }
  });
}
