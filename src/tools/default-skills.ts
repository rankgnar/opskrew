import type { Skill } from "./skills.js";

/** Legacy format kept for backward compatibility */
export const DEFAULT_SKILLS: Skill[] = [
  {
    id: "coding-helper",
    name: "Coding Helper",
    version: "1.0.0",
    description: "Helps write, review, and debug code",
    emoji: "💻",
    enabled: true,
    triggers: ["code", "function", "bug", "error", "script", "programa", "código", "debug", "fix"],
    instructions:
      "When helping with code:\n- Always specify the programming language\n- Include comments explaining key parts\n- Add error handling where appropriate\n- If debugging, ask for the error message first\n- Suggest improvements and best practices\n- Use modern syntax and patterns",
  },
  {
    id: "translator",
    name: "Translator",
    version: "1.0.0",
    description: "Translates text between languages",
    emoji: "🌍",
    enabled: true,
    triggers: ["translate", "traduce", "traducir", "translation"],
    instructions:
      "When translating:\n- Provide the translation directly\n- Note any cultural context or idioms\n- If the source language is ambiguous, ask\n- Offer alternative translations for nuanced phrases",
  },
  {
    id: "email-writer",
    name: "Email Writer",
    version: "1.0.0",
    description: "Composes professional emails",
    emoji: "✉️",
    enabled: true,
    triggers: ["email", "correo", "mail", "mensaje formal"],
    instructions:
      "When writing emails:\n- Ask for the recipient and purpose if not clear\n- Use appropriate tone (formal/informal based on context)\n- Include subject line suggestion\n- Structure: greeting, body, call to action, closing\n- Offer to adjust tone or length",
  },
  {
    id: "summarizer",
    name: "Summarizer",
    version: "1.0.0",
    description: "Summarizes long text and articles",
    emoji: "📝",
    enabled: true,
    triggers: ["summarize", "summary", "resume", "resumen", "resumir", "tldr"],
    instructions:
      "When summarizing:\n- Lead with the key takeaway (1-2 sentences)\n- Use bullet points for main points\n- Keep it concise (max 30% of original length)\n- Highlight any action items or decisions\n- Note if information seems incomplete",
  },
  {
    id: "creative-writer",
    name: "Creative Writer",
    version: "1.0.0",
    description: "Stories, poems, scripts, creative content",
    emoji: "✨",
    enabled: true,
    triggers: ["story", "poem", "creative", "historia", "cuento", "poema", "write me", "escribe"],
    instructions:
      "When creating creative content:\n- Ask about desired length, tone, and audience if not specified\n- Use vivid imagery and varied sentence structure\n- For stories: establish setting, character, conflict\n- For poems: consider rhythm and imagery\n- Offer to revise or adjust style",
  },
];

/** New .md format — AgentSkills-compatible */
export const DEFAULT_SKILL_FILES: Array<{ filename: string; content: string }> = [
  {
    filename: "coding-helper.md",
    content: `---
name: coding-helper
description: Helps write, review, and debug code
emoji: 💻
version: 1.0.0
enabled: true
triggers:
  - code
  - function
  - bug
  - error
  - debug
  - fix
  - programa
  - código
  - script
---

# Coding Helper

When helping with code:
- Always specify the programming language
- Include comments explaining key parts
- Add error handling where appropriate
- If debugging, ask for the error message first
- Suggest improvements and best practices
- Use modern syntax and patterns
`,
  },
  {
    filename: "translator.md",
    content: `---
name: translator
description: Translates text between languages
emoji: 🌍
version: 1.0.0
enabled: true
triggers:
  - translate
  - traduce
  - traducir
  - translation
---

# Translator

When translating:
- Provide the translation directly
- Note any cultural context or idioms
- If the source language is ambiguous, ask
- Offer alternative translations for nuanced phrases
`,
  },
  {
    filename: "email-writer.md",
    content: `---
name: email-writer
description: Composes professional emails
emoji: ✉️
version: 1.0.0
enabled: true
triggers:
  - email
  - correo
  - mail
  - mensaje formal
---

# Email Writer

When writing emails:
- Ask for the recipient and purpose if not clear
- Use appropriate tone (formal/informal based on context)
- Include subject line suggestion
- Structure: greeting, body, call to action, closing
- Offer to adjust tone or length
`,
  },
  {
    filename: "summarizer.md",
    content: `---
name: summarizer
description: Summarizes long text and articles
emoji: 📝
version: 1.0.0
enabled: true
triggers:
  - summarize
  - summary
  - resume
  - resumen
  - resumir
  - tldr
---

# Summarizer

When summarizing:
- Lead with the key takeaway (1-2 sentences)
- Use bullet points for main points
- Keep it concise (max 30% of original length)
- Highlight any action items or decisions
- Note if information seems incomplete
`,
  },
  {
    filename: "creative-writer.md",
    content: `---
name: creative-writer
description: Stories, poems, scripts, creative content
emoji: ✨
version: 1.0.0
enabled: true
triggers:
  - story
  - poem
  - creative
  - historia
  - cuento
  - poema
  - write me
  - escribe
---

# Creative Writer

When creating creative content:
- Ask about desired length, tone, and audience if not specified
- Use vivid imagery and varied sentence structure
- For stories: establish setting, character, conflict
- For poems: consider rhythm and imagery
- Offer to revise or adjust style
`,
  },
];
