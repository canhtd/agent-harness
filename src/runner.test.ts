import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('runner log file modes', () => {
  const runnerSource = readFileSync(path.join(__dirname, 'runner.ts'), 'utf-8')

  it('spawnAgent uses write mode (w) for fresh log', () => {
    const spawnAgentFn = runnerSource.slice(
      runnerSource.indexOf('export async function spawnAgent'),
      runnerSource.indexOf('export async function spawnContinuation'),
    )
    expect(spawnAgentFn).toContain("'w'")
    expect(spawnAgentFn).not.toContain("'a'")
  })

  it('spawnContinuation uses append mode (a) for continuation log', () => {
    const continuationFn = runnerSource.slice(
      runnerSource.indexOf('export async function spawnContinuation'),
    )
    expect(continuationFn).toContain("'a'")
  })
})
