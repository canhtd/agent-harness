import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/repo', maxConcurrent: 10 },
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

const mockOpenSync = vi.fn().mockReturnValue(99)
vi.mock('node:fs', () => ({
  openSync: (...args: unknown[]) => mockOpenSync(...args),
}))

const mockChild = { unref: vi.fn(), pid: 123 }
const mockSpawn = vi.fn().mockReturnValue(mockChild)
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const fakeIssue = {
  id: 'issue-1',
  identifier: 'ENG-19',
  title: 'Test issue',
  description: 'desc',
  priority: 2,
  createdAt: '2026-01-01',
  state: { name: 'Todo', type: 'started' },
  labels: [],
}

describe('spawnAgent', () => {
  it('opens log file with "w" mode (truncate)', async () => {
    const { spawnAgent } = await import('./runner.js')
    await spawnAgent(fakeIssue as any, '/tmp/ws')

    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-19.log'),
      'w',
    )
  })
})

describe('spawnContinuation', () => {
  it('opens log file with "a" mode (append)', async () => {
    const { spawnContinuation } = await import('./runner.js')
    await spawnContinuation(fakeIssue as any, '/tmp/ws', 'review feedback')

    expect(mockOpenSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-19.log'),
      'a',
    )
  })
})
