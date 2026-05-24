import fs from 'node:fs/promises'
import path from 'node:path'
import { LOCKS, log } from './config.js'

export interface Lock {
  pid: number
  issueId: string
  identifier: string
  startedAt: string
  attempt: number
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
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function cleanup(): Promise<void> {
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const lock = await readLock(f.replace('.json', ''))
    if (lock && !isAlive(lock.pid)) {
      log.info({ issueId: lock.issueId, issueIdentifier: lock.identifier }, 'dead lock cleaned')
      await removeLock(lock.issueId)
    }
  }
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
