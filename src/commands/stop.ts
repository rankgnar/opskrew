import { execSync } from "node:child_process";
import chalk from "chalk";

export function stopCommand(): void {
  try {
    execSync("pm2 stop opskrew", { stdio: "inherit" });
    console.log(chalk.green("\n✓ opskrew stopped."));
  } catch {
    console.error(chalk.red("✗ Failed to stop. Is opskrew running? Check: opskrew status"));
    process.exit(1);
  }
}
