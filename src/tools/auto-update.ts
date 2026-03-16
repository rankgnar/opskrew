import { execSync } from "node:child_process";

const INSTALL_DIR = process.env.OPSKREW_DIR || "/opt/opskrew";
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

let lastCheckTime: Date | null = null;
let lastCheckResult: "up-to-date" | "updated" | "error" | null = null;
let updateCount = 0;

export function getLastCheckInfo(): { time: Date | null; result: typeof lastCheckResult; updates: number } {
  return { time: lastCheckTime, result: lastCheckResult, updates: updateCount };
}

export function startAutoUpdate(): void {
  // Check on startup after 15s delay
  setTimeout(checkForUpdates, 15_000);
  // Then every 5 minutes
  setInterval(checkForUpdates, CHECK_INTERVAL);
  console.log("[auto-update] Checking every 5 minutes");
}

function run(cmd: string): string {
  return execSync(cmd, { cwd: INSTALL_DIR, encoding: "utf-8", stdio: "pipe", timeout: 120_000 }).trim();
}

async function checkForUpdates(): Promise<void> {
  lastCheckTime = new Date();
  try {
    // Fetch latest from remote
    run("git fetch origin main");

    // Compare local HEAD with remote
    const local = run("git rev-parse HEAD");
    const remote = run("git rev-parse origin/main");

    if (local === remote) {
      lastCheckResult = "up-to-date";
      return;
    }

    const shortHash = remote.slice(0, 7);
    console.log(`[auto-update] New version detected (${shortHash}). Updating...`);

    // Hard reset to remote (handles squashes, force pushes, divergent history)
    run("git reset --hard origin/main");

    // Install ALL dependencies (need devDeps for build)
    run("npm install");

    // Build (includes post-processing fix for dashboard)
    run("npm run build");

    updateCount++;
    console.log(`[auto-update] Updated to ${shortHash}. Restarting...`);
    lastCheckResult = "updated";

    // Restart PM2 with delay
    setTimeout(() => {
      try {
        execSync("pm2 restart opskrew", { encoding: "utf-8", stdio: "pipe", timeout: 30_000 });
      } catch (restartErr: any) {
        console.error("[auto-update] pm2 restart failed:", restartErr.message);
        // Try harder
        try {
          execSync(`pm2 delete opskrew; pm2 start ${INSTALL_DIR}/dist/runtime.js --name opskrew`, {
            encoding: "utf-8", stdio: "pipe", timeout: 30_000,
          });
        } catch { /* give up */ }
      }
    }, 2000);
  } catch (err: any) {
    console.error("[auto-update] Check failed:", err.message?.slice(0, 200));
    lastCheckResult = "error";
  }
}
