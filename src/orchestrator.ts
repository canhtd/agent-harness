import fs from 'node:fs/promises'
import path from 'node:path'
import { config, LOCKS, WORKSPACES, LOGS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, detectStalls, listLocks, removeLock } from './lockfile.js'
import { fetchCandidates, fetchIssueState, fetchIssueStateByIdentifier } from './linear.js'
import { ensureWorktree, removeWorktree, listWorktreeIdentifiers, sanitize } from './workspace.js'
import { spawnAgent } from './runner.js'
import { pollSentry } from './sentry.js'
import { loadHooksConfig, runHook, type HooksConfig } from './hooks.js'

export async function tick(): Promise<void> {
  log.info('tick start')

  for (const dir of [LOCKS, WORKSPACES, LOGS])
    await fs.mkdir(dir, { recursive: true })

  const hooks = await loadHooksConfig(config.repoPath)

  await pollSentry()
  await detectStalls()

  const finished = await cleanup()
  for (const agent of finished) {
    if (!hooks.after_run) continue
    try {
      runHook('after_run', hooks.after_run, path.join(WORKSPACES, sanitize(agent.identifier)), hooks.hookTimeoutMs, {
        issueId: agent.issueId,
        issueIdentifier: agent.identifier,
      })
    } catch (err) {
      log.warn({
        issueId: agent.issueId,
        issueIdentifier: agent.identifier,
        hook: 'after_run',
        error: String(err),
      }, 'after_run hook failed')
    }
  }

  await reconcileTerminal(hooks)

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
    const ctx = { issueId: issue.id, issueIdentifier: issue.identifier }
    try {
      const prevLock = await readLock(issue.id)
      const attempt = prevLock?.exitCode !== undefined && prevLock.exitCode !== 0
        ? prevLock.attempt + 1
        : 1

      log.info({ ...ctx, attempt }, 'dispatching')
      const { path: ws, created } = await ensureWorktree(issue.identifier)

      if (created && hooks.after_create) {
        runHook('after_create', hooks.after_create, ws, hooks.hookTimeoutMs, ctx)
      }

      if (hooks.before_run) {
        runHook('before_run', hooks.before_run, ws, hooks.hookTimeoutMs, ctx)
      }

      const pid = await spawnAgent(issue, ws, attempt)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt,
      })
      log.info({ ...ctx, pid, attempt }, 'agent spawned')
    } catch (err) {
      log.error({ ...ctx, error: String(err) }, 'dispatch failed')
    }
  }

  log.info(
    { dispatched: Math.min(candidates.length, slots), running: running + Math.min(candidates.length, slots) },
    'tick complete',
  )
}

async function reconcileTerminal(hooks: HooksConfig): Promise<void> {
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

      if (hooks.before_remove) {
        try {
          runHook('before_remove', hooks.before_remove, path.join(WORKSPACES, sanitize(lock.identifier)), hooks.hookTimeoutMs, {
            issueId: lock.issueId,
            issueIdentifier: lock.identifier,
          })
        } catch (err) {
          log.warn({ issueId: lock.issueId, issueIdentifier: lock.identifier, error: String(err) }, 'before_remove hook failed')
        }
      }
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

      if (hooks.before_remove) {
        try {
          runHook('before_remove', hooks.before_remove, path.join(WORKSPACES, ws), hooks.hookTimeoutMs, {
            issueId: result.id,
            issueIdentifier: ws,
          })
        } catch (err) {
          log.warn({ issueId: result.id, issueIdentifier: ws, error: String(err) }, 'before_remove hook failed')
        }
      }
      try { removeWorktree(ws) } catch {}
    } catch (err) {
      log.warn({ issueIdentifier: ws, error: String(err) }, 'orphan reconcile failed')
    }
  }
}
