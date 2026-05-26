import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOpenSync = vi.fn().mockReturnValue(3)
const mockSpawn = vi.fn().mockReturnValue({ unref: vi.fn(), pid: 9999 })

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

const issue = {
  id: 'issue-1',
  identifier: 'ENG-50',
  title: 'Test issue',
  description: 'Do something',
  priority: 2,
  labels: [],
  stateName: 'In Progress',
}

describe('spawnAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens log file with "w" flag (truncate)', async () => {
    const { spawnAgent } = await import('./runner.js')
    await spawnAgent(issue, '/tmp/ws')

    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-50.log'),
      'w',
    )
  })
})

describe('spawnContinuation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens log file with "a" flag (append)', async () => {
    const { spawnContinuation } = await import('./runner.js')
    await spawnContinuation(issue, '/tmp/ws', 'review feedback')

    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-50.log'),
      'a',
    )
  })
})
