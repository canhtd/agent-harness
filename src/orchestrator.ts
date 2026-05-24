import fs from 'node:fs/promises'
import { config, LOCKS, WORKSPACES, LOGS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning, countRunningByState } from './lockfile.js'
import { fetchCandidates } from './linear.js'
import { ensureWorktree, resetWorktree } from './workspace.js'
import { spawnAgent } from './runner.js'

export async function tick(): Promise<void> {
  log.info('tick start')

  for (const dir of [LOCKS, WORKSPACES, LOGS])
    await fs.mkdir(dir, { recursive: true })

  await cleanup()

  const running = await countRunning()
  const slots = config.maxConcurrent - running
  if (slots <= 0) {
    log.info({ running }, 'no slots available')
    return
  }

  const reworkRunning = await countRunningByState('Rework')

  const allCandidates = await fetchCandidates()

  const candidates = []
  for (const issue of allCandidates) {
    const lock = await readLock(issue.id)
    if (lock && isAlive(lock.pid)) continue
    candidates.push(issue)
  }

  let dispatched = 0
  let reworkDispatched = 0

  for (const issue of candidates) {
    if (dispatched >= slots) break

    if (issue.stateName === 'Rework') {
      if (reworkRunning + reworkDispatched >= config.maxRework) continue
      reworkDispatched++
    }

    try {
      const isRework = issue.stateName === 'Rework'
      log.info(
        { issueId: issue.id, issueIdentifier: issue.identifier },
        isRework ? 'dispatching rework' : 'dispatching',
      )
      const ws = isRework
        ? await resetWorktree(issue.identifier)
        : await ensureWorktree(issue.identifier)
      const pid = spawnAgent(issue, ws)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt: 1,
        stateName: issue.stateName,
      })
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, pid }, 'agent spawned')
      dispatched++
    } catch (err) {
      log.error({ issueIdentifier: issue.identifier, error: String(err) }, 'dispatch failed')
    }
  }

  log.info(
    { dispatched, running: running + dispatched },
    'tick complete',
  )
}
