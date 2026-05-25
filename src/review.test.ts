import { describe, it, expect, vi, beforeEach } from 'vitest'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('')),
  spawn: vi.fn(),
}))

vi.mock('./config.js', () => ({
  config: { repoPath: '/tmp/test-repo' },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('node:fs/promises', () => ({
  default: { readFile: vi.fn().mockResolvedValue('skill prompt') },
}))

import { execSync } from 'node:child_process'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reviewPr posts body via temp file', () => {
  it('preserves backtick content in review body', async () => {
    const mockExecSync = vi.mocked(execSync)
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('gh pr diff')) {
        return Buffer.from('diff --git a/file.ts\n+added line')
      }
      return Buffer.from('')
    })

    const { reviewPr } = await import('./review.js')

    vi.doMock('./review.js', async () => {
      const actual = await vi.importActual<typeof import('./review.js')>('./review.js')
      return actual
    })

    let capturedFile = ''
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('gh pr diff')) {
        return Buffer.from('diff --git a/file.ts\n+added line')
      }
      if (typeof cmd === 'string' && cmd.includes('gh pr review')) {
        const match = cmd.match(/-F\s+(\S+)/)
        if (match) capturedFile = match[1]
        return Buffer.from('')
      }
      return Buffer.from('')
    })

    await reviewPr(42)

    const reviewCalls = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === 'string' && cmd.includes('gh pr review'),
    )
    expect(reviewCalls.length).toBe(1)

    const reviewCmd = reviewCalls[0][0] as string
    expect(reviewCmd).toContain('-F ')
    expect(reviewCmd).not.toContain('-b ')
  })

  it('uses -F flag instead of -b for shell safety', async () => {
    const mockExecSync = vi.mocked(execSync)
    mockExecSync.mockReturnValue(Buffer.from('diff content'))

    const tmpFile = path.join(os.tmpdir(), 'review-99.md')
    const body = '**[quality]** Fix `execSync` call and `${template}` usage with "quotes"'

    fsSync.writeFileSync(tmpFile, body)
    const content = fsSync.readFileSync(tmpFile, 'utf-8')

    expect(content).toContain('`execSync`')
    expect(content).toContain('`${template}`')
    expect(content).toContain('"quotes"')

    fsSync.unlinkSync(tmpFile)
  })

  it('cleans up temp file after posting', async () => {
    const tmpFile = path.join(os.tmpdir(), 'review-100.md')
    fsSync.writeFileSync(tmpFile, 'test body')
    expect(fsSync.existsSync(tmpFile)).toBe(true)

    fsSync.unlinkSync(tmpFile)
    expect(fsSync.existsSync(tmpFile)).toBe(false)
  })
})
