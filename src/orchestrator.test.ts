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
  HANDOFFS: '/tmp/handoffs',
  log: logger,
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    unlink: vi.fn().mockResolvedValue(undefined),
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
  sanitize: vi.fn((s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_')),
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

vi.mock('./tokens.js', () => ({
  findSessionJsonl: vi.fn().mockReturnValue(null),
  aggregateTokens: vi.fn(),
  appendTokenRecord: vi.fn(),
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
      expect.objectContaining({ attempt: 2, turn: 0, pid: -1, exitCode: 0 }),
    )

    const freshLine = logLines.find((l) => l.includes('fresh attempt 2/3'))
    expect(freshLine).toBeDefined()
  })

  it('writes handoff file before creating fresh attempt', async () => {
    const fsModule = await import('node:fs/promises')
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')
    const github = await import('./github.js')

    vi.mocked(linear.fetchInProgressIssues).mockResolvedValue([
      { id: 'issue-1', identifier: 'ENG-50', title: 'Test', description: '', priority: 2, labels: [], stateName: 'In Progress' },
    ])
    vi.mocked(lockfile.readLock).mockResolvedValue({
      pid: 999, issueId: 'issue-1', identifier: 'ENG-50',
      startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 5, exitCode: 0,
    })
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(github.getOpenPrNumber).mockReturnValue(42)
    vi.mocked(github.fetchLastReviewBody).mockReturnValue('Fix the type errors')
    vi.mocked(fsModule.default.readFile).mockRejectedValue(new Error('ENOENT'))

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('# Handoff — Attempt 1'),
      'utf-8',
    )
    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('Fix the type errors'),
      'utf-8',
    )

    const handoffLine = logLines.find((l) => l.includes('handoff written'))
    expect(handoffLine).toBeDefined()
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

describe('writeHandoff', () => {
  beforeEach(() => {
    logLines.length = 0
    vi.resetModules()
  })

  it('writes handoff with review feedback and log tail', async () => {
    const fsModule = await import('node:fs/promises')
    const github = await import('./github.js')

    vi.mocked(github.fetchLastReviewBody).mockReturnValue('Type error on line 42')
    vi.mocked(fsModule.default.readFile).mockResolvedValue('line 1\nline 2\nline 3')

    const { writeHandoff } = await import('./orchestrator.js')
    await writeHandoff('ENG-50', 1, 5, 42)

    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('# Handoff — Attempt 1'),
      'utf-8',
    )
    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('PR #42 bị reject sau 5 turns'),
      'utf-8',
    )
    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('Type error on line 42'),
      'utf-8',
    )
    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('line 1\nline 2\nline 3'),
      'utf-8',
    )
  })

  it('handles missing log file gracefully', async () => {
    const fsModule = await import('node:fs/promises')
    const github = await import('./github.js')

    vi.mocked(github.fetchLastReviewBody).mockReturnValue('some feedback')
    vi.mocked(fsModule.default.readFile).mockRejectedValue(new Error('ENOENT'))

    const { writeHandoff } = await import('./orchestrator.js')
    await writeHandoff('ENG-50', 1, 5, 42)

    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('(no log available)'),
      'utf-8',
    )
  })

  it('handles null prNumber', async () => {
    const fsModule = await import('node:fs/promises')
    vi.mocked(fsModule.default.readFile).mockRejectedValue(new Error('ENOENT'))

    const { writeHandoff } = await import('./orchestrator.js')
    await writeHandoff('ENG-50', 1, 5, null)

    expect(vi.mocked(fsModule.default.writeFile)).toHaveBeenCalledWith(
      '/tmp/handoffs/ENG-50.md',
      expect.stringContaining('PR #unknown'),
      'utf-8',
    )
  })
})

describe('removeHandoff', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('deletes the handoff file', async () => {
    const fsModule = await import('node:fs/promises')

    const { removeHandoff } = await import('./orchestrator.js')
    await removeHandoff('ENG-50')

    expect(vi.mocked(fsModule.default.unlink)).toHaveBeenCalledWith('/tmp/handoffs/ENG-50.md')
  })

  it('does not throw if file does not exist', async () => {
    const fsModule = await import('node:fs/promises')
    vi.mocked(fsModule.default.unlink).mockRejectedValue(new Error('ENOENT'))

    const { removeHandoff } = await import('./orchestrator.js')
    await expect(removeHandoff('ENG-50')).resolves.not.toThrow()
  })
})

describe('reconcileTerminal cleans up handoffs', () => {
  beforeEach(() => {
    logLines.length = 0
    vi.resetModules()
  })

  it('removes handoff file when issue transitions to terminal state', async () => {
    const fsModule = await import('node:fs/promises')
    const lockfile = await import('./lockfile.js')
    const linear = await import('./linear.js')

    vi.mocked(lockfile.listLocks).mockResolvedValue([
      { pid: 999, issueId: 'issue-1', identifier: 'ENG-50', startedAt: '2025-01-01T00:00:00Z', attempt: 1, turn: 3 },
    ])
    vi.mocked(lockfile.isAlive).mockReturnValue(false)
    vi.mocked(linear.fetchIssueState).mockResolvedValue({ terminal: true, stateName: 'Done' })

    const { tick } = await import('./orchestrator.js')
    await tick()

    expect(vi.mocked(fsModule.default.unlink)).toHaveBeenCalledWith('/tmp/handoffs/ENG-50.md')
  })
})
