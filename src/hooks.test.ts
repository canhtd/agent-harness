import { describe, it, expect, vi, beforeEach } from 'vitest'

const { logLines, logger, mockExecSync, mockExistsSync, mockRmSync } = vi.hoisted(() => {
  const { Writable } = require('node:stream')
  const pino = require('pino')
  const lines: string[] = []
  const dest = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      lines.push(chunk.toString())
      cb()
    },
  })
  return {
    logLines: lines,
    logger: pino({ name: 'test' }, dest),
    mockExecSync: vi.fn(),
    mockExistsSync: vi.fn(),
    mockRmSync: vi.fn(),
  }
})

vi.mock('./config.js', () => ({
  log: logger,
}))

vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    rmSync: (...args: unknown[]) => mockRmSync(...args),
  },
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  },
}))

const meta = { issueId: 'issue-1', issueIdentifier: 'ENG-1' }

import { runHook, recoverWorktree } from './hooks.js'

beforeEach(() => {
  logLines.length = 0
  mockExecSync.mockReset()
  mockExistsSync.mockReset()
  mockRmSync.mockReset()
})

describe('recoverWorktree', () => {
  it('removes stale rebase-merge dir and returns true', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('.git\n'))
    mockExistsSync.mockImplementation((p: string) => p.includes('rebase-merge'))
    mockExecSync.mockReturnValueOnce(Buffer.from('\n'))

    const result = recoverWorktree('/ws', meta)
    expect(result).toBe(true)
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining('rebase-merge'),
      { recursive: true },
    )
    const logEntry = logLines.find((l) => l.includes('worktree auto-recovered'))
    expect(logEntry).toBeDefined()
    expect(logEntry).toContain('stale-rebase')
  })

  it('resets unstaged changes and returns true', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('.git\n'))
    mockExistsSync.mockReturnValue(false)
    mockExecSync.mockReturnValueOnce(Buffer.from(' M src/index.ts\n'))
    mockExecSync.mockReturnValue(Buffer.from(''))

    const result = recoverWorktree('/ws', meta)
    expect(result).toBe(true)
    expect(mockExecSync).toHaveBeenCalledWith('git checkout -- .', expect.objectContaining({ cwd: '/ws' }))
    expect(mockExecSync).toHaveBeenCalledWith('git clean -fd', expect.objectContaining({ cwd: '/ws' }))
    const logEntry = logLines.find((l) => l.includes('worktree auto-recovered'))
    expect(logEntry).toContain('unstaged-changes')
  })

  it('handles both stale rebase and unstaged changes', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('.git\n'))
    mockExistsSync.mockImplementation((p: string) => p.includes('rebase-apply'))
    mockExecSync.mockReturnValueOnce(Buffer.from('?? new-file.ts\n'))
    mockExecSync.mockReturnValue(Buffer.from(''))

    const result = recoverWorktree('/ws', meta)
    expect(result).toBe(true)
    const logEntry = logLines.find((l) => l.includes('worktree auto-recovered'))
    expect(logEntry).toContain('stale-rebase')
    expect(logEntry).toContain('unstaged-changes')
  })

  it('returns false when worktree is clean', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('.git\n'))
    mockExistsSync.mockReturnValue(false)
    mockExecSync.mockReturnValueOnce(Buffer.from('\n'))

    const result = recoverWorktree('/ws', meta)
    expect(result).toBe(false)
  })

  it('logs warning when rebase state recovery fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git rev-parse --git-dir') throw new Error('not a git repo')
      if (cmd === 'git status --porcelain') return Buffer.from('\n')
      return Buffer.from('')
    })

    const result = recoverWorktree('/ws', meta)
    expect(result).toBe(false)
    expect(logLines.some((l) => l.includes('rebase state recovery failed'))).toBe(true)
  })

  it('logs warning when dirty worktree recovery fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git rev-parse --git-dir') return Buffer.from('.git\n')
      if (cmd === 'git status --porcelain') return Buffer.from(' M file.ts\n')
      if (cmd === 'git checkout -- .') throw new Error('checkout failed')
      return Buffer.from('')
    })
    mockExistsSync.mockReturnValue(false)

    const result = recoverWorktree('/ws', meta)
    expect(result).toBe(true)
    expect(logLines.some((l) => l.includes('dirty worktree recovery failed'))).toBe(true)
    expect(logLines.some((l) => l.includes('unstaged-changes'))).toBe(true)
  })

  it('deduplicates stale-rebase when both dirs exist', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('.git\n'))
    mockExistsSync.mockReturnValue(true)
    mockExecSync.mockReturnValueOnce(Buffer.from('\n'))

    const result = recoverWorktree('/ws', meta)
    expect(result).toBe(true)
    const logEntry = logLines.find((l) => l.includes('worktree auto-recovered'))
    const parsed = JSON.parse(logEntry!)
    expect(parsed.recoveryType).toEqual(['stale-rebase'])
  })
})

describe('runHook', () => {
  it('runs hook successfully on first try', () => {
    mockExecSync.mockReturnValue(Buffer.from(''))

    runHook('before_run', 'git fetch && git rebase', '/ws', 60, meta)

    expect(mockExecSync).toHaveBeenCalledTimes(1)
    expect(logLines.some((l) => l.includes('hook ok'))).toBe(true)
  })

  it('before_run recovers from dirty worktree and retries', () => {
    let callCount = 0
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git fetch && git rebase') {
        callCount++
        if (callCount === 1) throw new Error('cannot rebase: You have unstaged changes')
        return Buffer.from('')
      }
      if (cmd === 'git rev-parse --git-dir') return Buffer.from('.git\n')
      if (cmd === 'git status --porcelain') return Buffer.from(' M file.ts\n')
      return Buffer.from('')
    })
    mockExistsSync.mockReturnValue(false)

    runHook('before_run', 'git fetch && git rebase', '/ws', 60, meta)

    expect(logLines.some((l) => l.includes('worktree auto-recovered'))).toBe(true)
    expect(logLines.some((l) => l.includes('hook ok after recovery'))).toBe(true)
  })

  it('before_run fails if recovery does not help', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git fetch && git rebase') throw new Error('rebase conflict')
      if (cmd === 'git rev-parse --git-dir') return Buffer.from('.git\n')
      if (cmd === 'git status --porcelain') return Buffer.from(' M file.ts\n')
      return Buffer.from('')
    })
    mockExistsSync.mockReturnValue(false)

    expect(() => runHook('before_run', 'git fetch && git rebase', '/ws', 60, meta))
      .toThrow('hook before_run failed after recovery')
  })

  it('before_run fails without recovery if worktree is clean', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git fetch && git rebase') throw new Error('network error')
      if (cmd === 'git rev-parse --git-dir') return Buffer.from('.git\n')
      if (cmd === 'git status --porcelain') return Buffer.from('\n')
      return Buffer.from('')
    })
    mockExistsSync.mockReturnValue(false)

    expect(() => runHook('before_run', 'git fetch && git rebase', '/ws', 60, meta))
      .toThrow('hook before_run failed:')
  })

  it('after_create still throws on failure without recovery', () => {
    mockExecSync.mockImplementation(() => { throw new Error('install failed') })

    expect(() => runHook('after_create', 'pnpm install', '/ws', 60, meta))
      .toThrow('hook after_create failed:')
  })

  it('after_run continues on failure', () => {
    mockExecSync.mockImplementation(() => { throw new Error('cleanup failed') })

    expect(() => runHook('after_run', 'cleanup', '/ws', 60, meta)).not.toThrow()
    expect(logLines.some((l) => l.includes('hook failed, continuing'))).toBe(true)
  })
})
