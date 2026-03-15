import { execSync } from "node:child_process";

const INSTALL_DIR = process.env.OPSKREW_DIR || "/opt/opskrew";
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every 1 hour

let lastCheckTime: Date | null = null;
let lastCheckResult: "up-to-date" | "updated" | "error" | null = null;

export function getLastCheckInfo(): { time: Date | null; result: typeof lastCheckResult } {
  return { time: lastCheckTime, result: lastCheckResult };
}

export function startAutoUpdate(): void {
  // Check on startup after 30s delay
  setTimeout(checkForUpdates, 30_000);
  // Then every hour
  setInterval(checkForUpdates, CHECK_INTERVAL);
}

async function checkForUpdates(): Promise<void> {
  lastCheckTime = new Date();
  try {
    // Fetch latest from remote
    execSync("git fetch origin main", { cwd: INSTALL_DIR, encoding: "utf-8", stdio: "pipe" });

    // Compare local HEAD with remote
    const local = execSync("git rev-parse HEAD", { cwd: INSTALL_DIR, encoding: "utf-8" }).trim();
    const remote = execSync("git rev-parse origin/main", { cwd: INSTALL_DIR, encoding: "utf-8" }).trim();

    if (local === remote) {
      console.log("[auto-update] Already up to date");
      lastCheckResult = "up-to-date";
      return;
    }

    console.log(`[auto-update] New version available (${remote.slice(0, 7)}). Updating...`);

    // Pull, install, build
    execSync("git pull origin main", { cwd: INSTALL_DIR, encoding: "utf-8", stdio: "pipe" });
    execSync("npm install --production", { cwd: INSTALL_DIR, encoding: "utf-8", stdio: "pipe" });
    execSync("npm run build", { cwd: INSTALL_DIR, encoding: "utf-8", stdio: "pipe" });

    console.log("[auto-update] Updated successfully. Restarting...");
    lastCheckResult = "updated";

    // Restart with delay
    setTimeout(() => {
      try {
        execSync("pm2 restart opskrew", { encoding: "utf-8", stdio: "pipe" });
      } catch (restartErr: any) {
        console.error("[auto-update] pm2 restart failed:", restartErr.message);
      }
    }, 2000);
  } catch (err: any) {
    console.error("[auto-update] Failed:", err.message);
    lastCheckResult = "error";
  }
}
