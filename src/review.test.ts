import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWriteFileSync = vi.fn()
const mockUnlinkSync = vi.fn()

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

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  },
}))

import { execSync } from 'node:child_process'

beforeEach(() => {
  vi.clearAllMocks()
})

function setupExecSync() {
  const mockExec = vi.mocked(execSync)
  mockExec.mockImplementation((cmd: string) => {
    if (typeof cmd === 'string' && cmd.includes('gh pr diff')) {
      return Buffer.from('diff --git a/file.ts\n+added line')
    }
    return Buffer.from('')
  })
  return mockExec
}

describe('reviewPr posts body via temp file', () => {
  it('uses -F flag with temp file instead of -b', async () => {
    setupExecSync()
    const { reviewPr } = await import('./review.js')
    await reviewPr(42)

    const reviewCalls = vi.mocked(execSync).mock.calls.filter(
      ([cmd]) => typeof cmd === 'string' && cmd.includes('gh pr review'),
    )
    expect(reviewCalls.length).toBe(1)
    const reviewCmd = reviewCalls[0][0] as string
    expect(reviewCmd).toContain('-F ')
    expect(reviewCmd).not.toContain('-b ')
  })

  it('writes body with backticks and special chars to temp file', async () => {
    const mockExec = setupExecSync()
    mockExec.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('gh pr diff')) {
        return Buffer.from('diff --git a/file.ts\n+added line')
      }
      if (typeof cmd === 'string' && cmd.includes('gh pr review')) {
        return Buffer.from('')
      }
      return Buffer.from('')
    })

    const { reviewPr } = await import('./review.js')
    await reviewPr(99)

    expect(mockWriteFileSync).toHaveBeenCalledOnce()
    const [filePath, content] = mockWriteFileSync.mock.calls[0]
    expect(filePath).toMatch(/review-99\.md$/)
    expect(typeof content).toBe('string')
  })

  it('cleans up temp file after posting', async () => {
    setupExecSync()
    const { reviewPr } = await import('./review.js')
    await reviewPr(77)

    expect(mockUnlinkSync).toHaveBeenCalledOnce()
    const [filePath] = mockUnlinkSync.mock.calls[0]
    expect(filePath).toMatch(/review-77\.md$/)
  })

  it('cleans up temp file even when posting fails', async () => {
    const mockExec = setupExecSync()
    mockExec.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('gh pr diff')) {
        return Buffer.from('diff --git a/file.ts\n+added line')
      }
      if (typeof cmd === 'string' && cmd.includes('gh pr review')) {
        throw new Error('gh failed')
      }
      return Buffer.from('')
    })

    const { reviewPr } = await import('./review.js')
    await reviewPr(88)

    expect(mockUnlinkSync).toHaveBeenCalledOnce()
    const [filePath] = mockUnlinkSync.mock.calls[0]
    expect(filePath).toMatch(/review-88\.md$/)
  })
})
