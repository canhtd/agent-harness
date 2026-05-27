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
  config: { repoPath: '/tmp', maxConcurrent: 10, maxReworkConcurrent: 2, stallTimeoutMs: 180000, maxTurns: 5, maxAttempts: 3, babysitCooldownMs: 600_000, babysitThreshold: 3 },
  LOCKS: '/tmp/locks',
  WORKSPACES: '/tmp/workspaces',
  LOGS: '/tmp/logs',
  HANDOFFS: '/tmp/handoffs',
  BABYSIT_STATE: '/tmp/babysit-last.json',
  log: logger,
}))

const mockFsReadFile = vi.fn().mockRejectedValue(new Error('ENOENT'))
const mockFsWriteFile = vi.fn().mockResolvedValue(undefined)

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
  },
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
  spawnBabysit: vi.fn().mockReturnValue(99999),
}))

vi.mock('./github.js', () => ({
  checkPrStatus: vi.fn(),
  getOpenPrNumber: vi.fn().mockReturnValue(null),
  closePr: vi.fn(),
  deleteRemoteBranch: vi.fn(),
  fetchLastReviewBody: vi.fn().mockReturnValue(''),
  getPrHeadSha: vi.fn().mockReturnValue('abc123'),
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

vi.mock('./tokens.js', () => ({
  findSessionJsonl: vi.fn().mockReturnValue(null),
  aggregateTokens: vi.fn(),
  appendTokenRecord: vi.fn(),
}))

vi.mock('./handoff.js', () => ({
  writeHandoff: vi.fn().mockResolvedValue(undefined),
  removeHandoff: vi.fn().mockResolvedValue(undefined),
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
    const handoff = await import('./handoff.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-1', identifier: 'ENG-50', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-1', identifier: 'ENG-50',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 5, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'redispatch', reason: 'CI failed' })
    vi.mocked(github.getOpenPrNumber).mockReturnValue(42)

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(handoff.writeHandoff)).toHaveBeenCalledWith('issue-1', 'ENG-50', 1, 5, 42)
    expect(vi.mocked(github.closePr)).toHaveBeenCalledWith(42)
    expect(vi.mocked(github.deleteRemoteBranch)).toHaveBeenCalledWith('ENG-50')
    expect(vi.mocked(workspace.removeWorktree)).toHaveBeenCalledWith('ENG-50')
    expect(vi.mocked(lockfile.writeLock)).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2, turn: 0, pid: -1, exitCode: 0 }),
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
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'redispatch', reason: 'review rejected' })
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

describe('reconcile: PR status checked before max turns', () => {
  beforeEach(() => {
    logLines.length = 0
    vi.resetModules()
  })

  it('transitions to Done when PR merged at max turn', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-3', identifier: 'ENG-60', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-3', identifier: 'ENG-60',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 5, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'done' })
    vi.mocked(github.getOpenPrNumber).mockReturnValue(null)
    vi.mocked(github.closePr).mockReset()

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(linear.transitionToDone)).toHaveBeenCalledWith('issue-3')
    expect(vi.mocked(lockfile.removeLock)).toHaveBeenCalledWith('issue-3')

    const doneLine = logLines.find((l) => l.includes('PR merged, transitioned to Done'))
    expect(doneLine).toBeDefined()

    expect(vi.mocked(github.closePr)).not.toHaveBeenCalled()
  })

  it('triggers review when PR needs review at max turn', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const review = await import('./review.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-4', identifier: 'ENG-61', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-4', identifier: 'ENG-61',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 5, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'review', prNumber: 77 })
    vi.mocked(github.getOpenPrNumber).mockReturnValue(null)
    vi.mocked(github.closePr).mockReset()
    vi.mocked(linear.transitionToBlocked).mockReset()
    vi.mocked(review.reviewPr).mockResolvedValue({ approved: false, results: [] })

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(review.reviewPr)).toHaveBeenCalledWith(77, '')

    const reviewLine = logLines.find((l) => l.includes('triggering review'))
    expect(reviewLine).toBeDefined()

    expect(vi.mocked(github.closePr)).not.toHaveBeenCalled()
    expect(vi.mocked(linear.transitionToBlocked)).not.toHaveBeenCalled()
  })

  it('triggers fresh attempt when redispatch at max turn', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const workspace = await import('./workspace.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-5', identifier: 'ENG-62', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-5', identifier: 'ENG-62',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 5, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'redispatch', reason: 'merge conflict' })
    vi.mocked(github.getOpenPrNumber).mockReturnValue(88)

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(github.closePr)).toHaveBeenCalledWith(88)
    expect(vi.mocked(github.deleteRemoteBranch)).toHaveBeenCalledWith('ENG-62')
    expect(vi.mocked(workspace.removeWorktree)).toHaveBeenCalledWith('ENG-62')
    expect(vi.mocked(lockfile.writeLock)).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2, turn: 0, pid: -1, exitCode: 0 }),
    )

    const freshLine = logLines.find((l) => l.includes('fresh attempt 2/3'))
    expect(freshLine).toBeDefined()
  })
})

