import fs from 'node:fs/promises'
import { config, LOCKS, WORKSPACES, LOGS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, countRunningByState, detectStalls, listLocks, removeLock } from './lockfile.js'
import { fetchCandidates, fetchInProgressIssues, fetchIssueState, fetchIssueStateByIdentifier, transitionToDone } from './linear.js'
import { ensureWorktree, removeWorktree, listWorktreeIdentifiers, workspacePath } from './workspace.js'
import { spawnAgent, spawnContinuation } from './runner.js'
import { checkPrStatus } from './github.js'
import { reviewPr } from './review.js'
import { pollSentry } from './sentry.js'
import { loadHooksConfig, runHook, type HooksConfig } from './hooks.js'
import { findSessionJsonl, aggregateTokens, appendTokenRecord } from './tokens.js'

export async function tick(): Promise<void> {
  log.info('tick start')

  for (const dir of [LOCKS, WORKSPACES, LOGS])
    await fs.mkdir(dir, { recursive: true })

  const [activeLocks, worktrees] = await Promise.all([
    listLocks(),
    listWorktreeIdentifiers(),
  ])
  const heapUsedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100
  log.info(
    { activeLocks: activeLocks.length, worktrees: worktrees.length, heapUsedMb },
    'health check',
  )

  const hooks = await loadHooksConfig(config.repoPath)

  await pollSentry()
  await detectStalls()
  const completed = await cleanup()

  for (const agent of completed) {
    const ws = workspacePath(agent.identifier)

    if (hooks.after_run) {
      runHook('after_run', hooks.after_run, ws, hooks.timeout, {
        issueId: agent.issueId,
        issueIdentifier: agent.identifier,
      })
    }

    try {
      const jsonlPath = findSessionJsonl(ws)
      if (jsonlPath) {
        const record = aggregateTokens(jsonlPath, agent.identifier)
        await appendTokenRecord(record)
        log.info({ issueId: agent.issueId, issueIdentifier: agent.identifier, cost: record.estimated_cost_usd }, 'token usage recorded')
      }
    } catch (err) {
      log.warn({ issueId: agent.issueId, issueIdentifier: agent.identifier, error: String(err) }, 'token aggregation failed')
    }
  }

  await reconcile()
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

  let reworkRunning = await countRunningByState('Rework')

  for (const issue of candidates.slice(0, slots)) {
    if (issue.stateName === 'Rework' && reworkRunning >= config.maxReworkConcurrent) {
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier }, 'rework slots full')
      continue
    }

    try {
      const prevLock = await readLock(issue.id)
      const attempt = prevLock?.exitCode !== undefined && prevLock.exitCode !== 0
        ? prevLock.attempt + 1
        : 1

      const isRework = issue.stateName === 'Rework'
      log.info(
        { issueId: issue.id, issueIdentifier: issue.identifier, attempt },
        isRework ? 'dispatching rework' : 'dispatching',
      )

      const meta = { issueId: issue.id, issueIdentifier: issue.identifier }
      const { path: ws, created } = await ensureWorktree(issue.identifier)

      if (created && hooks.after_create) {
        runHook('after_create', hooks.after_create, ws, hooks.timeout, meta)
      }

      runHook('before_run', hooks.before_run, ws, hooks.timeout, meta)

      const pid = await spawnAgent(issue, ws, attempt)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt,
        turn: 1,
        stateName: issue.stateName,
      })
      if (isRework) reworkRunning++
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

async function reconcile(): Promise<void> {
  const inProgress = await fetchInProgressIssues()
  const running = await countRunning()
  let slotsUsed = 0

  for (const issue of inProgress) {
    const lock = await readLock(issue.id)

    if (lock && isAlive(lock.pid)) continue

    if (lock?.exitCode !== undefined && lock.exitCode !== 0 && lock.notBefore) {
      if (Date.now() < new Date(lock.notBefore).getTime()) continue
    }

    const turn = lock ? (lock.turn ?? 1) : 0
    if (turn >= config.maxTurns) {
      log.warn({ issueId: issue.id, issueIdentifier: issue.identifier, turn, maxTurns: config.maxTurns }, 'max turns reached')
      continue
    }

    log.info({ issueId: issue.id, issueIdentifier: issue.identifier }, 'reconciling')

    const outcome = checkPrStatus(issue.identifier)

    if (outcome.action === 'done') {
      await transitionToDone(issue.id)
      if (lock) await removeLock(issue.id)
      try { await removeWorktree(issue.identifier) } catch {}
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier }, 'PR merged, transitioned to Done')
      continue
    }

    if (outcome.action === 'review') {
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber }, 'triggering review')
      try {
        const review = await reviewPr(outcome.prNumber)
        if (review.approved) {
          log.info({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber }, 'review approved — awaiting merge')
        } else {
          log.info({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber }, 'review rejected — will re-dispatch')
        }
      } catch (err) {
        log.error({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 'review failed')
      }
      continue
    }

    if (outcome.action === 'skip') {
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, reason: outcome.reason }, 'skipping')
      continue
    }

    if (running + slotsUsed >= config.maxConcurrent) continue

    const nextTurn = turn + 1
    log.info({ issueId: issue.id, issueIdentifier: issue.identifier, turn: nextTurn, reason: outcome.reason }, `re-dispatching turn ${nextTurn}`)

    try {
      const { path: ws } = await ensureWorktree(issue.identifier)
      const pid = await spawnContinuation(issue, ws, outcome.reason)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt: 1,
        turn: nextTurn,
        stateName: issue.stateName,
      })
      slotsUsed++
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, pid, turn: nextTurn }, 'agent re-spawned')
    } catch (err) {
      log.error({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 're-dispatch failed')
    }
  }
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

      const ws = workspacePath(lock.identifier)
      if (hooks.before_remove) {
        runHook('before_remove', hooks.before_remove, ws, hooks.timeout, {
          issueId: lock.issueId,
          issueIdentifier: lock.identifier,
        })
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
        runHook('before_remove', hooks.before_remove, workspacePath(ws), hooks.timeout, {
          issueId: result.id,
          issueIdentifier: ws,
        })
      }

      try { removeWorktree(ws) } catch {}
    } catch (err) {
      log.warn({ issueIdentifier: ws, error: String(err) }, 'orphan reconcile failed')
    }
  }
}
