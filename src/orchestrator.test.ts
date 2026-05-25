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
  config: { repoPath: '/tmp', maxConcurrent: 10, maxReworkConcurrent: 2, stallTimeoutMs: 180000, maxTurns: 5 },
  LOCKS: '/tmp/locks',
  WORKSPACES: '/tmp/workspaces',
  LOGS: '/tmp/logs',
  log: logger,
}))

vi.mock('node:fs/promises', () => ({
  default: { mkdir: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('./lockfile.js', () => ({
  listLocks: vi.fn().mockResolvedValue([{ pid: 1 }, { pid: 2 }, { pid: 3 }]),
  readLock: vi.fn().mockResolvedValue(null),
  writeLock: vi.fn(),
  isAlive: vi.fn().mockReturnValue(false),
  cleanup: vi.fn().mockResolvedValue([]),
  countRunning: vi.fn().mockResolvedValue(0),
  countRunningByState: vi.fn().mockResolvedValue(0),
  detectStalls: vi.fn().mockResolvedValue(undefined),
  removeLock: vi.fn(),
}))

vi.mock('./workspace.js', () => ({
  listWorktreeIdentifiers: vi.fn().mockResolvedValue(['ENG-1', 'ENG-2']),
  ensureWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  workspacePath: vi.fn((id: string) => `/tmp/workspaces/${id}`),
}))

vi.mock('./linear.js', () => ({
  fetchCandidates: vi.fn().mockResolvedValue([]),
  fetchInProgressIssues: vi.fn().mockResolvedValue([]),
  fetchIssueState: vi.fn(),
  fetchIssueStateByIdentifier: vi.fn(),
  transitionToDone: vi.fn(),
}))

vi.mock('./runner.js', () => ({
  spawnAgent: vi.fn(),
  spawnContinuation: vi.fn(),
}))

vi.mock('./github.js', () => ({
  checkPrStatus: vi.fn(),
}))

vi.mock('./review.js', () => ({
  reviewPr: vi.fn(),
}))

vi.mock('./sentry.js', () => ({
  pollSentry: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./hooks.js', () => ({
  loadHooksConfig: vi.fn().mockResolvedValue({}),
  runHook: vi.fn(),
}))

describe('tick health check', () => {
  beforeEach(() => {
    logLines.length = 0
  })

  it('logs health check with activeLocks, worktrees, and heapUsedMb', async () => {
    const { tick } = await import('./orchestrator.js')
    await tick()

    const healthLine = logLines.find((l) => l.includes('health check'))
    expect(healthLine).toBeDefined()

    const parsed = JSON.parse(healthLine!)
    expect(parsed).toMatchObject({
      activeLocks: 3,
      worktrees: 2,
    })
    expect(typeof parsed.heapUsedMb).toBe('number')
    expect(parsed.heapUsedMb).toBeGreaterThan(0)
  })
})
