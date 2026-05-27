import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface TokenRecord {
  task: string;
  date: string;
  model: string;
  messages: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
  duration_seconds: number;
  status: string;
}

export interface DailyActivity {
  date: string;
  completed: number;
  failed: number;
  totalCost: number;
}

interface RawRecord {
  task: string;
  date: string;
  model: string;
  messages?: number;
  turns?: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
  duration_seconds?: number;
  status?: string;
}

function normalize(raw: RawRecord): TokenRecord {
  return {
    task: raw.task,
    date: raw.date,
    model: raw.model,
    messages: raw.messages ?? raw.turns ?? 0,
    input_tokens: raw.input_tokens,
    output_tokens: raw.output_tokens,
    cache_creation_tokens: raw.cache_creation_tokens,
    cache_read_tokens: raw.cache_read_tokens,
    estimated_cost_usd: raw.estimated_cost_usd,
    duration_seconds: raw.duration_seconds ?? 0,
    status: raw.status ?? "unknown",
  };
}

export async function GET() {
  const logPath =
    process.env.TOKENS_LOG_PATH ||
    join(homedir(), ".agent-harness", "logs", "tokens.jsonl");

  let content: string;
  try {
    content = await readFile(logPath, "utf-8");
  } catch {
    return NextResponse.json({ sessions: [] });
  }

  const sessions: TokenRecord[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      sessions.push(normalize(JSON.parse(line) as RawRecord));
    } catch {
      // skip malformed lines
    }
  }

  const dayMap = new Map<string, { completed: number; failed: number; totalCost: number }>();
  for (const s of sessions) {
    const day = s.date.slice(0, 10);
    const entry = dayMap.get(day) ?? { completed: 0, failed: 0, totalCost: 0 };
    if (s.status === "completed") entry.completed++;
    if (s.status === "failed") entry.failed++;
    entry.totalCost += s.estimated_cost_usd;
    dayMap.set(day, entry);
  }

  const dailyActivity: DailyActivity[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return NextResponse.json({ sessions, dailyActivity });
}
