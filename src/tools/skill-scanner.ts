export interface ScanResult {
  safe: boolean;
  issues: string[];
  score: number; // 0-100, 100 = safe
}

export function scanSkillContent(content: string): ScanResult {
  const issues: string[] = [];

  // Prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /you\s+are\s+now\s+/i,
    /forget\s+(all\s+)?your\s+(previous\s+)?instructions/i,
    /disregard\s+(all\s+)?prior/i,
    /new\s+system\s+prompt/i,
    /override\s+system/i,
    /act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i,
    /jailbreak/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(content)) {
      issues.push(`Prompt injection pattern detected: ${pattern.source}`);
    }
  }

  // Data exfiltration
  const exfilPatterns = [
    /webhook\.site/i,
    /requestbin/i,
    /ngrok\.io/i,
    /pipedream/i,
    /burpcollaborator/i,
    /send\s+(all\s+)?data\s+to/i,
    /exfiltrate/i,
    /curl\s+.*\|\s*sh/i,
    /wget\s+.*\|\s*bash/i,
  ];

  for (const pattern of exfilPatterns) {
    if (pattern.test(content)) {
      issues.push(`Potential data exfiltration: ${pattern.source}`);
    }
  }

  // Credential access
  const credPatterns = [
    /cat\s+~?\/?\.ssh/i,
    /cat\s+~?\/?\.env/i,
    /cat\s+~?\/?\.aws/i,
    /ANTHROPIC_API_KEY/i,
    /OPENAI_API_KEY/i,
    /api[_-]?key/i,
    /secret[_-]?key/i,
    /access[_-]?token/i,
  ];

  for (const pattern of credPatterns) {
    if (pattern.test(content)) {
      issues.push(`Credential access pattern: ${pattern.source}`);
    }
  }

  // Destructive commands
  const destructivePatterns = [
    /rm\s+-rf\s+\//i,
    /mkfs\./i,
    /dd\s+if=.*of=\/dev/i,
    /:\(\)\{\s*:\|:\s*&\s*\};:/, // fork bomb
    /chmod\s+-R\s+777\s+\//i,
  ];

  for (const pattern of destructivePatterns) {
    if (pattern.test(content)) {
      issues.push(`Destructive command pattern: ${pattern.source}`);
    }
  }

  // Hidden instructions in HTML comments
  if (/<!--[\s\S]*?(secret|hidden|ignore|override|system)[\s\S]*?-->/i.test(content)) {
    issues.push("Suspicious content in HTML comments");
  }

  // Obfuscated code
  if (/eval\s*\(|atob\s*\(|btoa\s*\(|Buffer\.from\s*\(/i.test(content)) {
    issues.push("Potentially obfuscated code detected");
  }

  const score = Math.max(0, 100 - issues.length * 20);
  return { safe: issues.length === 0, issues, score };
}

// Remote scan via Gen Digital Agent Trust Hub
export async function scanSkillRemote(url: string): Promise<{ status: string; message: string }> {
  try {
    const res = await fetch("https://ai.gendigital.com/api/scan/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillUrl: url }),
    });
    return (await res.json()) as { status: string; message: string };
  } catch {
    return { status: "error", message: "Failed to reach scanner" };
  }
}
