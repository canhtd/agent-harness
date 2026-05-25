import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { TokenRecord } from '../../types'

export async function GET() {
  const logPath =
    process.env.TOKENS_LOG_PATH ||
    path.join(os.homedir(), '.agent-harness', 'logs', 'tokens.jsonl')

  if (!fs.existsSync(logPath)) {
    return NextResponse.json({ sessions: [] })
  }

  const content = fs.readFileSync(logPath, 'utf-8')
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
