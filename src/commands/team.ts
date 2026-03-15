import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, existsSync } from "node:fs";
import * as readline from "node:readline";
import {
  loadAgents,
  addAgent,
  removeAgent,
  toggleAgent,
  type Agent,
} from "../tools/team.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export function registerTeamCommand(program: Command): void {
  const team = program.command("team").description("Manage team agents");

  team
    .command("list")
    .description("List all team agents")
    .action(() => {
      const agents = loadAgents();
      if (agents.length === 0) {
        console.log(chalk.gray("No agents configured. Add one with: opskrew team add <file.json>"));
        return;
      }
      console.log(chalk.bold(`\n🤖 Team Agents (${agents.length}):\n`));
      for (const a of agents) {
        const status = a.enabled ? chalk.green("✓ active") : chalk.gray("✗ disabled");
        const delegate = a.autoDelegate ? chalk.cyan("auto-delegate") : chalk.gray("manual-only");
        console.log(`  ${a.emoji} ${chalk.cyan(a.id)} ${status} [${delegate}]`);
        console.log(`     ${chalk.bold(a.name)} — ${a.description}`);
        if (a.triggerPatterns.length > 0) {
          console.log(chalk.gray(`     Triggers: ${a.triggerPatterns.join(", ")}`));
        }
        if (a.skills.length > 0) {
          console.log(chalk.gray(`     Skills: ${a.skills.join(", ")}`));
        }
        if (a.tools.length > 0) {
          console.log(chalk.gray(`     Tools: ${a.tools.join(", ")}`));
        }
        console.log();
      }
    });

  team
    .command("add <file>")
    .description("Add a team agent from a .json file")
    .action((file: string) => {
      if (!existsSync(file)) {
        console.error(chalk.red(`✗ File not found: ${file}`));
        process.exit(1);
      }
      try {
        const data = JSON.parse(readFileSync(file, "utf-8")) as Agent;
        if (!data.id || !data.name || !data.systemPrompt) {
          throw new Error("Agent must have: id, name, systemPrompt");
        }
        addAgent(data);
        console.log(chalk.green(`✓ Agent "${data.name}" (${data.id}) installed`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  team
    .command("remove <id>")
    .description("Remove an agent by ID")
    .action((id: string) => {
      try {
        removeAgent(id);
        console.log(chalk.green(`✓ Agent "${id}" removed`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  team
    .command("enable <id>")
    .description("Enable an agent")
    .action((id: string) => {
      try {
        toggleAgent(id, true);
        console.log(chalk.green(`✓ Agent "${id}" enabled`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  team
    .command("disable <id>")
    .description("Disable an agent")
    .action((id: string) => {
      try {
        toggleAgent(id, false);
        console.log(chalk.gray(`✗ Agent "${id}" disabled`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  team
    .command("create")
    .description("Interactively create a new team agent")
    .action(async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        console.log(chalk.bold("\n🤖 Create a new team agent\n"));

        const id = (await prompt(rl, "ID (e.g. my-agent): ")).trim().replace(/\s+/g, "-").toLowerCase();
        if (!id) { console.error(chalk.red("✗ ID is required")); process.exit(1); }

        const name = (await prompt(rl, "Name (e.g. My Agent): ")).trim();
        if (!name) { console.error(chalk.red("✗ Name is required")); process.exit(1); }

        const emoji = (await prompt(rl, "Emoji (e.g. 🤖): ")).trim() || "🤖";
        const description = (await prompt(rl, "Description: ")).trim() || "";

        const skillsRaw = (await prompt(rl, "Skills (comma-separated skill IDs, leave empty for none): ")).trim();
        const skills = skillsRaw ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

        const toolsRaw = (await prompt(rl, "Tools (comma-separated: webSearch, urlReader): ")).trim();
        const tools = toolsRaw ? toolsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

        const autoDelegate = (await prompt(rl, "Auto-delegate? (y/n) [y]: ")).trim().toLowerCase() !== "n";

        const triggersRaw = autoDelegate
          ? (await prompt(rl, "Trigger patterns (comma-separated): ")).trim()
          : "";
        const triggerPatterns = triggersRaw ? triggersRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

        console.log(chalk.gray("\nSystem prompt (end with a line containing only 'END'):"));
        const promptLines: string[] = [];
        await new Promise<void>((resolve) => {
          rl.on("line", (line) => {
            if (line.trim() === "END") { resolve(); }
            else { promptLines.push(line); }
          });
        });
        const systemPrompt = promptLines.join("\n").trim();
        if (!systemPrompt) { console.error(chalk.red("✗ System prompt is required")); process.exit(1); }

        const agent: Agent = {
          id,
          name,
          emoji,
          description,
          systemPrompt,
          skills,
          tools,
          autoDelegate,
          triggerPatterns,
          enabled: true,
        };

        addAgent(agent);
        console.log(chalk.green(`\n✓ Agent "${name}" (${id}) created and installed`));
      } finally {
        rl.close();
      }
    });
}