describe('reconcile: post comment on redispatch', () => {
  beforeEach(() => {
    logLines.length = 0
    vi.resetModules()
  })

  it('posts turn comment before re-dispatching', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const workspace = await import('./workspace.js')
    const runner = await import('./runner.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-c1', identifier: 'ENG-80', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-c1', identifier: 'ENG-80',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 2, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'redispatch', reason: 'CI failed' })
    vi.mocked(workspace.ensureWorktree).mockResolvedValue({ path: '/tmp/workspaces/ENG-80', created: false })
    vi.mocked(runner.spawnContinuation).mockResolvedValue(1234)

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(linear.postComment)).toHaveBeenCalledWith(
      'issue-c1',
      '**Turn 2 result**: CI failed\n\nDispatching turn 3 to fix.',
    )
    expect(vi.mocked(runner.spawnContinuation)).toHaveBeenCalled()
  })

  it('dispatches even when comment post fails', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const workspace = await import('./workspace.js')
    const runner = await import('./runner.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-c2', identifier: 'ENG-81', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-c2', identifier: 'ENG-81',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 1, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'redispatch', reason: 'tests failed' })
    vi.mocked(linear.postComment).mockRejectedValueOnce(new Error('Linear API timeout'))
    vi.mocked(workspace.ensureWorktree).mockResolvedValue({ path: '/tmp/workspaces/ENG-81', created: false })
    vi.mocked(runner.spawnContinuation).mockResolvedValue(5678)

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(runner.spawnContinuation)).toHaveBeenCalled()

    const warnLine = logLines.find((l) => l.includes('failed to post turn comment'))
    expect(warnLine).toBeDefined()
  })

  it('does not post comment on skip, done, or review', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const review = await import('./review.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-c3', identifier: 'ENG-82', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
      { id: 'issue-c4', identifier: 'ENG-83', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
      { id: 'issue-c5', identifier: 'ENG-84', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-c3', identifier: 'ENG-82',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 2, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)

    let callCount = 0
    vi.mocked(github.checkPrStatus).mockImplementation(() => {
      callCount++
      if (callCount === 1) return { action: 'done' }
      if (callCount === 2) return { action: 'review', prNumber: 99 }
      return { action: 'skip', reason: 'waiting' }
    })
    vi.mocked(review.reviewPr).mockResolvedValue({ approved: true, results: [] })
    vi.mocked(linear.postComment).mockClear()

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(linear.postComment)).not.toHaveBeenCalled()
  })
})

describe('reconcileTerminal: handoff cleanup', () => {
  beforeEach(() => {
    logLines.length = 0
    vi.resetModules()
  })

  it('removes handoff file when issue transitions to terminal state', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const handoff = await import('./handoff.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-10', identifier: 'ENG-70', startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 3 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(linear.fetchIssueState).mockResolvedValue({ terminal: true, stateName: 'Done' })
    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([])

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(handoff.removeHandoff)).toHaveBeenCalledWith('ENG-70')
  })
})

