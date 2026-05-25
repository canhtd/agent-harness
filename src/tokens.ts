import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { TOKENS_LOG } from './config.js'

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

interface PricingTier {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

const PRICING: Record<string, PricingTier> = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  haiku: { input: 0.80, output: 4, cacheWrite: 1.0, cacheRead: 0.08 },
}

export function detectModelFamily(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('opus')) return 'opus'
  if (lower.includes('sonnet')) return 'sonnet'
  if (lower.includes('haiku')) return 'haiku'
  return 'sonnet'
}

function encodePath(absPath: string): string {
  return absPath.replace(/\//g, '-').replace(/^-/, '')
}

export function findSessionJsonl(workspacePath: string): string | null {
  const encoded = encodePath(workspacePath)
  const projectDir = path.join(os.homedir(), '.claude', 'projects', encoded)

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(projectDir, { withFileTypes: true })
  } catch {
    return null
  }

  let newest: { name: string; mtime: number } | null = null
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    const full = path.join(projectDir, entry.name)
    try {
      const stat = fs.statSync(full)
      if (!newest || stat.mtimeMs > newest.mtime) {
        newest = { name: full, mtime: stat.mtimeMs }
      }
    } catch {
      continue
    }
  }

  return newest?.name ?? null
}

export function aggregateTokens(jsonlPath: string, issueIdentifier: string): TokenRecord {
  const content = fs.readFileSync(jsonlPath, 'utf-8')
  const lines = content.split('\n').filter(Boolean)

  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationTokens = 0
  let cacheReadTokens = 0
  let turns = 0
  let cost = 0
  let model = ''

  for (const line of lines) {
    let entry: any
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    if (entry.type !== 'assistant') continue
    const usage = entry.message?.usage
    if (!usage) continue

    turns++
    const ti = usage.input_tokens ?? 0
    const to = usage.output_tokens ?? 0
    const tcw = usage.cache_creation_input_tokens ?? 0
    const tcr = usage.cache_read_input_tokens ?? 0

    inputTokens += ti
    outputTokens += to
    cacheCreationTokens += tcw
    cacheReadTokens += tcr

    if (entry.message?.model) {
      model = entry.message.model
    }

    // Cost per turn using that turn's model pricing
    const pricing = PRICING[detectModelFamily(model)]!
    cost +=
      (ti / 1_000_000) * pricing.input +
      (to / 1_000_000) * pricing.output +
      (tcw / 1_000_000) * pricing.cacheWrite +
      (tcr / 1_000_000) * pricing.cacheRead
  }

  return {
    task: issueIdentifier,
    date: new Date().toISOString(),
    model,
    turns,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_tokens: cacheCreationTokens,
    cache_read_tokens: cacheReadTokens,
    estimated_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
  }
}

export async function appendTokenRecord(record: TokenRecord, destPath?: string): Promise<void> {
  const target = destPath ?? TOKENS_LOG
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.appendFile(target, JSON.stringify(record) + '\n')
}
