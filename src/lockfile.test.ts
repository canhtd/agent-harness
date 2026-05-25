import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { detectStalls, writeLock, type Lock } from './lockfile.js'
import { config, LOCKS, LOGS, WORKSPACES } from './config.js'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

describe('detectStalls', () => {
  const issueId = 'test-issue-1'
  const identifier = 'ENG-99'
  const lockPath = path.join(LOCKS, `${issueId}.json`)
  const logPath = path.join(LOGS, `${identifier}.log`)

  beforeEach(async () => {
    await fs.mkdir(LOCKS, { recursive: true })
    await fs.mkdir(LOGS, { recursive: true })
    vi.spyOn(process, 'kill').mockImplementation(() => true)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(lockPath, { force: true })
    await fs.rm(logPath, { force: true })
  })

  it('uses max(startedAt, log mtime) as baseline — fresh startedAt prevents false stall', async () => {
    const lock: Lock = {
      pid: 999999,
      issueId,
      identifier,
      startedAt: new Date().toISOString(),
      attempt: 1,
    }
    await writeLock(lock)
    // Log file with old mtime (simulating 0-byte log from previous run)
    await fs.writeFile(logPath, '')
    const past = new Date(Date.now() - 300_000)
    await fs.utimes(logPath, past, past)

    // pid not alive → skip (detectStalls only checks alive processes)
    // We need pid to be "alive" for the stall check
    const killSpy = vi.spyOn(process, 'kill')
    killSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true // isAlive check
      return true
    })

    await detectStalls()

    // Should NOT have killed the agent — startedAt is fresh, so baseline is recent
    const killCalls = killSpy.mock.calls.filter(
      ([, sig]) => sig === 'SIGKILL'
    )
    expect(killCalls.length).toBe(0)

    // Lock should still exist
    const lockExists = await fs.access(lockPath).then(() => true, () => false)
    expect(lockExists).toBe(true)
  })

  it('detects stall when both startedAt and log mtime are old', async () => {
    const oldTime = new Date(Date.now() - config.stallTimeoutMs - 10_000)
    const lock: Lock = {
      pid: 999998,
      issueId,
      identifier,
      startedAt: oldTime.toISOString(),
      attempt: 1,
    }
    await writeLock(lock)
    await fs.writeFile(logPath, 'some output')
    await fs.utimes(logPath, oldTime, oldTime)

    const killSpy = vi.spyOn(process, 'kill')
    killSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })

    await detectStalls()

    const killCalls = killSpy.mock.calls.filter(
      ([, sig]) => sig === 'SIGKILL'
    )
    expect(killCalls.length).toBeGreaterThan(0)

    // Lock should be removed
    const lockExists = await fs.access(lockPath).then(() => true, () => false)
    expect(lockExists).toBe(false)
  })

  it('removes worktree after killing stalled agent', async () => {
    const { execSync } = await import('node:child_process')
    const execSyncMock = vi.mocked(execSync)

    const oldTime = new Date(Date.now() - config.stallTimeoutMs - 10_000)
    const lock: Lock = {
      pid: 999997,
      issueId,
      identifier,
      startedAt: oldTime.toISOString(),
      attempt: 1,
    }
    await writeLock(lock)

    const killSpy = vi.spyOn(process, 'kill')
    killSpy.mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) return true
      return true
    })

    await detectStalls()

    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining(`git worktree remove`),
      expect.objectContaining({ cwd: config.repoPath }),
    )
    const call = execSyncMock.mock.calls[0]![0] as string
    expect(call).toContain(path.join(WORKSPACES, identifier))
  })
})
