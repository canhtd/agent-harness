import fs from 'node:fs/promises'
import { config, LOCKS, WORKSPACES, LOGS, HANDOFFS, BABYSIT_STATE, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, countRunningByState, detectStalls, listLocks, removeLock, type Lock } from './lockfile.js'
import { fetchCandidates, fetchInProgressIssues, fetchIssueState, fetchIssueStateByIdentifier, transitionToDone, transitionToInProgress, transitionToBlocked, postComment } from './linear.js'
import { ensureWorktree, removeWorktree, listWorktreeIdentifiers, workspacePath } from './workspace.js'
import { spawnAgent, spawnContinuation, spawnBabysit } from './runner.js'
import type { IssueInfo } from './linear.js'
import { checkPrStatus, getOpenPrNumber, closePr, deleteRemoteBranch, fetchLastReviewBody, getPrHeadSha } from './github.js'
import { reviewPr } from './review.js'
import { pollSentry } from './sentry.js'
import { loadHooksConfig, runHook, type HooksConfig } from './hooks.js'
import { findSessionJsonl, aggregateTokens, appendTokenRecord } from './tokens.js'
import { writeHandoff, removeHandoff } from './handoff.js'

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
        const lock = await readLock(agent.issueId)
        if (lock) {
          if (lock.startedAt) {
            record.duration_seconds = Math.round((Date.now() - new Date(lock.startedAt).getTime()) / 1000)
          }
          record.status = lock.exitCode != null ? (lock.exitCode === 0 ? 'completed' : 'failed') : 'unknown'
        }
        appendTokenRecord(record)
        log.info({ issueId: agent.issueId, issueIdentifier: agent.identifier, cost: record.estimated_cost_usd }, 'token usage recorded')
      }
    } catch (err) {
      log.warn({ issueId: agent.issueId, issueIdentifier: agent.identifier, error: String(err) }, 'token aggregation failed')
    }
  }

  const stuckIssueIds = await detectStuck()
  await reconcile(stuckIssueIds)
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
        lastExitCode: prevLock?.exitCode,
      })
      if (isRework) reworkRunning++
      if (issue.stateName === 'Todo') transitionToInProgress(issue.id).catch(() => {})
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

async function reconcile(stuckIssueIds: Set<string>): Promise<void> {
  const inProgress = await fetchInProgressIssues()
  const running = await countRunning()
  let slotsUsed = 0

  for (const issue of inProgress) {
    if (stuckIssueIds.has(issue.id)) continue

    const lock = await readLock(issue.id)

    if (lock && isAlive(lock.pid)) continue

    if (lock?.exitCode !== undefined && lock.exitCode !== 0 && lock.notBefore) {
      if (Date.now() < new Date(lock.notBefore).getTime()) continue
    }

    const turn = lock ? (lock.turn ?? 1) : 0

    log.info({ issueId: issue.id, issueIdentifier: issue.identifier }, 'reconciling')

    const outcome = checkPrStatus(issue.identifier)

    if (outcome.action === 'done') {
      await transitionToDone(issue.id)
      try {
        const msg = outcome.prNumber ? `PR #${outcome.prNumber} merged — done` : 'PR merged — done'
        await postComment(issue.id, msg)
      } catch (err) {
        log.warn({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 'failed to post merge comment')
      }
      if (lock) await removeLock(issue.id)
      try { await removeWorktree(issue.identifier) } catch {}
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier }, 'PR merged, transitioned to Done')
      continue
    }

    if (outcome.action === 'review') {
      const currentHead = getPrHeadSha(outcome.prNumber)
      const failCount = lock?.reviewFailCount ?? 0
      const failHead = lock?.reviewFailPrHead

      if (failCount > 0 && currentHead && failHead && currentHead !== failHead) {
        if (lock) {
          lock.reviewFailCount = 0
          lock.reviewFailPrHead = undefined
          lock.reviewFailError = undefined
          await writeLock(lock)
        }
        log.info({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber }, 'review circuit breaker reset — new commits detected')
      }

      const effectiveFailCount = lock?.reviewFailCount ?? 0

      if (effectiveFailCount >= 3) {
        log.warn({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber, reviewFailCount: effectiveFailCount }, 'review circuit breaker tripped')
        const lastError = lock?.reviewFailError ?? 'unknown error'
        try {
          await postComment(issue.id, `Review circuit breaker tripped after ${effectiveFailCount} consecutive failures. Last error: ${lastError}`)
        } catch (err) {
          log.warn({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 'failed to post circuit breaker comment')
        }
        await transitionToBlocked(issue.id)
        continue
      }

      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber }, 'triggering review')
      try {
        const review = await reviewPr(outcome.prNumber, issue.description ?? '')
        if (lock && lock.reviewFailCount) {
          lock.reviewFailCount = 0
          lock.reviewFailPrHead = undefined
          lock.reviewFailError = undefined
          await writeLock(lock)
        }
        if (review.approved) {
          try {
            await postComment(issue.id, `Review approved (PR #${outcome.prNumber}) — awaiting CI + merge`)
          } catch (err) {
            log.warn({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 'failed to post approval comment')
          }
          log.info({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber }, 'review approved — awaiting merge')
        } else {
          log.info({ issueId: issue.id, issueIdentifier: issue.identifier, prNumber: outcome.prNumber }, 'review rejected — will re-dispatch')
        }
      } catch (err) {
        const newFailCount = (lock?.reviewFailCount ?? 0) + 1
        if (lock) {
          lock.reviewFailCount = newFailCount
          lock.reviewFailPrHead = currentHead ?? undefined
          lock.reviewFailError = String(err)
          await writeLock(lock)
        }
        log.error({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err), reviewFailCount: newFailCount }, 'review failed')
      }
      continue
    }

    if (outcome.action === 'skip') {
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, reason: outcome.reason }, 'skipping')
      continue
    }

    if (turn >= config.maxTurns) {
      const attempt = lock?.attempt ?? 1

      if (attempt < config.maxAttempts) {
        const prNumber = getOpenPrNumber(issue.identifier)

        await writeHandoff(issue.id, issue.identifier, attempt, turn, prNumber)

        if (prNumber !== null) closePr(prNumber)
        deleteRemoteBranch(issue.identifier)
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
          lastExitCode: lock?.exitCode,
        })
      } else {
        await escalateToHuman(issue, lock)
      }
      continue
    }

    if (running + slotsUsed >= config.maxConcurrent) continue

    const nextTurn = turn + 1
    const attempt = lock?.attempt ?? 1
    const isFreshAttempt = turn === 0 && attempt > 1

    log.info(
      { issueId: issue.id, issueIdentifier: issue.identifier, previousTurn: turn, nextTurn, attempt, reason: outcome.reason },
      isFreshAttempt ? `re-dispatching fresh attempt ${attempt}/${config.maxAttempts}` : `turn ${turn} failed, dispatching turn ${nextTurn}`,
    )

    if (!isFreshAttempt) {
      try {
        await postComment(issue.id, `**Turn ${turn} result**: ${outcome.reason}\n\nDispatching turn ${nextTurn} to fix.`)
      } catch (err) {
        log.warn({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 'failed to post turn comment')
      }
    }

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
        lastExitCode: lock?.exitCode,
      })
      slotsUsed++
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, pid, turn: nextTurn, attempt }, 'agent re-spawned')
    } catch (err) {
      log.error({ issueId: issue.id, issueIdentifier: issue.identifier, error: String(err) }, 're-dispatch failed')
    }
  }
}

