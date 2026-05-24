import fs from 'node:fs/promises'
import path from 'node:path'
import { config, LOCKS, WORKSPACES, LOGS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, detectStalls } from './lockfile.js'
import { fetchCandidates } from './linear.js'
import { ensureWorktree, sanitize } from './workspace.js'
import { spawnAgent } from './runner.js'
import { pollSentry } from './sentry.js'
import { loadHooksConfig, runHook } from './hooks.js'

export async function tick(): Promise<void> {
  log.info('tick start')

  for (const dir of [LOCKS, WORKSPACES, LOGS])
    await fs.mkdir(dir, { recursive: true })

  const hooks = await loadHooksConfig(config.repoPath)

  await pollSentry()
  await detectStalls()

  const finished = await cleanup()
  for (const agent of finished) {
    if (hooks.after_run) {
      const ws = path.join(WORKSPACES, sanitize(agent.identifier))
      try {
        runHook('after_run', hooks.after_run, ws, hooks.hookTimeoutMs, {
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
  }

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
