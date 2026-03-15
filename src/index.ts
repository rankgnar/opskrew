import { Command } from "commander";
import { setupCommand } from "./commands/setup.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { addKnowledgeFile, listKnowledgeFiles, removeKnowledgeFile } from "./tools/knowledge.js";
import { registerSkillsCommand } from "./commands/skills.js";
import { registerTeamCommand } from "./commands/team.js";
import chalk from "chalk";

const program = new Command();

program
  .name("opskrew")
  .description("Personal AI assistant — Claude on your VPS, connected to Telegram")
  .version("0.1.0");

program
  .command("setup")
  .description("Interactive setup wizard")
  .option("-s, --section <section>", "Run only one section: auth | personality | telegram | features | security | all")
  .action(async (opts: { section?: string }) => {
    await setupCommand({ section: opts.section });
  });

program
  .command("start")
  .description("Start opskrew (via PM2)")
  .action(() => {
    startCommand();
  });

program
  .command("stop")
  .description("Stop opskrew")
  .action(() => {
    stopCommand();
  });

program
  .command("status")
  .description("Show runtime status")
  .action(() => {
    statusCommand();
  });

program
  .command("logs")
  .description("View logs")
  .option("-n, --lines <number>", "Number of lines to show", "50")
  .option("-f, --file", "Read from log files instead of PM2")
  .action((opts: { lines?: string; file?: boolean }) => {
    logsCommand({
      lines: opts.lines ? parseInt(opts.lines, 10) : undefined,
      file: opts.file,
    });
  });

// Knowledge base commands
const knowledge = program
  .command("knowledge")
  .description("Manage the knowledge base");

knowledge
  .command("add <file>")
  .description("Add a .md or .txt file to the knowledge base")
  .action((file: string) => {
    try {
      addKnowledgeFile(file);
      console.log(chalk.green(`✓ Added "${file}" to knowledge base`));
    } catch (err) {
      console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

knowledge
  .command("list")
  .description("List all files in the knowledge base")
  .action(() => {
    const files = listKnowledgeFiles();
    if (files.length === 0) {
      console.log(chalk.gray("Knowledge base is empty. Add files with: opskrew knowledge add <file>"));
      return;
    }
    console.log(chalk.bold(`\n📚 Knowledge base (${files.length} file${files.length === 1 ? "" : "s"}):\n`));
    for (const f of files) {
      const sizeStr = f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`;
      console.log(`  ${chalk.cyan(f.name)} ${chalk.gray(`(${sizeStr})`)}`);
    }
    console.log();
  });

knowledge
  .command("remove <name>")
  .description("Remove a file from the knowledge base")
  .action((name: string) => {
    try {
      removeKnowledgeFile(name);
      console.log(chalk.green(`✓ Removed "${name}" from knowledge base`));
    } catch (err) {
      console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// Skills commands
registerSkillsCommand(program);

// Team commands
registerTeamCommand(program);

program.parse(process.argv);
