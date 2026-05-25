import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface TokenRecord {
  task: string
  date: string
  model: string
  turns: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  estimated_cost_usd: number
}

export async function GET() {
  const tokensPath =
    process.env.TOKENS_LOG_PATH ||
    path.join(os.homedir(), '.agent-harness', 'logs', 'tokens.jsonl')

  let content: string
  try {
    content = fs.readFileSync(tokensPath, 'utf-8')
  } catch {
    return NextResponse.json({ sessions: [] })
  }

  const sessions: TokenRecord[] = []
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      sessions.push(JSON.parse(line) as TokenRecord)
    } catch {
      // skip malformed lines
    }
  }

  return NextResponse.json({ sessions })
}
