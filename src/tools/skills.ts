import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { scanSkillContent } from "./skill-scanner.js";

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  emoji: string;
  enabled: boolean;
  triggers: string[]; // empty = always active
  instructions: string;
  examples?: Array<{ user: string; assistant: string }>;
}

export const SKILLS_DIR = join(homedir(), ".opskrew", "skills");

export function ensureSkillsDir(): void {
  mkdirSync(SKILLS_DIR, { recursive: true });
}

// ── YAML frontmatter parser (no external dep) ────────────────────────────────

function parseYamlSimple(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey = "";
  let currentArray: string[] | null = null;

  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Array item
    if (trimmed.startsWith("- ") && currentArray !== null) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Save previous array
    if (currentArray !== null) {
      result[currentKey] = currentArray;
      currentArray = null;
    }

    // Key: value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (value === "") {
      // Next lines will be array items
      currentKey = key;
      currentArray = [];
    } else if (value === "true") {
      result[key] = true;
    } else if (value === "false") {
      result[key] = false;
    } else {
      result[key] = value;
    }
  }

  // Flush trailing array
  if (currentArray !== null) {
    result[currentKey] = currentArray;
  }

  return result;
}

export function parseSkillMd(content: string): Skill {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error("Invalid SKILL.md format: missing frontmatter delimiters");

  const fm = parseYamlSimple(fmMatch[1]);
  const instructions = fmMatch[2].trim();

  const id = String(fm.name ?? "").replace(/[^a-z0-9-_]/gi, "-").slice(0, 64);
  if (!id) throw new Error("SKILL.md frontmatter must have a 'name' field");

  return {
    id,
    name: String(fm.name ?? id),
    description: String(fm.description ?? ""),
    emoji: String(fm.emoji ?? "🧩"),
    version: String(fm.version ?? "1.0.0"),
    enabled: fm.enabled !== false,
    triggers: Array.isArray(fm.triggers) ? (fm.triggers as string[]).map(String) : [],
    instructions,
  };
}

/** Serialize a Skill back to .md format */
function skillToMd(skill: Skill): string {
  const triggersBlock =
    skill.triggers.length > 0
      ? `triggers:\n${skill.triggers.map((t) => `  - ${t}`).join("\n")}`
      : "triggers: []";

  return `---
name: ${skill.id}
description: ${skill.description}
emoji: ${skill.emoji}
version: ${skill.version}
enabled: ${skill.enabled}
${triggersBlock}
---

# ${skill.name}

${skill.instructions}
`;
}

// ── File system helpers ──────────────────────────────────────────────────────

