import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";

const LOG_DIR = join(homedir(), ".opskrew", "logs");

export function logsCommand(options: { lines?: number; file?: boolean }): void {
  const lines = options.lines ?? 50;

  if (options.file && existsSync(LOG_DIR)) {
    // Read from ~/.opskrew/logs/
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.endsWith(".log"))
      .sort()
      .reverse()
      .slice(0, 3);

    if (files.length === 0) {
      console.log(chalk.yellow("No log files found in ~/.opskrew/logs/"));
    } else {
      for (const file of files) {
        const content = readFileSync(join(LOG_DIR, file), "utf8");
        const tail = content.split("\n").slice(-lines).join("\n");
        console.log(chalk.cyan(`\n=== ${file} ===`));
        console.log(tail);
      }
    }
    return;
  }

  // Default: pm2 logs
  try {
    spawnSync("pm2", ["logs", "opskrew", "--lines", String(lines), "--nostream"], {
      stdio: "inherit",
    });
  } catch {
    console.error(chalk.red("✗ Could not read PM2 logs. Is PM2 installed?"));
    process.exit(1);
  }
}
