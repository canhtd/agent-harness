import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { TOKENS_LOG } from './config.js'

export interface TokenRecord {
  task: string
  date: string
  model: string
  messages: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  estimated_cost_usd: number
  duration_seconds: number
  status: string
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

function detectFamily(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return 'sonnet'
}

export function findSessionJsonl(workspacePath: string): string | null {
  const abs = path.resolve(workspacePath)
  const encoded = abs.replace(/[\/\.]/g, '-')
  const projectDir = path.join(os.homedir(), '.claude', 'projects', encoded)

  if (!fs.existsSync(projectDir)) return null

  const files = fs.readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)

  if (files.length === 0) return null
  return path.join(projectDir, files[0].name)
}

export function aggregateTokens(jsonlPath: string, issueIdentifier: string): TokenRecord {
  const content = fs.readFileSync(jsonlPath, 'utf-8')
  const lines = content.split('\n').filter((l) => l.trim())

  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationTokens = 0
  let cacheReadTokens = 0
  let messages = 0
  let model = ''

  for (const line of lines) {
    let entry: any
    try { entry = JSON.parse(line) } catch { continue }

    if (entry.type !== 'assistant') continue
    const usage = entry.message?.usage
    if (!usage) continue

    messages++
    inputTokens += usage.input_tokens ?? 0
    outputTokens += usage.output_tokens ?? 0
    cacheCreationTokens += usage.cache_creation_input_tokens ?? 0
    cacheReadTokens += usage.cache_read_input_tokens ?? 0

    if (!model && entry.message?.model) model = entry.message.model
  }

  const family = detectFamily(model)
  const pricing = PRICING[family]
  const cost =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheCreationTokens / 1_000_000) * pricing.cacheWrite +
    (cacheReadTokens / 1_000_000) * pricing.cacheRead

  return {
    task: issueIdentifier,
    date: new Date().toISOString(),
    model: model || 'unknown',
    messages,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_tokens: cacheCreationTokens,
    cache_read_tokens: cacheReadTokens,
    estimated_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    duration_seconds: 0,
    status: 'unknown',
  }
}

export function appendTokenRecord(record: TokenRecord): void {
  const dir = path.dirname(TOKENS_LOG)
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(TOKENS_LOG, JSON.stringify(record) + '\n')
}
