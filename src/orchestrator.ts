import fs from 'node:fs/promises'
import { config, LOCKS, WORKSPACES, LOGS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, detectStalls, listLocks, removeLock } from './lockfile.js'
import { fetchCandidates, fetchIssueState, fetchIssueStateByIdentifier } from './linear.js'
import { ensureWorktree, removeWorktree, listWorktreeIdentifiers } from './workspace.js'
import { spawnAgent } from './runner.js'
import { pollSentry } from './sentry.js'

export async function tick(): Promise<void> {
  log.info('tick start')

  for (const dir of [LOCKS, WORKSPACES, LOGS])
    await fs.mkdir(dir, { recursive: true })

  await pollSentry()
  await detectStalls()
  await cleanup()
  await reconcileTerminal()

  const running = await countRunning()
  const slots = config.maxConcurrent - running
  if (slots <= 0) {
    log.info({ running }, 'no slots available')
    return
  }

  const allCandidates = await fetchCandidates()

  const candidates = []
  for (const issue of allCandidates) {
    const lock = await readLock(issue.id)
    if (!lock) {
      candidates.push(issue)
      continue
    }
    if (isAlive(lock.pid)) continue
    if (lock.exitCode !== undefined && lock.exitCode !== 0 && lock.notBefore) {
      if (Date.now() < new Date(lock.notBefore).getTime()) {
        log.info({
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          attempt: lock.attempt,
          notBefore: lock.notBefore,
        }, 'skipping: in backoff')
        continue
      }
    }
    candidates.push(issue)
  }

  for (const issue of candidates.slice(0, slots)) {
    try {
      const prevLock = await readLock(issue.id)
      const attempt = prevLock?.exitCode !== undefined && prevLock.exitCode !== 0
        ? prevLock.attempt + 1
        : 1

      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, attempt }, 'dispatching')
      const ws = await ensureWorktree(issue.identifier)
      const pid = await spawnAgent(issue, ws, attempt)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt,
      })
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, pid, attempt }, 'agent spawned')
    } catch (err) {
      log.error({ issueIdentifier: issue.identifier, error: String(err) }, 'dispatch failed')
    }
  }

  log.info(
    { dispatched: Math.min(candidates.length, slots), running: running + Math.min(candidates.length, slots) },
    'tick complete',
  )
}

async function reconcileTerminal(): Promise<void> {
  const locks = await listLocks()
  const lockedIdentifiers = new Set(locks.map((l) => l.identifier))

  for (const lock of locks) {
    try {
      const result = await fetchIssueState(lock.issueId)
      if (!result?.terminal) continue

      log.info({ issueId: lock.issueId, issueIdentifier: lock.identifier, state: result.stateName }, 'terminal cleanup')

      if (isAlive(lock.pid)) {
        try { process.kill(lock.pid, 'SIGTERM') } catch {}
      }
      await removeLock(lock.issueId)
      try { removeWorktree(lock.identifier) } catch {}
    } catch (err) {
      log.warn({ issueId: lock.issueId, issueIdentifier: lock.identifier, error: String(err) }, 'terminal reconcile failed')
    }
  }

  const workspaces = await listWorktreeIdentifiers()
  for (const ws of workspaces) {
    if (lockedIdentifiers.has(ws)) continue
    try {
      const result = await fetchIssueStateByIdentifier(ws)
      if (!result?.terminal) continue

      log.info({ issueId: result.id, issueIdentifier: ws, state: result.stateName }, 'terminal cleanup')
      try { removeWorktree(ws) } catch {}
    } catch (err) {
      log.warn({ issueIdentifier: ws, error: String(err) }, 'orphan reconcile failed')
    }
  }
}
