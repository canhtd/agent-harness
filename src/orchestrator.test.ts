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
  config: { repoPath: '/tmp', maxConcurrent: 10, maxReworkConcurrent: 2, stallTimeoutMs: 180000, maxTurns: 5, maxAttempts: 3 },
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
  transitionToBlocked: vi.fn().mockResolvedValue(undefined),
  postComment: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./runner.js', () => ({
  spawnAgent: vi.fn(),
  spawnContinuation: vi.fn(),
}))

vi.mock('./github.js', () => ({
  checkPrStatus: vi.fn(),
  getOpenPrNumber: vi.fn().mockReturnValue(null),
  closePr: vi.fn(),
  fetchLastReviewBody: vi.fn().mockReturnValue(''),
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

describe('reconcile: fresh attempt on max turns', () => {
  beforeEach(() => {
    logLines.length = 0
    vi.resetModules()
  })

  it('resets lock for fresh attempt when turns exhausted but attempts remain', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const workspace = await import('./workspace.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-1', identifier: 'ENG-50', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-1', identifier: 'ENG-50',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 5, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.getOpenPrNumber).mockReturnValue(42)

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(github.closePr)).toHaveBeenCalledWith(42)
    expect(vi.mocked(workspace.removeWorktree)).toHaveBeenCalledWith('ENG-50')
    expect(vi.mocked(lockfile.writeLock)).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2, turn: 0, pid: 0 }),
    )

    const freshLine = logLines.find((l) => l.includes('fresh attempt 2/3'))
    expect(freshLine).toBeDefined()
  })

  it('escalates to human when all attempts exhausted', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-2', identifier: 'ENG-51', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-2', identifier: 'ENG-51',
      startedAt: '2025-01-01T00:00:00Z', attempt: 3, turn: 5, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.getOpenPrNumber).mockReturnValue(43)
    vi.mocked(github.fetchLastReviewBody).mockReturnValue('Fix the type errors')

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(linear.postComment)).toHaveBeenCalledWith(
      'issue-2',
      expect.stringContaining('Agent hit max attempts (3)'),
    )
    expect(vi.mocked(linear.postComment)).toHaveBeenCalledWith(
      'issue-2',
      expect.stringContaining('Fix the type errors'),
    )
    expect(vi.mocked(linear.transitionToBlocked)).toHaveBeenCalledWith('issue-2')
    expect(vi.mocked(lockfile.removeLock)).toHaveBeenCalledWith('issue-2')

    const escalateLine = logLines.find((l) => l.includes('escalating to human'))
    expect(escalateLine).toBeDefined()
  })
})