describe('detectStuck', () => {
  beforeEach(async () => {
    logLines.length = 0
    vi.resetModules()
    mockFsReadFile.mockRejectedValue(new Error('ENOENT'))
    mockFsWriteFile.mockResolvedValue(undefined)
    const runner = await import('./runner.js')
    vi.mocked(runner.spawnBabysit).mockClear()
  })

  it('spawns babysit when agent exceeds threshold attempts and pid is dead', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s1', identifier: 'ENG-90', startedAt: '2025-01-01T00:00:00Z', attempt: 3, exitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)

    const { detectStuck } = await import('./orchestrator.js')
    const stuckIds = await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).toHaveBeenCalledWith(
      expect.stringContaining('ENG-90'),
    )
    expect(mockFsWriteFile).toHaveBeenCalledWith(
      '/tmp/babysit-last.json',
      expect.stringContaining('"pid":99999'),
    )
    expect(stuckIds).toEqual(new Set(['issue-s1']))
  })

  it('does not spawn babysit when agent pid is alive', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s2', identifier: 'ENG-91', startedAt: '2025-01-01T00:00:00Z', attempt: 5, exitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(true)

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).not.toHaveBeenCalled()
  })

  it('does not spawn babysit when attempts below threshold and no repeating error', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s3', identifier: 'ENG-92', startedAt: '2025-01-01T00:00:00Z', attempt: 2, exitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).not.toHaveBeenCalled()
  })

  it('does not spawn babysit for placeholder locks (pid=-1, exitCode=0)', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: -1, issueId: 'issue-p1', identifier: 'ENG-99', startedAt: '2025-01-01T00:00:00Z', attempt: 3, exitCode: 0 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).not.toHaveBeenCalled()
  })

  it('does not spawn babysit when exitCode is undefined (cleanup not yet processed)', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s7', identifier: 'ENG-96', startedAt: '2025-01-01T00:00:00Z', attempt: 5 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).not.toHaveBeenCalled()
  })

  it('spawns babysit when same error code repeats even below threshold', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s8', identifier: 'ENG-97', startedAt: '2025-01-01T00:00:00Z', attempt: 2, exitCode: 1, lastExitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).toHaveBeenCalledWith(
      expect.stringContaining('same exit code 1 repeating'),
    )
  })

  it('does not trigger repeating-error when exit codes differ', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s9', identifier: 'ENG-98', startedAt: '2025-01-01T00:00:00Z', attempt: 2, exitCode: 2, lastExitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).not.toHaveBeenCalled()
  })

  it('throttles babysit within cooldown window', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s4', identifier: 'ENG-93', startedAt: '2025-01-01T00:00:00Z', attempt: 5, exitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    mockFsReadFile.mockResolvedValue(JSON.stringify({
      lastSpawnedAt: new Date().toISOString(),
      pid: 88888,
    }))

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).not.toHaveBeenCalled()

    const throttleLine = logLines.find((l) => l.includes('babysit throttled'))
    expect(throttleLine).toBeDefined()
  })

  it('does not spawn when babysit agent pid is still alive', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s5', identifier: 'ENG-94', startedAt: '2025-01-01T00:00:00Z', attempt: 5, exitCode: 1 },
    ])

    const isAliveImpl = (pid: number) => pid === 77777
    vi.mocked(lockfile.isAlive).mockImplementation(isAliveImpl)

    mockFsReadFile.mockResolvedValue(JSON.stringify({
      lastSpawnedAt: new Date(Date.now() - 700_000).toISOString(),
      pid: 77777,
    }))

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).not.toHaveBeenCalled()

    const stillRunningLine = logLines.find((l) => l.includes('babysit agent still running'))
    expect(stillRunningLine).toBeDefined()
  })

  it('spawns babysit when cooldown expired', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-s6', identifier: 'ENG-95', startedAt: '2025-01-01T00:00:00Z', attempt: 4, exitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    mockFsReadFile.mockResolvedValue(JSON.stringify({
      lastSpawnedAt: new Date(Date.now() - 700_000).toISOString(),
      pid: 88888,
    }))

    const { detectStuck } = await import('./orchestrator.js')
    await detectStuck()

    expect(vi.mocked(runner.spawnBabysit)).toHaveBeenCalled()
  })

  it('returns stuck issue IDs so reconcile can skip them', async () => {
    const lockfile = await import('./lockfile.js')
    const runner = await import('./runner.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')

    vi.mocked(runner.spawnAgent).mockClear()
    vi.mocked(runner.spawnContinuation).mockClear()

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-stuck', identifier: 'ENG-100', startedAt: '2025-01-01T00:00:00Z', attempt: 3, exitCode: 1 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-stuck', identifier: 'ENG-100', title: 'Stuck', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'redispatch', reason: 'CI failed' })

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(runner.spawnBabysit)).toHaveBeenCalled()
    expect(vi.mocked(runner.spawnContinuation)).not.toHaveBeenCalled()
    expect(vi.mocked(runner.spawnAgent)).not.toHaveBeenCalled()
  })
})

