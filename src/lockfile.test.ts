import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lock } from './lockfile.js'

const mockReaddir = vi.fn()
const mockReadFile = vi.fn()
const mockStat = vi.fn()
const mockUnlink = vi.fn()
const mockExecSync = vi.fn()

vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    stat: (...args: unknown[]) => mockStat(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
    writeFile: vi.fn(),
    access: vi.fn(),
  },
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  writeFile: vi.fn(),
  access: vi.fn(),
}))

vi.mock('./config.js', () => ({
  config: { stallTimeoutMs: 180_000, repoPath: '/tmp/repo' },
  LOCKS: '/tmp/locks',
  LOGS: '/tmp/logs',
  WORKSPACES: '/tmp/workspaces',
  log: { info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./workspace.js', () => ({
  sanitize: (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_'),
}))

import * as lockfile from './lockfile.js'

function killCalls(spy: ReturnType<typeof vi.spyOn>): unknown[][] {
  return spy.mock.calls.filter(([, sig]: unknown[]) => sig !== 0)
}

describe('detectStalls baseline logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeLock(overrides: Partial<Lock> = {}): Lock {
    return {
      pid: 99999,
      issueId: 'abc',
      identifier: 'ENG-99',
      startedAt: new Date().toISOString(),
      attempt: 1,
      ...overrides,
    }
  }

  it('does not kill agent when startedAt is recent (< threshold)', async () => {
    const now = Date.now()
    const lock = makeLock({ startedAt: new Date(now - 60_000).toISOString() })

    mockReaddir.mockResolvedValue(['abc.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockRejectedValue(new Error('ENOENT'))
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

    await lockfile.detectStalls()
    expect(killCalls(killSpy)).toHaveLength(0)
  })

  it('uses mtime as baseline when log mtime > startedAt', async () => {
    const now = Date.now()
    const lock = makeLock({ startedAt: new Date(now - 200_000).toISOString() })

    mockReaddir.mockResolvedValue(['abc.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockResolvedValue({ mtime: new Date(now - 30_000) })
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

    await lockfile.detectStalls()
    expect(killCalls(killSpy)).toHaveLength(0)
  })

  it('kills agent when idle exceeds threshold (no log output)', async () => {
    const now = Date.now()
    const lock = makeLock({ startedAt: new Date(now - 200_000).toISOString() })

    mockReaddir.mockResolvedValue(['abc.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockRejectedValue(new Error('ENOENT'))
    mockUnlink.mockResolvedValue(undefined)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

    await lockfile.detectStalls()
    expect(killCalls(killSpy).length).toBeGreaterThan(0)
  })

  it('removes worktree after killing stalled agent', async () => {
    const now = Date.now()
    const lock = makeLock({ startedAt: new Date(now - 200_000).toISOString() })

    mockReaddir.mockResolvedValue(['abc.json'])
    mockReadFile.mockResolvedValue(JSON.stringify(lock))
    mockStat.mockRejectedValue(new Error('ENOENT'))
    mockUnlink.mockResolvedValue(undefined)
    vi.spyOn(process, 'kill').mockImplementation(() => true)

    await lockfile.detectStalls()
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ cwd: '/tmp/repo' }),
    )
  })
})
