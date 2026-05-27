import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('./config.js', () => ({
  TOKENS_LOG: '/tmp/test-tokens/tokens.jsonl',
}))

import { findSessionJsonl, aggregateTokens, appendTokenRecord, getCumulativeCost, type TokenRecord } from './tokens.js'

function buildAssistantLine(model: string, usage: Record<string, number>): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      model,
      role: 'assistant',
      usage,
    },
  })
}

const sampleJsonl = [
  JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } }),
  buildAssistantLine('claude-opus-4-6', {
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_input_tokens: 2000,
    cache_read_input_tokens: 3000,
  }),
  buildAssistantLine('claude-opus-4-6', {
    input_tokens: 1500,
    output_tokens: 800,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 5000,
  }),
  JSON.stringify({ type: 'result', result: 'done' }),
].join('\n')

describe('aggregateTokens', () => {
  let tmpFile: string

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-session-${Date.now()}.jsonl`)
    fs.writeFileSync(tmpFile, sampleJsonl)
  })

  afterEach(() => {
    try { fs.unlinkSync(tmpFile) } catch {}
  })

  it('sums tokens from assistant entries only', () => {
    const record = aggregateTokens(tmpFile, 'ENG-15')

    expect(record.task).toBe('ENG-15')
    expect(record.input_tokens).toBe(2500)
    expect(record.output_tokens).toBe(1300)
    expect(record.cache_creation_tokens).toBe(2000)
    expect(record.cache_read_tokens).toBe(8000)
    expect(record.messages).toBe(2)
    expect(record.model).toBe('claude-opus-4-6')
    expect(record.duration_seconds).toBe(0)
    expect(record.status).toBe('unknown')
  })

  it('calculates opus cost correctly', () => {
    const record = aggregateTokens(tmpFile, 'ENG-15')

    const expectedCost =
      (2500 / 1_000_000) * 15 +
      (1300 / 1_000_000) * 75 +
      (2000 / 1_000_000) * 18.75 +
      (8000 / 1_000_000) * 1.50

    expect(record.estimated_cost_usd).toBeCloseTo(expectedCost, 6)
  })

  it('detects sonnet model pricing', () => {
    const sonnetJsonl = [
      buildAssistantLine('claude-sonnet-4-6', {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
    ].join('\n')
    fs.writeFileSync(tmpFile, sonnetJsonl)

    const record = aggregateTokens(tmpFile, 'ENG-20')
    const expectedCost =
      (1000 / 1_000_000) * 3 +
      (500 / 1_000_000) * 15

    expect(record.estimated_cost_usd).toBeCloseTo(expectedCost, 6)
    expect(record.model).toBe('claude-sonnet-4-6')
  })

  it('detects haiku model pricing', () => {
    const haikuJsonl = [
      buildAssistantLine('claude-haiku-4-5-20251001', {
        input_tokens: 10000,
        output_tokens: 2000,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 1000,
      }),
    ].join('\n')
    fs.writeFileSync(tmpFile, haikuJsonl)

    const record = aggregateTokens(tmpFile, 'ENG-21')
    const expectedCost =
      (10000 / 1_000_000) * 0.80 +
      (2000 / 1_000_000) * 4 +
      (500 / 1_000_000) * 1.0 +
      (1000 / 1_000_000) * 0.08

    expect(record.estimated_cost_usd).toBeCloseTo(expectedCost, 6)
    expect(record.model).toBe('claude-haiku-4-5-20251001')
  })

  it('skips non-assistant and entries without usage', () => {
    const mixed = [
      JSON.stringify({ type: 'user', message: { role: 'user' } }),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-6', role: 'assistant' } }),
      buildAssistantLine('claude-opus-4-6', {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
    ].join('\n')
    fs.writeFileSync(tmpFile, mixed)

    const record = aggregateTokens(tmpFile, 'ENG-22')
    expect(record.messages).toBe(1)
    expect(record.input_tokens).toBe(100)
  })
})

describe('findSessionJsonl', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `test-claude-projects-${Date.now()}`)
  })

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true }) } catch {}
  })

  it('returns null when directory does not exist', () => {
    const result = findSessionJsonl('/nonexistent/path')
    expect(result).toBeNull()
  })

  it('encodes dots and slashes to dashes, preserving leading dash', () => {
    const homedir = os.homedir()
    const encoded = '/Users/danny/.agent-harness/workspaces/ENG-15'
      .replace(/[\/\.]/g, '-')
    expect(encoded).toBe('-Users-danny--agent-harness-workspaces-ENG-15')

    const projectDir = path.join(homedir, '.claude', 'projects', encoded)
    fs.mkdirSync(projectDir, { recursive: true })
    const jsonlFile = path.join(projectDir, 'session-abc.jsonl')
    fs.writeFileSync(jsonlFile, buildAssistantLine('claude-opus-4-6', {
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    }))

    const result = findSessionJsonl('/Users/danny/.agent-harness/workspaces/ENG-15')
    expect(result).not.toBeNull()
    expect(result!.endsWith('.jsonl')).toBe(true)

    fs.rmSync(projectDir, { recursive: true })
  })
})

describe('appendTokenRecord', () => {
  const tokensPath = '/tmp/test-tokens/tokens.jsonl'

  beforeEach(() => {
    try { fs.rmSync('/tmp/test-tokens', { recursive: true }) } catch {}
  })

  afterEach(() => {
    try { fs.rmSync('/tmp/test-tokens', { recursive: true }) } catch {}
  })

  it('creates dir and appends JSON line', () => {
    const record: TokenRecord = {
      task: 'ENG-15',
      date: '2026-05-26T00:00:00.000Z',
      model: 'claude-opus-4-6',
      messages: 5,
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_tokens: 200,
      cache_read_tokens: 300,
      estimated_cost_usd: 0.1,
      duration_seconds: 120,
      status: 'completed',
    }

    appendTokenRecord(record)

    const content = fs.readFileSync(tokensPath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(1)

    const parsed = JSON.parse(lines[0])
    expect(parsed.task).toBe('ENG-15')
    expect(parsed.estimated_cost_usd).toBe(0.1)
    expect(parsed.messages).toBe(5)
    expect(parsed.duration_seconds).toBe(120)
    expect(parsed.status).toBe('completed')
  })

  it('appends multiple records as separate lines', () => {
    const base: TokenRecord = {
      task: 'ENG-1',
      date: '2026-05-26T00:00:00.000Z',
      model: 'claude-opus-4-6',
      messages: 1,
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      estimated_cost_usd: 0.01,
      duration_seconds: 60,
      status: 'completed',
    }

    appendTokenRecord(base)
    appendTokenRecord({ ...base, task: 'ENG-2' })

    const content = fs.readFileSync(tokensPath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).task).toBe('ENG-1')
    expect(JSON.parse(lines[1]).task).toBe('ENG-2')
  })
})

describe('getCumulativeCost', () => {
  const tokensPath = '/tmp/test-tokens/tokens.jsonl'

  beforeEach(() => {
    try { fs.rmSync('/tmp/test-tokens', { recursive: true }) } catch {}
  })

  afterEach(() => {
    try { fs.rmSync('/tmp/test-tokens', { recursive: true }) } catch {}
  })

  it('returns 0 when tokens.jsonl does not exist', () => {
    expect(getCumulativeCost('ENG-99')).toBe(0)
  })

  it('sums cost for matching issue identifier', () => {
    fs.mkdirSync('/tmp/test-tokens', { recursive: true })
    const lines = [
      JSON.stringify({ task: 'ENG-10', estimated_cost_usd: 12.50 }),
      JSON.stringify({ task: 'ENG-10', estimated_cost_usd: 8.25 }),
      JSON.stringify({ task: 'ENG-11', estimated_cost_usd: 5.00 }),
    ].join('\n')
    fs.writeFileSync(tokensPath, lines)

    expect(getCumulativeCost('ENG-10')).toBe(20.75)
    expect(getCumulativeCost('ENG-11')).toBe(5.00)
    expect(getCumulativeCost('ENG-99')).toBe(0)
  })

  it('skips malformed lines', () => {
    fs.mkdirSync('/tmp/test-tokens', { recursive: true })
    const lines = [
      JSON.stringify({ task: 'ENG-10', estimated_cost_usd: 10.00 }),
      'not json',
      '',
      JSON.stringify({ task: 'ENG-10', estimated_cost_usd: 5.00 }),
    ].join('\n')
    fs.writeFileSync(tokensPath, lines)

    expect(getCumulativeCost('ENG-10')).toBe(15.00)
  })
})
