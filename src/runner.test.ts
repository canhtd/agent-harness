import { describe, it, expect, vi } from 'vitest'
import { openSync } from 'node:fs'
import path from 'node:path'
import { LOGS } from './config.js'
import { sanitize } from './workspace.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    unref: vi.fn(),
  })),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    openSync: vi.fn(() => 99),
  }
})

vi.mock('./prompt.js', () => ({
  buildPrompt: vi.fn(async () => 'test prompt'),
  buildContinuationPrompt: vi.fn(() => 'continuation prompt'),
}))

describe('spawnAgent log file mode', () => {
  it('opens log file with "w" (truncate) for fresh dispatch', async () => {
    const { spawnAgent } = await import('./runner.js')
    const openSyncMock = vi.mocked(openSync)

    const issue = { id: 'issue-1', identifier: 'ENG-50', title: 'Test', description: '', priority: 2 }
    await spawnAgent(issue as any, '/tmp/ws')

    const logCall = openSyncMock.mock.calls.find(
      ([p]) => typeof p === 'string' && p.includes('.log'),
    )
    expect(logCall).toBeDefined()
    expect(logCall![1]).toBe('w')
  })
})

describe('spawnContinuation log file mode', () => {
  it('opens log file with "a" (append) for continuation', async () => {
    const { spawnContinuation } = await import('./runner.js')
    const openSyncMock = vi.mocked(openSync)
    openSyncMock.mockClear()

    const issue = { id: 'issue-2', identifier: 'ENG-51', title: 'Test', description: '', priority: 2 }
    await spawnContinuation(issue as any, '/tmp/ws', 'review feedback')

    const logCall = openSyncMock.mock.calls.find(
      ([p]) => typeof p === 'string' && p.includes('.log'),
    )
    expect(logCall).toBeDefined()
    expect(logCall![1]).toBe('a')
  })
})
