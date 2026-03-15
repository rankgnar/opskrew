import { getDb } from "../db.js";

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  model: string;
}

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Approximate pricing per million tokens (Sonnet 4 rates)
const PRICING: Record<string, { input: number; output: number }> = {
  default: { input: 3.0, output: 15.0 },
};

function getPricing(model: string): { input: number; output: number } {
  for (const [key, price] of Object.entries(PRICING)) {
    if (model.toLowerCase().includes(key)) return price;
  }
  return PRICING.default;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricing(model);
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export function trackUsage(
  chatId: string,
  inputTokens: number,
  outputTokens: number,
  model: string,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO usage_log (chat_id, input_tokens, output_tokens, model, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(chatId, inputTokens, outputTokens, model);
}

export function getUsageStats(period: "day" | "week" | "month" | "all"): UsageStats {
  const db = getDb();

  let whereClause = "";
  if (period === "day") {
    whereClause = "WHERE created_at >= datetime('now', '-1 day')";
  } else if (period === "week") {
    whereClause = "WHERE created_at >= datetime('now', '-7 days')";
  } else if (period === "month") {
    whereClause = "WHERE created_at >= datetime('now', '-30 days')";
  }

  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0)  as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        MAX(model) as model
       FROM usage_log ${whereClause}`,
    )
    .get() as { input_tokens: number; output_tokens: number; model: string } | undefined;

  const inputTokens = row?.input_tokens ?? 0;
  const outputTokens = row?.output_tokens ?? 0;
  const model = row?.model ?? "claude-sonnet-4-6";

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost: estimateCost(model, inputTokens, outputTokens),
    model,
  };
}

export function getDailyUsage(days = 7): DailyUsage[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        date(created_at) as date,
        SUM(input_tokens)  as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens
       FROM usage_log
       WHERE created_at >= datetime('now', ? || ' days')
       GROUP BY date(created_at)
       ORDER BY date ASC`,
    )
    .all(`-${days}`) as Array<{
    date: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }>;

  return rows.map((r) => ({
    date: r.date,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    totalTokens: r.total_tokens,
  }));
}
