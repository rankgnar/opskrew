# Team Agents

Team agents are specialized sub-assistants, each with their own system prompt, skill set, conversation history, and tool access. You can delegate tasks to them directly or configure them to auto-activate based on trigger patterns.

---

## What team agents do

When a task is delegated to an agent:
- The agent's own system prompt replaces the main prompt
- Only the agent's assigned skills are loaded
- The agent has its own isolated conversation history
- The agent can use its configured tools (web search, URL reading)
- The result is returned to you in your main conversation

This lets you have a focused specialist for coding, research, writing, or any other domain — without polluting the main assistant's context.

---

## Built-in agents

opskrew ships with three default agents, enabled on first run:

### Researcher

| Property | Value |
|---|---|
| ID | `researcher` |
| Trigger patterns | `research`, `investiga`, `find out about`, `look up`, `averigua` |
| Tools | Web search, URL reading |
| Default skills | `summarizer` |

Investigates topics using live web search and URL reading. Cross-references sources, notes uncertainty, and includes source links.

### Coder

| Property | Value |
|---|---|
| ID | `coder` |
| Trigger patterns | `code this`, `write a function`, `debug this`, `fix this code`, `programa` |
| Tools | None |
| Default skills | `coding-helper` |

Writes, reviews, and debugs code. Follows best practices, adds error handling and comments, asks for clarification on ambiguous requirements.

### Writer

| Property | Value |
|---|---|
| ID | `writer` |
| Trigger patterns | `write an article`, `draft`, `compose`, `redacta`, `escribe un artículo` |
| Tools | None |
| Default skills | `email-writer`, `creative-writer` |

Creates polished written content — articles, drafts, emails, long-form pieces. Adapts tone to audience and purpose.

---

## Creating a custom agent

### Via CLI (interactive)

```bash
opskrew team create
```

The wizard prompts for:
- Agent ID and name
- Description
- System prompt (the agent's core instructions)
- Trigger patterns (comma-separated keywords)
- Skills to assign (by skill ID)
- Tools to enable (`webSearch`, `urlReader`)
- Auto-delegate on/off

### Via dashboard

1. Open the dashboard at `http://localhost:3000` (via SSH tunnel)
2. Navigate to **Team**
3. Click **Create Agent**
4. Fill in the form and save

### Manual (JSON file)

Create a file at `~/.opskrew/agents/my-agent.json`:

```json
{
  "id": "my-agent",
  "name": "My Custom Agent",
  "emoji": "🎯",
  "enabled": true,
  "description": "Handles my specific domain",
  "systemPrompt": "You are a specialist in X. Always follow these rules:\n- Rule one\n- Rule two",
  "skills": ["coding-helper"],
  "tools": ["webSearch"],
  "autoDelegate": true,
  "triggerPatterns": ["my keyword", "another trigger"]
}
```

The file is picked up on the next restart.

---

## Assigning skills to agents

Skills assigned to an agent are always loaded for that agent, regardless of whether the message contains the skill's trigger keywords. This ensures the agent always has its full context.

To assign a skill to an agent, include its ID in the `skills` array:

```json
"skills": ["coding-helper", "summarizer"]
```

Skills must already be installed (`opskrew skills list` to check).

---

## Delegating tasks

### Auto-delegation

If `autoDelegate` is `true` for an agent and the message matches one of its `triggerPatterns`, the task is automatically routed to that agent without any special syntax.

Example:
```
You: Write a function that parses CSV in Python
→ Routed automatically to the Coder agent
```

### Direct delegation

Use `/ask` to send a message to a specific agent regardless of trigger patterns:

```
/ask researcher What are the latest AI benchmarks for 2025?
/ask coder Write a TypeScript function to debounce a callback
/ask writer Draft an introduction for a blog post about open-source AI
```

### Listing agents

```bash
opskrew team list       # CLI
/team                   # Telegram or Discord
```

---

## Managing agents

```bash
opskrew team list               # List all agents
opskrew team create             # Interactive creator
opskrew team remove <id>        # Remove an agent
```

From the dashboard:
- Create, edit, enable/disable, and delete agents
- View each agent's conversation history separately

---

## How isolation works

Each agent maintains its own conversation history, keyed as `agent:<id>:<chatId>`. This means:

- The main assistant and each agent have completely separate memory
- The researcher's search results don't bleed into the coder's context
- You can have multiple agents active without cross-contamination

History for each agent grows independently and follows the same auto-summary rules as the main conversation (summarized at 40 messages).
