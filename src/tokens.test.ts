import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { aggregateTokens, findSessionJsonl, appendTokenRecord, detectModelFamily, type TokenRecord } from './tokens.js'

function makeLine(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-opus-4-6-20250514',
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 300,
      },
    },
    ...overrides,
  })
}

describe('detectModelFamily', () => {
  it('detects opus', () => {
    expect(detectModelFamily('claude-opus-4-6-20250514')).toBe('opus')
  })

  it('detects sonnet', () => {
    expect(detectModelFamily('claude-sonnet-4-6-20250514')).toBe('sonnet')
  })

  it('detects haiku', () => {
    expect(detectModelFamily('claude-haiku-4-5-20251001')).toBe('haiku')
  })

  it('defaults to sonnet for unknown', () => {
    expect(detectModelFamily('some-unknown-model')).toBe('sonnet')
  })
})

describe('aggregateTokens', () => {
  let tmpDir: string
  let jsonlPath: string

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tokens-test-'))
    jsonlPath = path.join(tmpDir, 'session.jsonl')
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('sums tokens from multiple assistant entries', () => {
    const lines = [
      makeLine(),
      makeLine(),
      makeLine({ type: 'human' }),
    ]
    fs.writeFileSync(jsonlPath, lines.join('\n') + '\n')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    expect(record.task).toBe('ENG-15')
    expect(record.input_tokens).toBe(2000)
    expect(record.output_tokens).toBe(1000)
    expect(record.cache_creation_tokens).toBe(400)
    expect(record.cache_read_tokens).toBe(600)
    expect(record.turns).toBe(2)
    expect(record.model).toBe('claude-opus-4-6-20250514')
  })

  it('calculates opus cost correctly', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-6-20250514',
        usage: {
          input_tokens: 1_000_000,
          output_tokens: 1_000_000,
          cache_creation_input_tokens: 1_000_000,
          cache_read_input_tokens: 1_000_000,
        },
      },
    })
    fs.writeFileSync(jsonlPath, line + '\n')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    // $15 input + $75 output + $18.75 cache write + $1.50 cache read = $110.25
    expect(record.estimated_cost_usd).toBe(110.25)
  })

  it('calculates sonnet cost correctly', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6-20250514',
        usage: {
          input_tokens: 1_000_000,
          output_tokens: 1_000_000,
          cache_creation_input_tokens: 1_000_000,
          cache_read_input_tokens: 1_000_000,
        },
      },
    })
    fs.writeFileSync(jsonlPath, line + '\n')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    // $3 + $15 + $3.75 + $0.30 = $22.05
    expect(record.estimated_cost_usd).toBe(22.05)
  })

  it('calculates haiku cost correctly', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-haiku-4-5-20251001',
        usage: {
          input_tokens: 1_000_000,
          output_tokens: 1_000_000,
          cache_creation_input_tokens: 1_000_000,
          cache_read_input_tokens: 1_000_000,
        },
      },
    })
    fs.writeFileSync(jsonlPath, line + '\n')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    // $0.80 + $4 + $1.0 + $0.08 = $5.88
    expect(record.estimated_cost_usd).toBe(5.88)
  })

  it('skips entries without usage', () => {
    const lines = [
      makeLine(),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-6-20250514' } }),
    ]
    fs.writeFileSync(jsonlPath, lines.join('\n') + '\n')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    expect(record.turns).toBe(1)
    expect(record.input_tokens).toBe(1000)
  })

  it('skips malformed JSON lines', () => {
    const lines = [
      makeLine(),
      'not valid json {{{',
      makeLine(),
    ]
    fs.writeFileSync(jsonlPath, lines.join('\n') + '\n')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    expect(record.turns).toBe(2)
    expect(record.input_tokens).toBe(2000)
  })

  it('handles empty file', () => {
    fs.writeFileSync(jsonlPath, '')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    expect(record.turns).toBe(0)
    expect(record.input_tokens).toBe(0)
    expect(record.estimated_cost_usd).toBe(0)
  })

  it('computes cost per-turn when models differ', () => {
    const opusTurn = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-6-20250514',
        usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    })
    const sonnetTurn = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6-20250514',
        usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    })
    fs.writeFileSync(jsonlPath, opusTurn + '\n' + sonnetTurn + '\n')

    const record = aggregateTokens(jsonlPath, 'ENG-15')

    // opus turn: $15, sonnet turn: $3 → total $18
    expect(record.estimated_cost_usd).toBe(18)
    expect(record.input_tokens).toBe(2_000_000)
    expect(record.turns).toBe(2)
  })
})

describe('findSessionJsonl', () => {
  it('returns null when project dir does not exist', () => {
    const result = findSessionJsonl('/nonexistent/workspace/path')
    expect(result).toBeNull()
  })
})

describe('appendTokenRecord', () => {
  let tmpDir: string
  let tokensFile: string

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tokens-append-'))
    tokensFile = path.join(tmpDir, 'nested', 'tokens.jsonl')
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates directory and appends parseable JSON lines', async () => {
    const record: TokenRecord = {
      task: 'ENG-15',
      date: '2026-05-25T00:00:00.000Z',
      model: 'claude-opus-4-6-20250514',
      turns: 5,
      input_tokens: 10000,
      output_tokens: 5000,
      cache_creation_tokens: 1000,
      cache_read_tokens: 2000,
      estimated_cost_usd: 0.65,
    }

    await appendTokenRecord(record, tokensFile)
    await appendTokenRecord({ ...record, task: 'ENG-16' }, tokensFile)

    const content = await fsp.readFile(tokensFile, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)

    const parsed1 = JSON.parse(lines[0])
    expect(parsed1.task).toBe('ENG-15')

    const parsed2 = JSON.parse(lines[1])
    expect(parsed2.task).toBe('ENG-16')
  })
})
