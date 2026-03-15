# Skills & Team System — Design Document

## Philosophy
- **Simple over clever** — if it can be a file, don't make it a database
- **No magic** — everything is explicit and debuggable
- **Fail gracefully** — a broken skill never breaks the assistant

---

## 1. Skills System

### What is a Skill?
A skill is a `.json` file that extends the assistant's capabilities with:
- Extra system prompt instructions
- Optional trigger patterns (when to activate)
- Optional example conversations

### File Structure
```
~/.opskrew/skills/
├── coding-helper.json
├── email-writer.json
├── translator.json
└── meeting-notes.json
```

### Skill Format
```json
{
  "id": "coding-helper",
  "name": "Coding Helper",
  "version": "1.0.0",
  "description": "Helps write, review, and debug code",
  "emoji": "💻",
  "enabled": true,
  "triggers": ["code", "function", "bug", "error", "script", "programa"],
  "instructions": "When the user asks about code:\n- Always specify the language\n- Include comments explaining key parts\n- Suggest error handling\n- If debugging, ask for the error message first",
  "examples": [
    {
      "user": "Write a function to sort an array",
      "assistant": "Here's a function in JavaScript..."
    }
  ]
}
```

### How Skills are Injected
1. On each message, check which skills are enabled
2. **Trigger matching**: if message contains any trigger word → skill is "active"
3. **Always-on skills**: if `triggers` is empty/null → always injected
4. Active skills' `instructions` are appended to the system prompt under `## Active Skills`
5. **Token budget**: max 2000 tokens for all skill instructions combined (trim oldest if over)

### Built-in Skills (ship with opskrew)
1. **coding-helper** — code writing, debugging, reviews
2. **translator** — translate between languages
3. **email-writer** — compose professional emails
4. **summarizer** — summarize long text/articles
5. **creative-writer** — stories, poems, scripts

### CLI Commands
```bash
opskrew skills list              # List all skills
opskrew skills add <file>        # Install a skill from .json file
opskrew skills remove <id>       # Remove a skill
opskrew skills enable <id>       # Enable a skill
opskrew skills disable <id>      # Disable a skill
opskrew skills create            # Interactive skill creator
```

### Telegram Commands
```
/skills          — List enabled skills
/skill coding-helper  — Toggle a skill on/off
```

### Dashboard
- Tab "🧩 Skills" in sidebar
- Grid of skill cards with enable/disable toggle
- "Create Skill" form (name, description, instructions, triggers)
- Import skill from file

---

## 2. Team System (Multi-Agent)

### What is a Team Agent?
A team agent is a specialized "persona" that the main assistant can delegate to.
Unlike skills (which add instructions), agents have their OWN system prompt and conversation context.

### Key Difference from OpenClaw
- OpenClaw: separate processes, separate LLM calls, separate bots
- opskrew: SAME Claude API, SAME process, different system prompts
- Delegation = calling Claude again with a different system prompt

### Agent Format
```json
{
  "id": "researcher",
  "name": "Research Agent",
  "emoji": "🔍",
  "enabled": true,
  "description": "Investigates topics thoroughly using web search",
  "systemPrompt": "You are a research specialist. When given a topic:\n1. Search the web for current information\n2. Cross-reference multiple sources\n3. Present findings with citations\n4. Highlight what's verified vs unverified",
  "skills": ["summarizer"],
  "tools": ["webSearch", "urlReader"],
  "autoDelegate": true,
  "triggerPatterns": ["investiga", "research", "busca información sobre", "find out about"]
}
```

### File Structure
```
~/.opskrew/agents/
├── researcher.json
├── coder.json
└── writer.json
```

### How Delegation Works

```
User message → Main assistant (Claude)
                    │
                    ├─ If auto-delegate matches → Delegate to agent
                    │   1. Build agent's system prompt (agent.systemPrompt + agent.skills)
                    │   2. Call Claude with agent's prompt + user's message
                    │   3. Parse response for tool tags (same pipeline)
                    │   4. Return result to user with agent emoji prefix
                    │
                    └─ If no match → Main assistant handles normally
```

### Manual Delegation
User can explicitly delegate:
```
/ask researcher What's the latest on AI regulations in Europe?
```

### Auto-Delegation (optional)
If `autoDelegate: true`, the main assistant can decide to delegate:
1. User sends message
2. Main assistant checks if any agent's `triggerPatterns` match
3. If match found → delegate automatically
4. Response prefixed with agent emoji: "🔍 [Research Agent]:"

### Built-in Agents
1. **researcher** — web search + URL reading + summarization
2. **coder** — code writing + debugging + code review
3. **writer** — creative writing + email drafting + document creation

### Agent History
- Each agent has its own conversation history (separate chat_id prefix)
- History format: `agent:{agent_id}:{original_chat_id}`
- This prevents context pollution between agents

### CLI Commands
```bash
opskrew team list               # List all agents
opskrew team add <file>         # Add an agent from .json
opskrew team remove <id>        # Remove an agent
opskrew team create             # Interactive agent creator
```

### Telegram Commands
```
/team              — List available agents
/ask <agent> <msg> — Ask a specific agent
```

### Dashboard
- Tab "🤖 Team" in sidebar
- Agent cards with status, description, stats (messages handled)
- "Create Agent" form
- View agent conversation history

---

## 3. Implementation Plan

### Phase 1: Skills (simpler, foundation)
Files to create:
- `src/tools/skills.ts` — load, filter, inject skills
- `src/commands/skills.ts` — CLI commands

Files to update:
- `src/personality.ts` — inject active skill instructions
- `src/channels/shared.ts` — trigger matching
- `src/channels/telegram.ts` — /skills, /skill commands
- `src/dashboard/server.ts` — Skills tab + API endpoints
- `src/index.ts` — CLI commands

### Phase 2: Team (builds on skills)
Files to create:
- `src/tools/team.ts` — load agents, delegation logic
- `src/commands/team.ts` — CLI commands

Files to update:
- `src/channels/shared.ts` — auto-delegation check
- `src/channels/telegram.ts` — /team, /ask commands
- `src/dashboard/server.ts` — Team tab + API endpoints
- `src/index.ts` — CLI commands

### Phase 3: Built-in content
- Ship 5 default skills
- Ship 3 default agents
- Create on first `opskrew start` if not existing

---

## 4. Safety

### Skill Validation
- Max instruction length: 2000 chars per skill
- No executable code in skills (instructions only)
- Sanitize all fields on load (strip HTML, control chars)

### Agent Safety
- Agents cannot modify config or system files
- Agents share the same tool restrictions as main assistant
- Auto-delegation can be disabled globally
- Max delegation depth: 1 (no agent-to-agent delegation)

### Token Budget
- Skills: max 2000 tokens total in system prompt
- Agent system prompt: max 1000 tokens
- If over budget: warn in logs, trim to fit
