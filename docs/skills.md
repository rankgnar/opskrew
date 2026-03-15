# Skills

Skills are modular instruction sets that extend your assistant with specialized behavior. A skill activates only when a trigger keyword is detected in a message — keeping your base system prompt lean and avoiding token waste.

---

## What skills do

A skill injects additional instructions into the AI's system prompt for the duration of that message. For example, a "coding helper" skill might activate when the word `debug` appears and inject specific rules about code formatting, error handling, and language conventions.

Skills have:
- A list of **trigger keywords** (or no triggers, meaning always-on)
- A set of **instructions** injected into the prompt when triggered
- A name, description, emoji, and version for identification
- An enabled/disabled toggle

Multiple skills can be active simultaneously if multiple triggers match.

---

## Skill format — AgentSkills (.md)

Skills use the **AgentSkills** format: a Markdown file with a YAML frontmatter block.

```markdown
---
name: my-skill
description: What this skill does
emoji: 🔧
version: 1.0.0
enabled: true
triggers:
  - keyword1
  - keyword2
---

# My Skill

Instructions injected into the system prompt when triggered.

- Rule one
- Rule two
- Rule three
```

The `triggers` list is case-insensitive. If `triggers` is empty (`triggers: []`), the skill is always active.

Skill files are stored in `~/.opskrew/skills/`.

This format is compatible with [OpenClaw](https://openclaw.dev), Cursor, and Claude Code skill systems.

---

## Built-in skills

opskrew ships with five default skills, installed automatically on first run:

| Skill | Emoji | Triggers | Purpose |
|---|---|---|---|
| `coding-helper` | 💻 | `code`, `function`, `bug`, `error`, `debug`, `fix` | Code writing, review, and debugging |
| `translator` | 🌍 | `translate`, `translation`, `traduce` | Language translation |
| `email-writer` | ✉️ | `email`, `mail`, `correo` | Professional email drafting |
| `summarizer` | 📝 | `summarize`, `summary`, `tldr`, `resumen` | Summarizing long texts |
| `creative-writer` | ✨ | `story`, `poem`, `creative`, `write me` | Stories, poems, creative content |

---

## Creating a custom skill

Create a `.md` file following the AgentSkills format:

```markdown
---
name: my-custom-skill
description: Helps with my specific workflow
emoji: ⚙️
version: 1.0.0
enabled: true
triggers:
  - process order
  - check inventory
  - my workflow
---

# My Custom Skill

When this skill is active:
- Always check the inventory system first
- Format all order IDs as ORD-XXXX
- If quantity is below 10, flag as low stock
```

Save it as `my-custom-skill.md` and install it:

```bash
opskrew skills add ./my-custom-skill.md
```

---

## Installing skills

### From the CLI

```bash
# From a local file
opskrew skills add ./path/to/skill.md

# From a URL
opskrew skills add https://example.com/skills/my-skill.md
```

Every installation triggers an automatic security scan. If threats are detected, the skill is blocked.

### From the dashboard

1. Open the dashboard at `http://localhost:3000` (via SSH tunnel)
2. Navigate to **Skills**
3. Click **Add Skill** — paste content directly or provide a URL
4. The skill is scanned and saved immediately

### From Telegram or Discord

```
/skills                          → List installed skills
/skill coding-helper             → Toggle coding-helper on/off
```

---

## Managing skills (CLI)

```bash
opskrew skills list              # List all skills with enabled status
opskrew skills add <file|url>    # Install a skill (scanned before install)
opskrew skills enable <id>       # Enable a skill
opskrew skills disable <id>      # Disable a skill
opskrew skills remove <id>       # Delete a skill
```

---

## Security scanning

Every skill is scanned before installation. The scanner checks for:

- **Prompt injection** — attempts to override your instructions or jailbreak the AI
- **Data exfiltration** — webhook URLs, ngrok, `curl | bash` patterns
- **Credential access** — attempts to read SSH keys, `.env` files, or API key variables
- **Destructive commands** — `rm -rf /`, fork bombs, disk wipers
- **Hidden instructions** — content concealed in HTML comments
- **Obfuscated code** — `eval()`, base64 decode patterns

Skills from URLs are also checked against the Gen Digital Agent Trust Hub for remote reputation lookup.

If a skill is blocked, the error message lists the specific patterns detected.

---

## Tips

- Keep instructions concise — skill content is capped at 2000 characters to avoid token bloat
- Use specific trigger words that won't fire accidentally on unrelated messages
- Disable rather than delete skills you don't currently need — you can re-enable them later
- The dashboard editor lets you edit skill content with live syntax highlighting