describe('review circuit breaker', () => {
  beforeEach(() => {
    logLines.length = 0
    vi.resetModules()
  })

  it('trips after 3 consecutive review failures', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const review = await import('./review.js')

    vi.mocked(review.reviewPr).mockClear()
    vi.mocked(linear.postComment).mockClear()
    vi.mocked(linear.transitionToBlocked).mockClear()

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-rb1', identifier: 'ENG-110', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-rb1', identifier: 'ENG-110',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 2, exitCode: 0,
      reviewFailCount: 3, reviewFailPrHead: 'abc123', reviewFailError: 'Cannot approve your own pull request',
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'review', prNumber: 81 })
    vi.mocked(github.getPrHeadSha).mockReturnValue('abc123')

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(review.reviewPr)).not.toHaveBeenCalled()
    expect(vi.mocked(linear.postComment)).toHaveBeenCalledWith(
      'issue-rb1',
      expect.stringContaining('Review circuit breaker tripped'),
    )
    expect(vi.mocked(linear.postComment)).toHaveBeenCalledWith(
      'issue-rb1',
      expect.stringContaining('Cannot approve your own pull request'),
    )
    expect(vi.mocked(linear.transitionToBlocked)).toHaveBeenCalledWith('issue-rb1')

    const tripLine = logLines.find((l) => l.includes('review circuit breaker tripped'))
    expect(tripLine).toBeDefined()
  })

  it('increments reviewFailCount on review error', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const review = await import('./review.js')

    vi.mocked(lockfile.writeLock).mockClear()

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-rb2', identifier: 'ENG-111', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-rb2', identifier: 'ENG-111',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 2, exitCode: 0,
      reviewFailCount: 1, reviewFailPrHead: 'abc123',
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'review', prNumber: 82 })
    vi.mocked(github.getPrHeadSha).mockReturnValue('abc123')
    vi.mocked(review.reviewPr).mockRejectedValue(new Error('Cannot approve your own pull request'))

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(lockfile.writeLock)).toHaveBeenCalledWith(
      expect.objectContaining({ reviewFailCount: 2, reviewFailPrHead: 'abc123', reviewFailError: expect.stringContaining('Cannot approve') }),
    )
  })

  it('resets reviewFailCount when new commits detected', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const review = await import('./review.js')

    vi.mocked(review.reviewPr).mockClear()
    vi.mocked(linear.transitionToBlocked).mockClear()
    vi.mocked(lockfile.writeLock).mockClear()

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-rb3', identifier: 'ENG-112', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-rb3', identifier: 'ENG-112',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 2, exitCode: 0,
      reviewFailCount: 3, reviewFailPrHead: 'old-sha', reviewFailError: 'some error',
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'review', prNumber: 83 })
    vi.mocked(github.getPrHeadSha).mockReturnValue('new-sha')
    vi.mocked(review.reviewPr).mockResolvedValue({ approved: true, results: [] })

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(review.reviewPr)).toHaveBeenCalledWith(83, '')
    expect(vi.mocked(linear.transitionToBlocked)).not.toHaveBeenCalled()

    const resetLine = logLines.find((l) => l.includes('review circuit breaker reset'))
    expect(resetLine).toBeDefined()
  })

  it('resets reviewFailCount on successful review', async () => {
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')
    const review = await import('./review.js')

    vi.mocked(lockfile.writeLock).mockClear()

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-rb4', identifier: 'ENG-113', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-rb4', identifier: 'ENG-113',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 2, exitCode: 0,
      reviewFailCount: 2, reviewFailPrHead: 'abc123', reviewFailError: 'some error',
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.checkPrStatus).mockReturnValue({ action: 'review', prNumber: 84 })
    vi.mocked(github.getPrHeadSha).mockReturnValue('abc123')
    vi.mocked(review.reviewPr).mockResolvedValue({ approved: false, results: [] })

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(lockfile.writeLock)).toHaveBeenCalledWith(
      expect.objectContaining({ reviewFailCount: 0, reviewFailPrHead: undefined, reviewFailError: undefined }),
    )
  })
})
