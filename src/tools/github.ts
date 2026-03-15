import { getVault } from "../vault.js";

function getGithubToken(): string | undefined {
  return getVault().get("GITHUB_TOKEN");
}

export function isGithubConfigured(): boolean {
  return !!getGithubToken();
}

async function getOctokit() {
  const { Octokit } = await import("@octokit/rest");
  const token = getGithubToken();
  if (!token) {
    throw new Error("GitHub is not configured. Run: opskrew setup --section github");
  }
  return new Octokit({ auth: token });
}

export async function githubRepos(): Promise<string> {
  try {
    const octokit = await getOctokit();
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 20,
    });

    if (data.length === 0) return "No repositories found.";

    const lines = data.map(
      (r) =>
        `- ${r.full_name} [${r.private ? "private" : "public"}]${r.description ? ` — ${r.description}` : ""}`,
    );
    return `Your repositories (${data.length}):\n\n${lines.join("\n")}`;
  } catch (err) {
    return `GitHub repos error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function githubIssues(ownerRepo: string): Promise<string> {
  try {
    const [owner, repo] = ownerRepo.split("/");
    if (!owner || !repo) return `Invalid format. Use: owner/repo`;

    const octokit = await getOctokit();
    const { data } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: 20,
    });

    // Filter out pull requests (they show up in issues API too)
    const issues = data.filter((i) => !i.pull_request);

    if (issues.length === 0) return `No open issues in ${ownerRepo}.`;

    const lines = issues.map(
      (i) =>
        `- #${i.number}: ${i.title}\n  Labels: ${i.labels.map((l) => (typeof l === "string" ? l : l.name)).join(", ") || "none"}\n  URL: ${i.html_url}`,
    );
    return `Open issues in ${ownerRepo} (${issues.length}):\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `GitHub issues error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function githubPRs(ownerRepo: string): Promise<string> {
  try {
    const [owner, repo] = ownerRepo.split("/");
    if (!owner || !repo) return `Invalid format. Use: owner/repo`;

    const octokit = await getOctokit();
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 20,
    });

    if (data.length === 0) return `No open pull requests in ${ownerRepo}.`;

    const lines = data.map(
      (pr) =>
        `- #${pr.number}: ${pr.title}\n  Author: ${pr.user?.login ?? "unknown"} | Branch: ${pr.head.ref} -> ${pr.base.ref}\n  URL: ${pr.html_url}`,
    );
    return `Open pull requests in ${ownerRepo} (${data.length}):\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `GitHub PRs error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function githubCreateIssue(
  ownerRepo: string,
  title: string,
  body: string,
): Promise<string> {
  try {
    const [owner, repo] = ownerRepo.split("/");
    if (!owner || !repo) return `Invalid format. Use: owner/repo`;

    const octokit = await getOctokit();
    const { data } = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
    });

    return `Issue created: #${data.number} "${data.title}"\nURL: ${data.html_url}`;
  } catch (err) {
    return `GitHub create issue error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function githubNotifications(): Promise<string> {
  try {
    const octokit = await getOctokit();
    const { data } = await octokit.activity.listNotificationsForAuthenticatedUser({
      all: false,
      per_page: 20,
    });

    if (data.length === 0) return "No unread notifications.";

    const lines = data.map(
      (n) =>
        `- [${n.reason}] ${n.repository.full_name}: ${n.subject.title}\n  Type: ${n.subject.type}`,
    );
    return `Unread notifications (${data.length}):\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `GitHub notifications error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
