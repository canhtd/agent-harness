import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import type { IssueInfo } from './linear.js'

function makeIssue(overrides: Partial<IssueInfo> = {}): IssueInfo {
  return {
    id: 'test-id',
    identifier: 'ENG-99',
    title: 'Test issue',
    description: 'Do the thing',
    priority: 2,
    labels: [],
    stateName: 'Todo',
    ...overrides,
  }
}

describe('continuation prompt', () => {
  it('includes review body when reason starts with review requested changes', async () => {
    const { buildContinuationPrompt } = await import('./prompt.js')
    const issue = makeIssue()
    const reason = 'review requested changes:\n\nPlease fix the type error in line 42'
    const prompt = buildContinuationPrompt(issue, reason)
    expect(prompt).toContain('Please fix the type error in line 42')
    expect(prompt).toContain('Read the review feedback below carefully and address EVERY point')
    expect(prompt).toContain('gh pr view <number> --json reviews')
  })

  it('uses standard steps when reason is not review feedback', async () => {
    const { buildContinuationPrompt } = await import('./prompt.js')
    const issue = makeIssue()
    const prompt = buildContinuationPrompt(issue, 'CI checks failed')
    expect(prompt).toContain('CI checks failed')
    expect(prompt).not.toContain('Read the review feedback below carefully')
    expect(prompt).toContain('Fix the issue')
  })
})

describe('prompt routing', () => {
  it('feature issue prompt includes test step', async () => {
    const { buildPrompt } = await import('./prompt.js')
    const prompt = await buildPrompt(makeIssue(), { repoPath: '/nonexistent' })
    expect(prompt).toContain('Write tests that verify each acceptance criterion')
    expect(prompt).not.toContain('BUG FIX')
  })

  it('sentry-auto label triggers bug fix prompt', async () => {
    const { buildPrompt } = await import('./prompt.js')
    const prompt = await buildPrompt(makeIssue({ labels: ['sentry-auto'] }), { repoPath: '/nonexistent' })
    expect(prompt).toContain('BUG FIX')
    expect(prompt).toContain('reproduces the bug')
  })

  it('bug label triggers bug fix prompt', async () => {
    const { buildPrompt } = await import('./prompt.js')
    const prompt = await buildPrompt(makeIssue({ labels: ['bug'] }), { repoPath: '/nonexistent' })
    expect(prompt).toContain('BUG FIX')
  })

  it('rework prompt includes test step', async () => {
    const { buildPrompt } = await import('./prompt.js')
    const prompt = await buildPrompt(makeIssue({ stateName: 'Rework' }), { repoPath: '/nonexistent' })
    expect(prompt).toContain('Write tests that verify each acceptance criterion')
    expect(prompt).toContain('REWORK')
  })
})

describe('handoff injection', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'readFile')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('appends handoff content to prompt when attempt > 1 and handoff file exists', async () => {
    const handoffContent = '# Handoff — Attempt 1\n\n## Tried & Failed\nFix the imports'
    vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
      if (typeof p === 'string' && p.includes('handoffs')) return handoffContent
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    const { buildPrompt } = await import('./prompt.js')
    const prompt = await buildPrompt(makeIssue(), { attempt: 2, repoPath: '/nonexistent' })

    expect(prompt).toContain('## Previous Attempt Handoff')
    expect(prompt).toContain('Fix the imports')
    expect(prompt).toContain('IMPORTANT: Read the handoff above. Do NOT repeat the same mistakes.')
  })

  it('does not append handoff for attempt 1', async () => {
    const { buildPrompt } = await import('./prompt.js')
    const prompt = await buildPrompt(makeIssue(), { attempt: 1, repoPath: '/nonexistent' })

    expect(prompt).not.toContain('Previous Attempt Handoff')
  })

  it('does not crash when handoff file does not exist on attempt > 1', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const { buildPrompt } = await import('./prompt.js')
    const prompt = await buildPrompt(makeIssue(), { attempt: 2, repoPath: '/nonexistent' })

    expect(prompt).not.toContain('Previous Attempt Handoff')
    expect(prompt).toContain('ENG-99')
  })
})
