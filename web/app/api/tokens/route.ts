import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface TokenRecord {
  task: string;
  date: string;
  model: string;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
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
      sessions.push(JSON.parse(line) as TokenRecord);
    } catch {
      // skip malformed lines
    }
  }

  return NextResponse.json({ sessions });
}
