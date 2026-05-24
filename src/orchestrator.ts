import fs from 'node:fs/promises'
import { config, LOCKS, WORKSPACES, LOGS, log } from './config.js'
import { readLock, writeLock, isAlive, cleanup, countRunning } from './lockfile.js'
import { fetchCandidates } from './linear.js'
import { ensureWorktree } from './workspace.js'
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

  const allCandidates = await fetchCandidates()

  const candidates = []
  for (const issue of allCandidates) {
    const lock = await readLock(issue.id)
    if (lock && isAlive(lock.pid)) continue
    candidates.push(issue)
  }

  for (const issue of candidates.slice(0, slots)) {
    try {
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier }, 'dispatching')
      const ws = await ensureWorktree(issue.identifier)
      const pid = spawnAgent(issue, ws)
      await writeLock({
        pid,
        issueId: issue.id,
        identifier: issue.identifier,
        startedAt: new Date().toISOString(),
        attempt: 1,
      })
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier, pid }, 'agent spawned')
    } catch (err) {
      log.error({ issueIdentifier: issue.identifier, error: String(err) }, 'dispatch failed')
    }
  }

  log.info(
    { dispatched: Math.min(candidates.length, slots), running: running + Math.min(candidates.length, slots) },
    'tick complete',
  )
}
