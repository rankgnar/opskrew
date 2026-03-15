import { execSync } from "node:child_process";
import chalk from "chalk";

export function statusCommand(): void {
  try {
    console.log(chalk.cyan("⬡ opskrew status\n"));
    execSync("pm2 describe opskrew", { stdio: "inherit" });
  } catch {
    console.log(chalk.yellow("opskrew is not running or PM2 is not installed."));
    console.log(chalk.dim("  Run: opskrew start"));
  }
}
