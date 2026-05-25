import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import type { TokenRecord } from "../../types"

export async function GET() {
  const filePath =
    process.env.TOKENS_LOG_PATH ??
    path.join(os.homedir(), ".agent-harness", "logs", "tokens.jsonl")

  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return NextResponse.json({ sessions: [] })
  }

  const sessions: TokenRecord[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      sessions.push(JSON.parse(trimmed) as TokenRecord)
    } catch {
      // skip malformed lines
    }
  }

  return NextResponse.json({ sessions })
}
