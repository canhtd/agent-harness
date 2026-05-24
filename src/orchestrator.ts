import fs from 'node:fs/promises'
import { config, LOCKS, WORKSPACES, LOGS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, countRunningByState, detectStalls } from './lockfile.js'
import { fetchCandidates } from './linear.js'
import { ensureWorktree } from './workspace.js'
import { spawnAgent } from './runner.js'

export async function tick(): Promise<void> {
  log.info('tick start')

  for (const dir of [LOCKS, WORKSPACES, LOGS])
    await fs.mkdir(dir, { recursive: true })

  await detectStalls()
  await cleanup()

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
  let dispatched = 0

  for (const issue of candidates) {
    if (dispatched >= slots) break

    if (issue.stateName === 'Rework' && reworkRunning >= config.maxRework) {
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, reworkRunning }, 'rework slots full')
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
      const ws = await ensureWorktree(issue.identifier)
      const pid = spawnAgent(issue, ws)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt,
        stateName: issue.stateName,
      })
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, pid, attempt }, 'agent spawned')
      dispatched++
      if (isRework) reworkRunning++
    } catch (err) {
      log.error({ issueIdentifier: issue.identifier, error: String(err) }, 'dispatch failed')
    }
  }

  log.info(
    { dispatched, running: running + dispatched },
    'tick complete',
  )
}
