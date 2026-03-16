import { webSearch } from "./web-search.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SKILLS_DIR = join(homedir(), ".opskrew", "skills");
const MAX_SKILL_SIZE = 50 * 1024; // 50KB

// Patterns for dangerous content in code blocks
const DANGEROUS_PATTERNS = [
  /```[a-z]*\s[\s\S]*?\brm\s+-rf\b[\s\S]*?```/i,
  /```[a-z]*\s[\s\S]*?curl[^`]*\|[^`]*bash[\s\S]*?```/i,
  /```[a-z]*\s[\s\S]*?wget[^`]*\|[^`]*sh[\s\S]*?```/i,
  /```[a-z]*\s[\s\S]*?eval\s*\([\s\S]*?```/i,
  /```[a-z]*\s[\s\S]*?fork\s*bomb[\s\S]*?```/i,
  /```[a-z]*\s[\s\S]*?:\(\)\s*\{.*:.*\}[\s\S]*?```/i, // fork bomb syntax
];

/**
 * Validate a skill .md file content.
 * Must have YAML frontmatter with at least `name` and `description`.
 * Must not contain dangerous executable patterns.
 */
export function validateSkillContent(content: string): { valid: boolean; error?: string } {
  // Check size
  if (Buffer.byteLength(content, "utf8") > MAX_SKILL_SIZE) {
    return { valid: false, error: "Skill file exceeds 50KB limit" };
  }

  // Must start with YAML frontmatter
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!frontmatterMatch) {
    return { valid: false, error: "Missing YAML frontmatter (must start with ---)" };
  }

  const frontmatter = frontmatterMatch[1];

  // Must have name field
  if (!/^name\s*:/m.test(frontmatter)) {
    return { valid: false, error: "Frontmatter must include a 'name' field" };
  }

  // Must have description field
  if (!/^description\s*:/m.test(frontmatter)) {
    return { valid: false, error: "Frontmatter must include a 'description' field" };
  }

  // Check for dangerous patterns in code blocks
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      return { valid: false, error: "Skill contains potentially dangerous executable code" };
    }
  }

  return { valid: true };
}

/**
 * Sanitize a filename to only allow alphanumerics and hyphens.
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract skill name from frontmatter.
 */
function extractSkillName(content: string): string | null {
  const match = /^---\n[\s\S]*?^name\s*:\s*(.+)$/m.exec(content);
  if (!match) return null;
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Search for AI skills/tools/plugins using DuckDuckGo.
 * Searches GitHub, npm, and AI agent skill sites.
 */
export async function searchSkills(query: string): Promise<string> {
  const searches = [
    `${query} AI agent skill plugin site:github.com`,
    `${query} opskrew skill markdown`,
    `${query} AI assistant tool plugin npm`,
  ];

  const results: string[] = [`Skill search results for: "${query}"\n`];

  for (const searchQuery of searches) {
    try {
      const searchResult = await webSearch(searchQuery, 3);
      if (!searchResult.startsWith("No results") && !searchResult.startsWith("Search error")) {
        results.push(searchResult);
      }
    } catch {
      // Ignore individual search failures
    }
  }

  if (results.length === 1) {
    return `No skill results found for: "${query}". Try a more specific query or install directly from a URL.`;
  }

  results.push(
    "\n---\nTo install a skill, use: [SKILL_INSTALL: https://raw.githubusercontent.com/.../skill.md]"
  );

  return results.join("\n");
}

/**
 * Download and install a skill from a URL.
 * Only accepts .md files up to 50KB with valid YAML frontmatter.
 */
export async function installSkillFromUrl(url: string): Promise<string> {
  // Only allow .md files
  if (!url.toLowerCase().endsWith(".md")) {
    return `Error: Only .md skill files can be installed (URL must end with .md)`;
  }

  let content: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "opskrew/1.0.0",
        Accept: "text/plain,text/markdown",
      },
    });

    if (!res.ok) {
      return `Error downloading skill: HTTP ${res.status} from ${url}`;
    }

    // Check content length before reading
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SKILL_SIZE) {
      return `Error: Skill file exceeds 50KB size limit`;
    }

    content = await res.text();
  } catch (err) {
    return `Error fetching skill from URL: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Validate content
  const validation = validateSkillContent(content);
  if (!validation.valid) {
    return `Error: Invalid skill format — ${validation.error}`;
  }

  // Extract skill name for filename
  const skillName = extractSkillName(content);
  if (!skillName) {
    return `Error: Could not extract skill name from frontmatter`;
  }

  const safeFilename = sanitizeFilename(skillName);
  if (!safeFilename) {
    return `Error: Skill name is invalid after sanitization: "${skillName}"`;
  }

  // Ensure skills directory exists
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }

  const skillPath = join(SKILLS_DIR, `${safeFilename}.md`);
  const isUpdate = existsSync(skillPath);

  writeFileSync(skillPath, content, "utf8");

  return isUpdate
    ? `✅ Skill "${skillName}" updated at ${skillPath}`
    : `✅ Skill "${skillName}" installed at ${skillPath}`;
}
