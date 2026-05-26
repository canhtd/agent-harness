import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/repo', stallTimeoutMs: 180_000 },
  LOCKS: '/tmp/locks',
  WORKSPACES: '/tmp/workspaces',
  LOGS: '/tmp/logs',
  log: { info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./workspace.js', () => ({
  sanitize: (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_'),
}))

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

const mockReaddir = vi.fn()
const mockReadFile = vi.fn()
const mockStat = vi.fn()
const mockUnlink = vi.fn().mockResolvedValue(undefined)
const mockWriteFile = vi.fn().mockResolvedValue(undefined)

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  },
}))

describe('detectStalls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnlink.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    vi.spyOn(process, 'kill').mockImplementation(() => true)
  })

  it('uses max(startedAt, log mtime) as baseline', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 100_000).toISOString()
    const logMtime = new Date(now - 60_000)

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 12345,
      issueId: 'issue-1',
      identifier: 'ENG-99',
      startedAt,
      attempt: 1,
    }))
    mockStat.mockResolvedValue({ mtime: logMtime })
    vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    // baseline = logMtime (60s ago) < stallTimeout (180s) → no kill
    expect(mockUnlink).not.toHaveBeenCalled()
  })

  it('kills agent when idle exceeds stallTimeout from startedAt', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 200_000).toISOString()

    mockReaddir.mockResolvedValue(['issue-2.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 12345,
      issueId: 'issue-2',
      identifier: 'ENG-100',
      startedAt,
      attempt: 1,
    }))
    mockStat.mockRejectedValue(new Error('ENOENT'))
    vi.spyOn(process, 'kill').mockImplementation(() => true)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    // baseline = startedAt (200s ago) > stallTimeout (180s) → kill
    expect(process.kill).toHaveBeenCalledWith(-12345, 'SIGKILL')
    expect(mockUnlink).toHaveBeenCalled()
  })

  it('removes worktree after killing stalled agent', async () => {
    const { execSync } = await import('node:child_process')
    const now = Date.now()
    const startedAt = new Date(now - 200_000).toISOString()

    mockReaddir.mockResolvedValue(['issue-3.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 12345,
      issueId: 'issue-3',
      identifier: 'ENG-101',
      startedAt,
      attempt: 1,
    }))
    mockStat.mockRejectedValue(new Error('ENOENT'))
    vi.spyOn(process, 'kill').mockImplementation(() => true)
    mockUnlink.mockResolvedValue(undefined)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ cwd: '/tmp/repo' }),
    )
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('/tmp/workspaces', 'ENG-101')),
      expect.anything(),
    )
  })

  it('does not kill when log mtime is recent even if startedAt is old', async () => {
    const now = Date.now()
    const startedAt = new Date(now - 300_000).toISOString()
    const logMtime = new Date(now - 10_000)

    mockReaddir.mockResolvedValue(['issue-4.json'])
    mockReadFile.mockResolvedValue(JSON.stringify({
      pid: 12345,
      issueId: 'issue-4',
      identifier: 'ENG-102',
      startedAt,
      attempt: 1,
    }))
    mockStat.mockResolvedValue({ mtime: logMtime })
    vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    // baseline = logMtime (10s ago) < stallTimeout → no kill
    expect(mockUnlink).not.toHaveBeenCalled()
  })
})
