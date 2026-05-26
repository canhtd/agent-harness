import fs from 'node:fs/promises'
import path from 'node:path'
import { config, LOCKS, WORKSPACES, LOGS, HANDOFFS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, countRunningByState, detectStalls, listLocks, removeLock } from './lockfile.js'
import { fetchCandidates, fetchInProgressIssues, fetchIssueState, fetchIssueStateByIdentifier, transitionToDone, transitionToBlocked, postComment } from './linear.js'
import { ensureWorktree, removeWorktree, listWorktreeIdentifiers, workspacePath, sanitize } from './workspace.js'
import { spawnAgent, spawnContinuation } from './runner.js'
import type { IssueInfo } from './linear.js'
import { checkPrStatus, getOpenPrNumber, closePr, fetchLastReviewBody } from './github.js'
import { reviewPr } from './review.js'
import { pollSentry } from './sentry.js'
import { loadHooksConfig, runHook, type HooksConfig } from './hooks.js'
import { findSessionJsonl, aggregateTokens, appendTokenRecord } from './tokens.js'

export async function tick(): Promise<void> {
  log.info('tick start')

  for (const dir of [LOCKS, WORKSPACES, LOGS, HANDOFFS])
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
        appendTokenRecord(record)
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

export async function writeHandoff(identifier: string, attempt: number, turns: number, prNumber: number | null): Promise<void> {
  const key = sanitize(identifier)

  let reviewBody = ''
  if (prNumber) reviewBody = fetchLastReviewBody(prNumber)

  let logTail = ''
  try {
    const logPath = path.join(LOGS, `${key}.log`)
    const content = await fs.readFile(logPath, 'utf-8')
    const lines = content.split('\n')
    logTail = lines.slice(-50).join('\n')
  } catch {}

  const handoff = [
    `# Handoff — Attempt ${attempt}`,
    '',
    '## Current State',
    `PR #${prNumber ?? 'unknown'} bị reject sau ${turns} turns`,
    '',
    '## Tried & Failed',
    reviewBody || '(no review feedback)',
    '',
    '## Agent Log (last 50 lines)',
    logTail || '(no log available)',
  ].join('\n')

  await fs.writeFile(path.join(HANDOFFS, `${key}.md`), handoff, 'utf-8')
  log.info({ issueIdentifier: identifier, attempt }, 'handoff written')
}

export async function removeHandoff(identifier: string): Promise<void> {
  try {
    await fs.unlink(path.join(HANDOFFS, `${sanitize(identifier)}.md`))
  } catch {}
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
      const attempt = lock?.attempt ?? 1

      if (attempt < config.maxAttempts) {
        const prNumber = getOpenPrNumber(issue.identifier)
        await writeHandoff(issue.identifier, attempt, turn, prNumber)
        if (prNumber) closePr(prNumber)
        try { await removeWorktree(issue.identifier) } catch {}

        const nextAttempt = attempt + 1
        log.info(
          { issueId: issue.id, issueIdentifier: issue.identifier, attempt: nextAttempt, maxAttempts: config.maxAttempts },
          `fresh attempt ${nextAttempt}/${config.maxAttempts}`,
        )
        await writeLock({
          pid: -1,
          issueId: issue.id,
          identifier: issue.identifier,
          startedAt: new Date().toISOString(),
          attempt: nextAttempt,
          turn: 0,
          stateName: issue.stateName,
          exitCode: 0,
        })
      } else {
        await escalateToHuman(issue, lock)
      }
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
    const attempt = lock?.attempt ?? 1
    const isFreshAttempt = turn === 0 && attempt > 1

    log.info(
      { issueId: issue.id, issueIdentifier: issue.identifier, turn: nextTurn, attempt, reason: outcome.reason },
      isFreshAttempt ? `re-dispatching fresh attempt ${attempt}/${config.maxAttempts}` : `re-dispatching turn ${nextTurn}`,
    )

    try {
      const { path: ws } = await ensureWorktree(issue.identifier)
      const pid = isFreshAttempt
        ? await spawnAgent(issue, ws, attempt)
        : await spawnContinuation(issue, ws, outcome.reason)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt,
        turn: nextTurn,
        stateName: issue.stateName,
      })
      slotsUsed++
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, pid, turn: nextTurn, attempt }, 'agent re-spawned')
    } catch (err) {
      log.error({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 're-dispatch failed')
    }
  }
}

async function escalateToHuman(issue: IssueInfo, lock: Awaited<ReturnType<typeof readLock>>): Promise<void> {
  const prNumber = getOpenPrNumber(issue.identifier)
  let reviewBody = ''
  if (prNumber) reviewBody = fetchLastReviewBody(prNumber)

  const comment = `Agent hit max attempts (${config.maxAttempts}). Last review feedback:\n\n${reviewBody || '(no review feedback)'}\n\nNeeds human intervention.`
  await postComment(issue.id, comment)
  await transitionToBlocked(issue.id)

  if (lock) await removeLock(issue.id)
  try { await removeWorktree(issue.identifier) } catch {}

  log.warn(
    { issueId: issue.id, issueIdentifier: issue.identifier, attempt: lock?.attempt ?? 1, maxAttempts: config.maxAttempts },
    'escalating to human',
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
      await removeHandoff(lock.identifier)

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
      await removeHandoff(ws)

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
