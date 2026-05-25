import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Writable } from 'node:stream'
import pino from 'pino'

const logLines: string[] = []
const dest = new Writable({
  write(chunk, _enc, cb) {
    logLines.push(chunk.toString())
    cb()
  },
})
const logger = pino({ name: 'test' }, dest)

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/repo', maxConcurrent: 10, stallTimeoutMs: 180_000 },
  LOCKS: '/tmp/locks',
  WORKSPACES: '/tmp/workspaces',
  LOGS: '/tmp/logs',
  log: logger,
}))

vi.mock('./workspace.js', () => ({
  sanitize: (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_'),
}))

const mockReaddir = vi.fn()
const mockStat = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockUnlink = vi.fn()
vi.mock('node:fs/promises', () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}))

const mockExecSync = vi.fn()
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

const mockKill = vi.spyOn(process, 'kill').mockImplementation(() => true)

beforeEach(() => {
  vi.clearAllMocks()
  logLines.length = 0
  mockUnlink.mockResolvedValue(undefined)
})

describe('detectStalls', () => {
  it('uses max(startedAt, log mtime) as baseline — agent not stalled if startedAt is recent', async () => {
    const now = Date.now()
    const lock = {
      pid: 12345,
      issueId: 'issue-1',
      identifier: 'ENG-19',
      startedAt: new Date(now - 60_000).toISOString(), // 60s ago
      attempt: 1,
    }
    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    // Log file mtime is old (300s ago) — simulates no stdout yet
    mockStat.mockResolvedValue({ mtime: new Date(now - 300_000) })
    mockKill.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    // Should NOT kill because baseline = max(startedAt=60s ago, mtime=300s ago) = 60s ago < 180s threshold
    expect(mockKill).toHaveBeenCalledWith(12345, 0) // isAlive check
    expect(mockKill).not.toHaveBeenCalledWith(-12345, 'SIGKILL')
  })

  it('kills agent when both startedAt and mtime exceed threshold', async () => {
    const now = Date.now()
    const lock = {
      pid: 99999,
      issueId: 'issue-2',
      identifier: 'ENG-20',
      startedAt: new Date(now - 200_000).toISOString(), // 200s ago
      attempt: 1,
    }
    mockReaddir.mockResolvedValue(['issue-2.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockResolvedValue({ mtime: new Date(now - 250_000) }) // 250s ago
    mockKill.mockImplementation(() => true)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    // baseline = max(200s, 250s ago) = 200s ago > 180s threshold → kill
    expect(mockKill).toHaveBeenCalledWith(-99999, 'SIGKILL')
  })

  it('uses mtime as baseline when mtime > startedAt (agent actively outputting)', async () => {
    const now = Date.now()
    const lock = {
      pid: 11111,
      issueId: 'issue-3',
      identifier: 'ENG-21',
      startedAt: new Date(now - 200_000).toISOString(), // 200s ago
      attempt: 1,
    }
    mockReaddir.mockResolvedValue(['issue-3.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    // mtime is recent — agent is actively writing output
    mockStat.mockResolvedValue({ mtime: new Date(now - 30_000) })
    mockKill.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    // baseline = max(startedAt=200s ago, mtime=30s ago) = 30s ago < 180s → no kill
    expect(mockKill).not.toHaveBeenCalledWith(-11111, 'SIGKILL')
  })

  it('removes worktree after killing stalled agent', async () => {
    const now = Date.now()
    const lock = {
      pid: 77777,
      issueId: 'issue-4',
      identifier: 'ENG-22',
      startedAt: new Date(now - 200_000).toISOString(),
      attempt: 1,
    }
    mockReaddir.mockResolvedValue(['issue-4.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockResolvedValue({ mtime: new Date(now - 250_000) })
    mockKill.mockImplementation(() => true)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ cwd: '/tmp/repo', stdio: 'pipe' }),
    )
    expect(mockExecSync.mock.calls[0][0]).toContain('ENG-22')
  })

  it('falls back to startedAt when log file does not exist', async () => {
    const now = Date.now()
    const lock = {
      pid: 55555,
      issueId: 'issue-5',
      identifier: 'ENG-23',
      startedAt: new Date(now - 60_000).toISOString(), // 60s ago
      attempt: 1,
    }
    mockReaddir.mockResolvedValue(['issue-5.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockRejectedValue(new Error('ENOENT'))
    mockKill.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    // baseline = max(startedAt=60s ago, mtime=0) = 60s ago < 180s → no kill
    expect(mockKill).not.toHaveBeenCalledWith(-55555, 'SIGKILL')
  })
})
