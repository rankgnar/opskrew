# GitHub Integration

opskrew integrates with the GitHub API using a Personal Access Token. Once configured, your assistant can list your repositories, view open issues and pull requests, create issues, and check your notifications — all from your messaging channel.

---

## What it can do

- List your repositories (sorted by last updated)
- View open issues for any repository
- View open pull requests for any repository
- Create new issues
- Check your unread GitHub notifications

---

## Configuration

### Step 1 — Create a Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
   - Or: GitHub → Profile picture → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click **Generate new token (classic)**
3. Give it a descriptive name: `opskrew`
4. Set expiration as needed (90 days or no expiration)
5. Select the following scopes:

| Scope | Required for |
|---|---|
| `repo` | Read/write access to repositories, issues, and PRs |
| `notifications` | Read unread notifications |

6. Click **Generate token**
7. **Copy the token immediately** — GitHub will not show it again

### Step 2 — Add the token to opskrew

Run the setup wizard:

```bash
opskrew setup --section github
```

Paste your token when prompted. It will be stored in the encrypted vault (`~/.opskrew/vault.enc`).

---

## Commands

### In Telegram or Discord

| Command | What it does |
|---|---|
| `Show my GitHub repos` | List your 20 most recently updated repos |
| `Show open issues in owner/repo` | List open issues for a repository |
| `Show pull requests in owner/repo` | List open PRs for a repository |
| `Create an issue in owner/repo titled "Bug report"` | Create a new issue |
| `Check my GitHub notifications` | Show unread notifications |

The assistant understands natural language — you don't need exact command syntax.

### Message tags (internal)

The assistant uses these internal tags to invoke GitHub tools:

| Tag | Description |
|---|---|
| `[GH_REPOS]` | List authenticated user's repos |
| `[GH_ISSUES: owner/repo]` | List open issues for a repo |
| `[GH_PRS: owner/repo]` | List open pull requests for a repo |
| `[GH_CREATE_ISSUE: owner/repo|title|body]` | Create a new issue |
| `[GH_NOTIFICATIONS]` | List unread notifications |

These are processed automatically — you never need to type them manually.

---

## Examples

**Listing repositories:**
```
You: Show my GitHub repos
Bot: Your repositories (8):

- rankgnar/opskrew [public] — Your AI assistant. Your server. Your rules.
- rankgnar/myapp [private] — Internal project
- rankgnar/dotfiles [public]
...
```

**Viewing issues:**
```
You: What are the open issues in rankgnar/opskrew?
Bot: Open issues in rankgnar/opskrew (2):

- #14: Add WhatsApp group support
  Labels: enhancement
  URL: https://github.com/rankgnar/opskrew/issues/14

- #12: Memory not persisting after restart
  Labels: bug
  URL: https://github.com/rankgnar/opskrew/issues/12
```

**Viewing pull requests:**
```
You: Any open PRs in rankgnar/opskrew?
Bot: Open pull requests in rankgnar/opskrew (1):

- #15: feat: add calendar integration
  Author: contributor | Branch: feat/calendar -> main
  URL: https://github.com/rankgnar/opskrew/pull/15
```

**Creating an issue:**
```
You: Create an issue in rankgnar/opskrew titled "Add Slack support" saying we should add a Slack channel connector
Bot: Issue created: #16 "Add Slack support"
     URL: https://github.com/rankgnar/opskrew/issues/16
```

**Checking notifications:**
```
You: Any GitHub notifications?
Bot: Unread notifications (2):

- [mention] rankgnar/opskrew: You were mentioned in a comment
  Type: Issue

- [review_requested] rankgnar/myapp: Review requested on PR #23
  Type: PullRequest
```

---

## Troubleshooting

**"GitHub is not configured"**
Run `opskrew setup --section github` to add your token.

**"Bad credentials" or 401 error**
Your token may have expired or been revoked. Generate a new one at [GitHub token settings](https://github.com/settings/tokens) and run `opskrew setup --section github` again.

**Missing repositories or limited access**
Make sure the `repo` scope is checked on your token. Tokens without `repo` scope can only access public repositories.

**No notifications showing**
Ensure the `notifications` scope is enabled on the token and that you have unread notifications on GitHub.
