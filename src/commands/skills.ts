import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline";
import {
  loadSkills,
  addSkill,
  removeSkill,
  toggleSkill,
  parseSkillMd,
  getSkillContent,
  downloadSkill,
  SKILLS_DIR,
  ensureSkillsDir,
  type Skill,
} from "../tools/skills.js";
import { scanSkillContent, scanSkillRemote } from "../tools/skill-scanner.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export function registerSkillsCommand(program: Command): void {
  const skills = program.command("skills").description("Manage skills");

  skills
    .command("list")
    .description("List all installed skills")
    .action(() => {
      const list = loadSkills();
      if (list.length === 0) {
        console.log(chalk.gray("No skills installed. Add one with: opskrew skills add <file.md>"));
        return;
      }
      console.log(chalk.bold(`\n🧩 Skills (${list.length}):\n`));
      for (const s of list) {
        const status = s.enabled ? chalk.green("✓ enabled") : chalk.gray("✗ disabled");
        console.log(`  ${s.emoji} ${chalk.cyan(s.id)} ${status}`);
        console.log(`     ${chalk.bold(s.name)} v${s.version} — ${s.description}`);
        if (s.triggers.length > 0) {
          console.log(chalk.gray(`     Triggers: ${s.triggers.join(", ")}`));
        } else {
          console.log(chalk.gray("     Triggers: (always-on)"));
        }
        console.log();
      }
    });

  skills
    .command("add <file>")
    .description("Install a skill from a .md or .json file")
    .action((file: string) => {
      if (!existsSync(file)) {
        console.error(chalk.red(`✗ File not found: ${file}`));
        process.exit(1);
      }
      try {
        if (file.endsWith(".md")) {
          // Parse .md format
          const content = readFileSync(file, "utf-8");
          const skill = parseSkillMd(content);
          if (!skill.id || !skill.instructions) {
            throw new Error("Skill .md must have: name (used as id) and a body (instructions)");
          }
          addSkill(skill);
          console.log(chalk.green(`✓ Skill "${skill.name}" (${skill.id}) installed`));
        } else if (file.endsWith(".json")) {
          // Legacy .json format
          const data = JSON.parse(readFileSync(file, "utf-8")) as Skill;
          if (!data.id || !data.name || !data.instructions) {
            throw new Error("Skill JSON must have: id, name, instructions");
          }
          addSkill(data);
          console.log(chalk.green(`✓ Skill "${data.name}" (${data.id}) installed (upgraded to .md)`));
        } else {
          throw new Error("Supported file types: .md (recommended) or .json (legacy)");
        }
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  skills
    .command("install <url>")
    .description("Download, scan, and install a skill from a URL")
    .action(async (url: string) => {
      console.log(chalk.gray(`🔍 Scanning skill from: ${url}`));
      try {
        // Remote scan via Gen Digital first
        const remoteScan = await scanSkillRemote(url);
        if (remoteScan.status === "malicious") {
          console.error(chalk.red(`✗ Blocked by Gen Digital Trust Hub: ${remoteScan.message}`));
          process.exit(1);
        }
        if (remoteScan.status === "safe") {
          console.log(chalk.green(`  ✅ Gen Digital Trust Hub: safe`));
        } else {
          console.log(chalk.gray(`  ⚠️  Gen Digital Trust Hub: ${remoteScan.status} — ${remoteScan.message}`));
        }

        // Download + local scan
        const { skill } = await downloadSkill(url);
        console.log(chalk.green(`  ✅ Local scan: clean`));
        addSkill(skill);
        console.log(chalk.green(`✓ Skill "${skill.name}" (${skill.id}) installed`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  skills
    .command("remove <id>")
    .description("Remove a skill by ID")
    .action((id: string) => {
      try {
        removeSkill(id);
        console.log(chalk.green(`✓ Skill "${id}" removed`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  skills
    .command("enable <id>")
    .description("Enable a skill")
    .action((id: string) => {
      try {
        toggleSkill(id, true);
        console.log(chalk.green(`✓ Skill "${id}" enabled`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  skills
    .command("disable <id>")
    .description("Disable a skill")
    .action((id: string) => {
      try {
        toggleSkill(id, false);
        console.log(chalk.gray(`✗ Skill "${id}" disabled`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  skills
    .command("create")
    .description("Interactively create a new skill (.md format)")
    .action(async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        console.log(chalk.bold("\n🧩 Create a new skill (.md format)\n"));

        const id = (await prompt(rl, "ID (e.g. my-skill): ")).trim().replace(/\s+/g, "-").toLowerCase();
        if (!id) { console.error(chalk.red("✗ ID is required")); process.exit(1); }

        const name = (await prompt(rl, "Name (e.g. My Skill): ")).trim();
        if (!name) { console.error(chalk.red("✗ Name is required")); process.exit(1); }

        const emoji = (await prompt(rl, "Emoji (e.g. 🔧): ")).trim() || "🔧";
        const description = (await prompt(rl, "Description: ")).trim() || "";
        const triggersRaw = (await prompt(rl, "Triggers (comma-separated, leave empty for always-on): ")).trim();
        const triggers = triggersRaw ? triggersRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

        console.log(chalk.gray("\nInstructions (end with a line containing only 'END'):"));
        const instructionLines: string[] = [];
        await new Promise<void>((resolve) => {
          rl.on("line", (line) => {
            if (line.trim() === "END") { resolve(); }
            else { instructionLines.push(line); }
          });
        });
        const instructions = instructionLines.join("\n").trim();
        if (!instructions) { console.error(chalk.red("✗ Instructions are required")); process.exit(1); }

        // Build .md content
        const triggersBlock =
          triggers.length > 0
            ? `triggers:\n${triggers.map((t) => `  - ${t}`).join("\n")}`
            : "triggers: []";

        const mdContent = `---
name: ${id}
description: ${description}
emoji: ${emoji}
version: 1.0.0
enabled: true
${triggersBlock}
---

# ${name}

${instructions}
`;

        ensureSkillsDir();
        const filePath = join(SKILLS_DIR, `${id}.md`);
        writeFileSync(filePath, mdContent, "utf-8");

        console.log(chalk.green(`\n✓ Skill "${name}" (${id}) created at ${filePath}`));
        console.log(chalk.gray("  You can edit the .md file directly at any time."));
      } finally {
        rl.close();
      }
    });

  skills
    .command("show <id>")
    .description("Show the raw .md content of a skill")
    .action((id: string) => {
      const content = getSkillContent(id);
      if (!content) {
        console.error(chalk.red(`✗ Skill "${id}" not found`));
        process.exit(1);
      }
      console.log(content);
    });
}
