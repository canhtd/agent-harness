import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

let hasClaude = false
try {
  execSync('claude --version', { stdio: 'pipe' })
  hasClaude = true
} catch {}

describe.skipIf(!hasClaude)('runner CLI flags smoke test', () => {
  it('claude -p with spawn flags exits cleanly', { timeout: 30_000 }, () => {
    const result = execSync(
      'claude -p "respond with just: ok" --verbose --output-format stream-json --max-turns 1',
      { timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    expect(result.toString()).toContain('ok')
  })

  it('claude -p --continue with spawn flags exits cleanly', { timeout: 30_000 }, () => {
    const result = execSync(
      'claude -p "respond with just: ok" --continue --verbose --output-format stream-json --max-turns 1',
      { timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    expect(result.toString()).toContain('ok')
  })
})
