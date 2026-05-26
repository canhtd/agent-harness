import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config, LOCKS, LOGS, WORKSPACES, log } from './config.js'
import { sanitize } from './workspace.js'

export interface Lock {
  pid: number
  issueId: string
  identifier: string
  startedAt: string
  attempt: number
  turn?: number
  exitCode?: number
  notBefore?: string
  stateName?: string
}

export async function readLock(issueId: string): Promise<Lock | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(LOCKS, `${issueId}.json`), 'utf-8'))
  } catch {
    return null
  }
}

export async function writeLock(lock: Lock): Promise<void> {
  await fs.writeFile(path.join(LOCKS, `${lock.issueId}.json`), JSON.stringify(lock, null, 2))
}

export async function removeLock(issueId: string): Promise<void> {
  await fs.unlink(path.join(LOCKS, `${issueId}.json`)).catch(() => {})
}

export function isAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function computeBackoff(attempt: number): number {
  return Math.min(10_000 * Math.pow(2, attempt - 1), 300_000)
}

async function readExitCode(issueId: string): Promise<number | null> {
  try {
    const content = await fs.readFile(path.join(LOCKS, `${issueId}.exit`), 'utf-8')
    const code = parseInt(content.trim(), 10)
    return Number.isNaN(code) ? null : code
  } catch {
    return null
  }
}

async function removeExitCode(issueId: string): Promise<void> {
  await fs.unlink(path.join(LOCKS, `${issueId}.exit`)).catch(() => {})
}

export interface CompletedAgent {
  issueId: string
  identifier: string
}

export async function cleanup(): Promise<CompletedAgent[]> {
  const completed: CompletedAgent[] = []
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const issueId = f.replace('.json', '')
    const lock = await readLock(issueId)
    if (!lock || isAlive(lock.pid)) continue
    if (lock.exitCode !== undefined) continue

    completed.push({ issueId: lock.issueId, identifier: lock.identifier })

    const exitCode = await readExitCode(issueId)
    await removeExitCode(issueId)

    if (exitCode === 0) {
      lock.exitCode = 0
      await writeLock(lock)
      log.info({ issueId: lock.issueId, issueIdentifier: lock.identifier }, 'agent exited cleanly')
    } else {
      const code = exitCode ?? 1
      const delay = computeBackoff(lock.attempt)
      lock.exitCode = code
      lock.notBefore = new Date(Date.now() + delay).toISOString()
      await writeLock(lock)
      log.info({
        issueId: lock.issueId,
        issueIdentifier: lock.identifier,
        exitCode: code,
        attempt: lock.attempt,
        notBefore: lock.notBefore,
      }, 'agent crashed, backoff applied')
    }
  }
  return completed
}

export async function listLocks(): Promise<Lock[]> {
  const locks: Lock[] = []
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const lock = await readLock(f.replace('.json', ''))
    if (lock) locks.push(lock)
  }
  return locks
}

export async function countRunning(): Promise<number> {
  let n = 0
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const lock = await readLock(f.replace('.json', ''))
    if (lock && isAlive(lock.pid)) n++
  }
  return n
}

export async function countRunningByState(stateName: string): Promise<number> {
  let n = 0
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const lock = await readLock(f.replace('.json', ''))
    if (lock && isAlive(lock.pid) && lock.stateName === stateName) n++
  }
  return n
}

export async function detectStalls(): Promise<void> {
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const lock = await readLock(f.replace('.json', ''))
    if (!lock || !isAlive(lock.pid)) continue

    const logPath = path.join(LOGS, `${sanitize(lock.identifier)}.log`)
    const startedAtMs = new Date(lock.startedAt).getTime()
    let mtimeMs = startedAtMs
    try {
      const stat = await fs.stat(logPath)
      mtimeMs = stat.mtime.getTime()
    } catch {}

    const baseline = Math.max(startedAtMs, mtimeMs)
    const idleMs = Date.now() - baseline
    if (idleMs < config.stallTimeoutMs) continue

    log.warn(
      { issueId: lock.issueId, issueIdentifier: lock.identifier, idleMs },
      'agent stalled',
    )

    try {
      process.kill(-lock.pid, 'SIGKILL')
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ESRCH') {
        try {
          process.kill(lock.pid, 'SIGKILL')
        } catch {}
      }
    }
    await removeLock(lock.issueId)

    try {
      execSync(`git worktree remove "${path.join(WORKSPACES, sanitize(lock.identifier))}" --force`, { cwd: config.repoPath, stdio: 'pipe' })
    } catch {}
  }
}
