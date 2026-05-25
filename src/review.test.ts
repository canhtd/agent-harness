import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const mockWriteFileSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockExecSync = vi.fn()
const mockExecFileSync = vi.fn()

vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
      stdout: EventEmitter
    }
    child.stdin = { write: vi.fn(), end: vi.fn() }
    child.stdout = new EventEmitter()
    setTimeout(() => {
      child.stdout.emit('data', Buffer.from('APPROVE'))
      child.emit('close', 0)
    }, 0)
    return child
  }),
}))

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/test-repo' },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('node:fs/promises', () => ({
  default: { readFile: vi.fn().mockResolvedValue('skill prompt content') },
}))

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  },
}))

import { reviewPr } from './review.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd.includes('gh pr diff')) {
      return Buffer.from('diff --git a/file.ts\n+added line')
    }
    return Buffer.from('')
  })
  mockExecFileSync.mockReturnValue(Buffer.from(''))
})

describe('reviewPr posts body via temp file using execFileSync', () => {
  it('calls execFileSync with -F and temp file path as array args', async () => {
    await reviewPr(42)

    expect(mockExecFileSync).toHaveBeenCalledOnce()
    const [cmd, args] = mockExecFileSync.mock.calls[0]
    expect(cmd).toBe('gh')
    expect(args).toContain('-F')
    expect(args).toContain('42')
    expect(args).not.toContain('-b')
    const fIndex = (args as string[]).indexOf('-F')
    expect((args as string[])[fIndex + 1]).toMatch(/review-42\.md$/)
  })

  it('writes review body to temp file preserving backticks', async () => {
    await reviewPr(99)

    expect(mockWriteFileSync).toHaveBeenCalledOnce()
    const [filePath, content] = mockWriteFileSync.mock.calls[0]
    expect(filePath).toMatch(/review-99\.md$/)
    expect(typeof content).toBe('string')
    expect(content).toContain('APPROVE')
  })

  it('preserves backticks and template literals in body content', async () => {
    const testBody = '`execSync` and ${variable} and "quotes"'

    const { spawn } = await import('node:child_process')
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
        stdout: EventEmitter
      }
      child.stdin = { write: vi.fn(), end: vi.fn() }
      child.stdout = new EventEmitter()
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from(testBody))
        child.emit('close', 0)
      }, 0)
      return child as any
    })

    await reviewPr(55)

    expect(mockWriteFileSync).toHaveBeenCalled()
    const [, content] = mockWriteFileSync.mock.calls[0]
    expect(content).toContain('`execSync`')
    expect(content).toContain('${variable}')
    expect(content).toContain('"quotes"')
  })

  it('cleans up temp file after posting', async () => {
    await reviewPr(77)

    expect(mockUnlinkSync).toHaveBeenCalledOnce()
    const [filePath] = mockUnlinkSync.mock.calls[0]
    expect(filePath).toMatch(/review-77\.md$/)
  })

  it('cleans up temp file even when posting fails', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('gh failed')
    })

    await reviewPr(88)

    expect(mockUnlinkSync).toHaveBeenCalledOnce()
    const [filePath] = mockUnlinkSync.mock.calls[0]
    expect(filePath).toMatch(/review-88\.md$/)
  })

  it('skips review for empty diff', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('gh pr diff')) return Buffer.from('')
      return Buffer.from('')
    })

    const result = await reviewPr(10)

    expect(result.approved).toBe(true)
    expect(result.results).toHaveLength(0)
    expect(mockWriteFileSync).not.toHaveBeenCalled()
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })
})
