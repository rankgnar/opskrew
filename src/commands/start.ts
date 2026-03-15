import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

function isAlreadyRunning(): boolean {
  try {
    const output = execSync("pm2 list --no-color 2>/dev/null", { encoding: "utf8" });
    return output.includes("opskrew");
  } catch {
    return false;
  }
}

export function startCommand(): void {
  // Resolve runtime relative to the CLI binary, not cwd
  const binDir = new URL(".", import.meta.url).pathname;
  const runtimePath = join(binDir, "runtime.js");

  if (!existsSync(runtimePath)) {
    console.error(chalk.red("✗ dist/runtime.js not found. Run: npm run build"));
    process.exit(1);
  }

  // If already running, restart instead of failing
  if (isAlreadyRunning()) {
    try {
      execSync("pm2 restart opskrew", { stdio: "inherit" });
      console.log(chalk.green("\n✓ opskrew restarted. Use: opskrew status"));
    } catch {
      console.error(chalk.red("✗ Failed to restart. Check logs with: opskrew logs"));
      process.exit(1);
    }
    return;
  }

  try {
    execSync(`pm2 start ${runtimePath} --name opskrew --interpreter node`, {
      stdio: "inherit",
    });
    console.log(chalk.green("\n✓ opskrew started. Use: opskrew status"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Handle "Script already launched" edge case (race condition or stale PM2 state)
    if (msg.includes("already launched") || msg.includes("already exists")) {
      try {
        execSync("pm2 restart opskrew", { stdio: "inherit" });
        console.log(chalk.green("\n✓ opskrew restarted. Use: opskrew status"));
      } catch {
        console.error(chalk.red("✗ Failed to restart. Check PM2 state with: pm2 list"));
        process.exit(1);
      }
      return;
    }

    console.error(chalk.red("✗ Failed to start. Is PM2 installed? npm install -g pm2"));
    process.exit(1);
  }
}
