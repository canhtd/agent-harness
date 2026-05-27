import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOpenSync = vi.fn().mockReturnValue(3)
const mockReadFileSync = vi.fn().mockReturnValue('# Babysit skill content')
const mockSpawn = vi.fn().mockReturnValue({ unref: vi.fn(), pid: 12345 })

vi.mock('node:fs', () => ({
  openSync: (...args: unknown[]) => mockOpenSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
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
  buildResearchPrompt: vi.fn().mockReturnValue('research prompt'),
}))

vi.mock('./linear.js', () => ({}))

import { spawnAgent, spawnContinuation, spawnBabysit, spawnResearchAgent } from './runner.js'
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

describe('spawnBabysit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads skill file and spawns in repo root', () => {
    const pid = spawnBabysit('Issue ENG-1: stuck')
    expect(pid).toBe(12345)
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('babysit/SKILL.md'),
      'utf-8',
    )
    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('babysit.log'),
      'a',
    )
    expect(mockSpawn).toHaveBeenCalledWith(
      'sh',
      expect.arrayContaining(['-c']),
      expect.objectContaining({ cwd: '/tmp/repo' }),
    )
  })

  it('does not use --continue flag', () => {
    spawnBabysit('context')
    const shCommand = mockSpawn.mock.calls[0][1][1]
    expect(shCommand).not.toContain('--continue')
  })
})

describe('spawnResearchAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('spawns in repo root, not a worktree', () => {
    spawnResearchAgent(fakeIssue)
    expect(mockSpawn).toHaveBeenCalledWith(
      'sh',
      expect.arrayContaining(['-c']),
      expect.objectContaining({ cwd: '/tmp/repo' }),
    )
  })

  it('opens log in write mode', () => {
    spawnResearchAgent(fakeIssue)
    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-99.log'),
      'w',
    )
  })

  it('uses --verbose and --output-format stream-json', () => {
    spawnResearchAgent(fakeIssue)
    const shCommand = mockSpawn.mock.calls[0][1][1]
    expect(shCommand).toContain('--verbose')
    expect(shCommand).toContain('--output-format stream-json')
  })

  it('does not use --continue flag', () => {
    spawnResearchAgent(fakeIssue)
    const shCommand = mockSpawn.mock.calls[0][1][1]
    expect(shCommand).not.toContain('--continue')
  })
})
