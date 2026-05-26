import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOpenSync = vi.fn().mockReturnValue(3)
const mockSpawn = vi.fn().mockReturnValue({ unref: vi.fn(), pid: 12345 })

vi.mock('node:fs', () => ({
  openSync: (...args: unknown[]) => mockOpenSync(...args),
}))

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/repo' },
  LOCKS: '/tmp/locks',
  LOGS: '/tmp/logs',
}))

vi.mock('./workspace.js', () => ({
  sanitize: (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_'),
}))

vi.mock('./prompt.js', () => ({
  buildPrompt: vi.fn().mockResolvedValue('test prompt'),
  buildContinuationPrompt: vi.fn().mockReturnValue('continuation prompt'),
}))

vi.mock('./linear.js', () => ({}))

import { spawnAgent, spawnContinuation } from './runner.js'
import type { IssueInfo } from './linear.js'

const fakeIssue: IssueInfo = {
  id: 'issue-1',
  identifier: 'ENG-99',
  title: 'Test issue',
  description: 'desc',
  priority: 2,
  labels: [],
  stateName: 'Todo',
}

describe('runner log file modes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('spawnAgent opens log with write mode (w) for fresh log', async () => {
    await spawnAgent(fakeIssue, '/tmp/ws')
    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-99.log'),
      'w',
    )
  })

  it('spawnContinuation opens log with append mode (a)', async () => {
    await spawnContinuation(fakeIssue, '/tmp/ws', 'review feedback')
    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-99.log'),
      'a',
    )
  })
})
