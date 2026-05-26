import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'

vi.mock('./config.js', () => ({
  HANDOFFS: '/tmp/test-handoffs',
  LOGS: '/tmp/test-logs',
  log: { info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./workspace.js', () => ({
  sanitize: vi.fn((id: string) => id),
}))

vi.mock('./github.js', () => ({
  fetchLastReviewBody: vi.fn().mockReturnValue(''),
}))

describe('writeHandoff', () => {
  beforeEach(async () => {
    await fs.mkdir('/tmp/test-handoffs', { recursive: true })
    await fs.mkdir('/tmp/test-logs', { recursive: true })
  })

  afterEach(async () => {
    try { await fs.rm('/tmp/test-handoffs', { recursive: true }) } catch {}
    try { await fs.rm('/tmp/test-logs', { recursive: true }) } catch {}
    vi.restoreAllMocks()
  })

  it('writes handoff with review feedback and log tail', async () => {
    const github = await import('./github.js')
    vi.mocked(github.fetchLastReviewBody).mockReturnValue('Fix the type errors on line 42')

    await fs.writeFile('/tmp/test-logs/ENG-50.log', 'line1\nline2\nline3\n')

    const { writeHandoff } = await import('./handoff.js')
    await writeHandoff('issue-1', 'ENG-50', 1, 5, 42)

    const content = await fs.readFile('/tmp/test-handoffs/ENG-50.md', 'utf-8')
    expect(content).toContain('# Handoff — Attempt 1')
    expect(content).toContain('PR #42 bị reject sau 5 turns')
    expect(content).toContain('Fix the type errors on line 42')
    expect(content).toContain('line1')
    expect(content).toContain('line3')
  })

  it('writes handoff without PR number', async () => {
    const { writeHandoff } = await import('./handoff.js')
    await writeHandoff('issue-1', 'ENG-50', 1, 5, null)

    const content = await fs.readFile('/tmp/test-handoffs/ENG-50.md', 'utf-8')
    expect(content).toContain('Agent hit 5 turns without creating a PR')
    expect(content).toContain('(no review feedback)')
  })

  it('writes handoff when log file missing', async () => {
    const { writeHandoff } = await import('./handoff.js')
    await writeHandoff('issue-1', 'ENG-51', 1, 5, null)

    const content = await fs.readFile('/tmp/test-handoffs/ENG-51.md', 'utf-8')
    expect(content).toContain('(no agent log found)')
  })
})

describe('readHandoff', () => {
  beforeEach(async () => {
    await fs.mkdir('/tmp/test-handoffs', { recursive: true })
  })

  afterEach(async () => {
    try { await fs.rm('/tmp/test-handoffs', { recursive: true }) } catch {}
  })

  it('reads existing handoff file', async () => {
    await fs.writeFile('/tmp/test-handoffs/ENG-50.md', '# Handoff content')

    const { readHandoff } = await import('./handoff.js')
    const content = await readHandoff('ENG-50')
    expect(content).toBe('# Handoff content')
  })

  it('returns null when handoff does not exist', async () => {
    const { readHandoff } = await import('./handoff.js')
    const content = await readHandoff('ENG-NONEXISTENT')
    expect(content).toBeNull()
  })
})

describe('removeHandoff', () => {
  beforeEach(async () => {
    await fs.mkdir('/tmp/test-handoffs', { recursive: true })
  })

  afterEach(async () => {
    try { await fs.rm('/tmp/test-handoffs', { recursive: true }) } catch {}
  })

  it('removes existing handoff file', async () => {
    await fs.writeFile('/tmp/test-handoffs/ENG-50.md', '# Handoff')

    const { removeHandoff } = await import('./handoff.js')
    await removeHandoff('ENG-50')

    await expect(fs.access('/tmp/test-handoffs/ENG-50.md')).rejects.toThrow()
  })

  it('does not crash when handoff does not exist', async () => {
    const { removeHandoff } = await import('./handoff.js')
    await expect(removeHandoff('ENG-NONEXISTENT')).resolves.not.toThrow()
  })
})
