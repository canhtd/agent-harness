import { describe, it, expect } from 'vitest'
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