async function readBabysitState(): Promise<{ lastSpawnedAt: string; pid: number } | null> {
  try {
    return JSON.parse(await fs.readFile(BABYSIT_STATE, 'utf-8'))
  } catch {
    return null
  }
}

async function writeBabysitState(pid: number): Promise<void> {
  await fs.writeFile(BABYSIT_STATE, JSON.stringify({ lastSpawnedAt: new Date().toISOString(), pid }))
}

function isStuck(lock: Lock): boolean {
  if (isAlive(lock.pid)) return false
  if (lock.exitCode === undefined || lock.exitCode === 0) return false
  if (lock.attempt >= config.babysitThreshold) return true
  if (lock.lastExitCode !== undefined && lock.lastExitCode === lock.exitCode) return true
  return false
}

export async function detectStuck(): Promise<Set<string>> {
  const locks = await listLocks()
  const stuckLocks = locks.filter(isStuck)
  const stuckIssueIds = new Set(stuckLocks.map((l) => l.issueId))

  if (stuckLocks.length === 0) return stuckIssueIds

  const state = await readBabysitState()
  if (state) {
    const elapsed = Date.now() - new Date(state.lastSpawnedAt).getTime()
    if (elapsed < config.babysitCooldownMs) {
      log.info({ elapsedMs: elapsed, cooldownMs: config.babysitCooldownMs }, 'babysit throttled')
      return stuckIssueIds
    }
    if (isAlive(state.pid)) {
      log.info({ pid: state.pid }, 'babysit agent still running')
      return stuckIssueIds
    }
  }

  const context = stuckLocks.map((lock) => {
    const reason = lock.attempt >= config.babysitThreshold ? 'exceeded max attempts' : `same exit code ${lock.exitCode} repeating`
    return `Issue ${lock.identifier} (${lock.issueId}): attempt=${lock.attempt}, exitCode=${lock.exitCode ?? 'none'}, pid=${lock.pid} (dead), reason=${reason}`
  }).join('\n')

  log.info({ stuckCount: stuckLocks.length }, 'stuck agents detected, spawning babysit')

  try {
    const pid = spawnBabysit(context)
    await writeBabysitState(pid)
    log.info({ pid, stuckCount: stuckLocks.length }, 'babysit agent spawned')
  } catch (err) {
    log.error({ error: String(err) }, 'failed to spawn babysit agent')
  }

  return stuckIssueIds
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

      const ws = workspacePath(lock.identifier)
      if (hooks.before_remove) {
        runHook('before_remove', hooks.before_remove, ws, hooks.timeout, {
          issueId: lock.issueId,
          issueIdentifier: lock.identifier,
        })
      }

      try { removeWorktree(lock.identifier) } catch {}
      await removeHandoff(lock.identifier)
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
      await removeHandoff(ws)
    } catch (err) {
      log.warn({ issueIdentifier: ws, error: String(err) }, 'orphan reconcile failed')
    }
  }
}