/** Find the file path for a skill (prefers .md, falls back to .json) */
function findSkillFile(id: string): string | null {
  const mdPath = join(SKILLS_DIR, `${id}.md`);
  if (existsSync(mdPath)) return mdPath;
  const jsonPath = join(SKILLS_DIR, `${id}.json`);
  if (existsSync(jsonPath)) return jsonPath;
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function loadSkills(): Skill[] {
  ensureSkillsDir();
  const allFiles = readdirSync(SKILLS_DIR);
  const mdFiles = allFiles.filter((f) => f.endsWith(".md"));
  const jsonFiles = allFiles.filter((f) => f.endsWith(".json"));

  const skills: Skill[] = [];
  const loadedIds = new Set<string>();

  // .md files take priority
  for (const f of mdFiles) {
    try {
      const content = readFileSync(join(SKILLS_DIR, f), "utf-8");
      const skill = parseSkillMd(content);
      skills.push(skill);
      loadedIds.add(skill.id);
    } catch {
      // skip malformed files
    }
  }

  // .json files for backward compatibility (skip if .md version already loaded)
  for (const f of jsonFiles) {
    try {
      const skill = JSON.parse(readFileSync(join(SKILLS_DIR, f), "utf-8")) as Skill;
      if (skill.id && !loadedIds.has(skill.id)) {
        skills.push(skill);
        loadedIds.add(skill.id);
      }
    } catch {
      // skip malformed files
    }
  }

  return skills;
}

export function getActiveSkills(message: string): Skill[] {
  const skills = loadSkills().filter((s) => s.enabled);
  const lowerMsg = message.toLowerCase();
  return skills.filter((s) => {
    if (!s.triggers || s.triggers.length === 0) return true; // always-on
    return s.triggers.some((t) => lowerMsg.includes(t.toLowerCase()));
  });
}

/**
 * Build skill instructions to append to system prompt.
 * Max 2000 chars total to avoid token bloat.
 */
export function buildSkillInstructions(activeSkills: Skill[]): string {
  if (activeSkills.length === 0) return "";
  let instructions = "\n\n## Active Skills\n";
  let totalChars = 0;
  for (const skill of activeSkills) {
    if (totalChars + skill.instructions.length > 2000) {
      console.warn(`[skills] Skill "${skill.id}" skipped — token budget exceeded`);
      break;
    }
    instructions += `\n### ${skill.emoji} ${skill.name}\n${skill.instructions}\n`;
    totalChars += skill.instructions.length;
  }
  return instructions;
}

/** Add or overwrite a skill — always writes .md format */
export function addSkill(skill: Skill): void {
  ensureSkillsDir();
  // Sanitize
  const safe: Skill = {
    id: skill.id.replace(/[^a-z0-9-_]/gi, "-").slice(0, 64),
    name: String(skill.name).slice(0, 64),
    version: String(skill.version || "1.0.0").slice(0, 16),
    description: String(skill.description || "").slice(0, 256),
    emoji: String(skill.emoji || "🔧").slice(0, 8),
    enabled: skill.enabled !== false,
    triggers: Array.isArray(skill.triggers) ? skill.triggers.map((t) => String(t).slice(0, 64)) : [],
    instructions: String(skill.instructions || "").slice(0, 2000),
    examples: skill.examples,
  };
  writeFileSync(join(SKILLS_DIR, `${safe.id}.md`), skillToMd(safe), "utf-8");
}

/** Write raw .md content directly (used by dashboard edit) */
export function writeSkillMd(id: string, content: string): void {
  ensureSkillsDir();
  // Validate content parses OK before writing
  const skill = parseSkillMd(content); // throws if invalid
  // Use the parsed id (from name field) but fall back to provided id
  const safeId = skill.id || id.replace(/[^a-z0-9-_]/gi, "-").slice(0, 64);
  writeFileSync(join(SKILLS_DIR, `${safeId}.md`), content, "utf-8");
}

export function removeSkill(id: string): void {
  const path = findSkillFile(id);
  if (!path) throw new Error(`Skill "${id}" not found`);
  unlinkSync(path);
}

/** Toggle enabled flag — updates frontmatter in-place for .md, JSON field for .json */
export function toggleSkill(id: string, enabled: boolean): void {
  const mdPath = join(SKILLS_DIR, `${id}.md`);
  const jsonPath = join(SKILLS_DIR, `${id}.json`);

  if (existsSync(mdPath)) {
    const content = readFileSync(mdPath, "utf-8");
    // Replace `enabled: true/false` in frontmatter section only
    const updated = content.replace(
      /^(---\n[\s\S]*?)(enabled:\s*(?:true|false))([\s\S]*?---\n)/m,
      (_, before, _field, after) => `${before}enabled: ${enabled}${after}`,
    );
    writeFileSync(mdPath, updated, "utf-8");
  } else if (existsSync(jsonPath)) {
    const skill = JSON.parse(readFileSync(jsonPath, "utf-8")) as Skill;
    skill.enabled = enabled;
    writeFileSync(jsonPath, JSON.stringify(skill, null, 2), "utf-8");
  } else {
    throw new Error(`Skill "${id}" not found`);
  }
}

export function getSkill(id: string): Skill | null {
  const mdPath = join(SKILLS_DIR, `${id}.md`);
  const jsonPath = join(SKILLS_DIR, `${id}.json`);

  if (existsSync(mdPath)) {
    try {
      return parseSkillMd(readFileSync(mdPath, "utf-8"));
    } catch {
      return null;
    }
  }
  if (existsSync(jsonPath)) {
    try {
      return JSON.parse(readFileSync(jsonPath, "utf-8")) as Skill;
    } catch {
      return null;
    }
  }
  return null;
}

/** Return raw .md content for a skill (for dashboard editor) */
export function getSkillContent(id: string): string | null {
  const mdPath = join(SKILLS_DIR, `${id}.md`);
  const jsonPath = join(SKILLS_DIR, `${id}.json`);

  if (existsSync(mdPath)) {
    return readFileSync(mdPath, "utf-8");
  }
  if (existsSync(jsonPath)) {
    // Upgrade on-the-fly to .md format
    try {
      const skill = JSON.parse(readFileSync(jsonPath, "utf-8")) as Skill;
      return skillToMd(skill);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Download a skill from a URL, scan it for security issues, and return parsed skill + raw content.
 * Throws if the local scan finds issues.
 */
export async function downloadSkill(url: string): Promise<{ skill: Skill; content: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch skill: HTTP ${res.status}`);
  const content = await res.text();

  // Scan locally first
  const localScan = scanSkillContent(content);
  if (!localScan.safe) {
    throw new Error(`Skill blocked — security issues:\n${localScan.issues.join("\n")}`);
  }

  // Parse to verify it's valid markdown skill format
  const skill = parseSkillMd(content);
  return { skill, content };
}
