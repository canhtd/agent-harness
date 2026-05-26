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

const mockExecSync = vi.fn()

vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/repo', stallTimeoutMs: 180_000 },
  LOCKS: '/tmp/locks',
  WORKSPACES: '/tmp/workspaces',
  LOGS: '/tmp/logs',
  log: logger,
}))

vi.mock('./workspace.js', () => ({
  sanitize: (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_'),
}))

const mockReaddir = vi.fn()
const mockReadFile = vi.fn()
const mockStat = vi.fn()
const mockWriteFile = vi.fn()
const mockUnlink = vi.fn()

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}))

const mockKill = vi.spyOn(process, 'kill').mockImplementation(() => true)

describe('detectStalls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logLines.length = 0
    mockUnlink.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('uses max(startedAt, log mtime) as baseline — startedAt wins when log is stale', async () => {
    const now = Date.now()
    const lock = {
      pid: 12345,
      issueId: 'issue-1',
      identifier: 'ENG-99',
      startedAt: new Date(now - 60_000).toISOString(),
      attempt: 1,
    }

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockResolvedValue({ mtime: new Date(now - 300_000) })
    mockKill.mockImplementation(() => true)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    expect(mockKill).not.toHaveBeenCalledWith(-12345, 'SIGKILL')
  })

  it('uses log mtime when it is newer than startedAt', async () => {
    const now = Date.now()
    const lock = {
      pid: 12345,
      issueId: 'issue-1',
      identifier: 'ENG-99',
      startedAt: new Date(now - 300_000).toISOString(),
      attempt: 1,
    }

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockResolvedValue({ mtime: new Date(now - 60_000) })
    mockKill.mockImplementation(() => true)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    expect(mockKill).not.toHaveBeenCalledWith(-12345, 'SIGKILL')
  })

  it('kills agent when idle exceeds stallTimeoutMs from baseline', async () => {
    const now = Date.now()
    const lock = {
      pid: 12345,
      issueId: 'issue-1',
      identifier: 'ENG-99',
      startedAt: new Date(now - 200_000).toISOString(),
      attempt: 1,
    }

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockResolvedValue({ mtime: new Date(now - 200_000) })
    mockKill.mockImplementation(() => true)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    expect(mockKill).toHaveBeenCalledWith(-12345, 'SIGKILL')
  })

  it('falls back to startedAt when log file does not exist', async () => {
    const now = Date.now()
    const lock = {
      pid: 12345,
      issueId: 'issue-1',
      identifier: 'ENG-99',
      startedAt: new Date(now - 10_000).toISOString(),
      attempt: 1,
    }

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockRejectedValue(new Error('ENOENT'))
    mockKill.mockImplementation(() => true)

    const { detectStalls } = await import('./lockfile.js')
    await detectStalls()

    expect(mockKill).not.toHaveBeenCalledWith(-12345, 'SIGKILL')
  })

  it('removes worktree after killing stalled agent', async () => {
    const now = Date.now()
    const lock = {
      pid: 12345,
      issueId: 'issue-1',
      identifier: 'ENG-99',
      startedAt: new Date(now - 200_000).toISOString(),
      attempt: 1,
    }

    mockReaddir.mockResolvedValue(['issue-1.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockResolvedValue({ mtime: new Date(now - 200_000) })
    mockKill.mockImplementation(() => true)

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

describe('spawnAgent log file mode', () => {
  it('spawnAgent uses "w" mode, spawnContinuation uses "a" mode', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(resolve(thisDir, 'runner.ts'), 'utf-8')

    const spawnFn = source.split('export async function spawnContinuation')
    const spawnAgentSrc = spawnFn[0]
    const spawnContSrc = spawnFn[1]

    expect(spawnAgentSrc).toMatch(/openSync\([\s\S]+?,\s*'w'\)/)
    expect(spawnContSrc).toMatch(/openSync\([\s\S]+?,\s*'a'\)/)
  })
})
