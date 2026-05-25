import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/repo', stallTimeoutMs: 180_000 },
  LOCKS: '/tmp/locks',
  LOGS: '/tmp/logs',
  WORKSPACES: '/tmp/workspaces',
  log: { warn: vi.fn(), info: vi.fn() },
}))

vi.mock('./workspace.js', () => ({
  sanitize: (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_'),
}))

const mockReaddir = vi.fn()
const mockReadFile = vi.fn()
const mockStat = vi.fn()
const mockUnlink = vi.fn()

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
    writeFile: vi.fn(),
  },
}))

const mockExecSync = vi.fn()
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

const mockKill = vi.spyOn(process, 'kill').mockImplementation(() => true)

describe('detectStalls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses max(startedAt, log mtime) as baseline — startedAt wins', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 100_000).toISOString()
    const logMtime = new Date(now - 200_000)

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 1234, issueId: 'issue-1', identifier: 'ENG-99',
      startedAt, attempt: 1,
    }))
    mockKill.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })
    mockStat.mockResolvedValue({ mtime: logMtime })

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    const { log } = await import('./config.js')
    expect(vi.mocked(log.warn)).not.toHaveBeenCalled()
  })

  it('uses max(startedAt, log mtime) as baseline — log mtime wins', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 200_000).toISOString()
    const logMtime = new Date(now - 100_000)

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 1234, issueId: 'issue-1', identifier: 'ENG-99',
      startedAt, attempt: 1,
    }))
    mockKill.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })
    mockStat.mockResolvedValue({ mtime: logMtime })

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    const { log } = await import('./config.js')
    expect(vi.mocked(log.warn)).not.toHaveBeenCalled()
  })

  it('detects stall when both startedAt and mtime are old', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 300_000).toISOString()
    const logMtime = new Date(now - 250_000)

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 1234, issueId: 'issue-1', identifier: 'ENG-99',
      startedAt, attempt: 1,
    }))
    mockKill.mockImplementation(() => true)
    mockStat.mockResolvedValue({ mtime: logMtime })
    mockUnlink.mockResolvedValue(undefined)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    const { log } = await import('./config.js')
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'issue-1', issueIdentifier: 'ENG-99' }),
      'agent stalled',
    )
  })

  it('falls back to startedAt when log file missing', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 60_000).toISOString()

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 1234, issueId: 'issue-1', identifier: 'ENG-99',
      startedAt, attempt: 1,
    }))
    mockKill.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })
    mockStat.mockRejectedValue(new Error('ENOENT'))

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    const { log } = await import('./config.js')
    expect(vi.mocked(log.warn)).not.toHaveBeenCalled()
  })

  it('removes worktree after killing stalled agent', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 300_000).toISOString()

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 1234, issueId: 'issue-1', identifier: 'ENG-99',
      startedAt, attempt: 1,
    }))
    mockKill.mockImplementation(() => true)
    mockStat.mockRejectedValue(new Error('ENOENT'))
    mockUnlink.mockResolvedValue(undefined)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ cwd: '/tmp/repo' }),
    )
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('ENG-99'),
      expect.anything(),
    )
  })
})
