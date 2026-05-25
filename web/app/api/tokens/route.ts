import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TokenRecord } from "@/app/types";

const DEFAULT_PATH = join(homedir(), ".agent-harness", "logs", "tokens.jsonl");

export async function GET() {
  const filePath = process.env.TOKENS_LOG_PATH ?? DEFAULT_PATH;

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return NextResponse.json({ sessions: [] });
  }

  const sessions: TokenRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      sessions.push(JSON.parse(trimmed) as TokenRecord);
    } catch {
      // skip malformed lines
    }
  }

  return NextResponse.json({ sessions });
}
