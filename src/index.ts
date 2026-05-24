import { LinearClient } from '@linear/sdk'
import { spawn, execSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import pino from 'pino'
import 'dotenv/config'

const config = {
  linearApiKey: process.env.LINEAR_API_KEY!,
  teamKey: process.env.LINEAR_TEAM_KEY!,
  projectSlug: process.env.LINEAR_PROJECT_SLUG || undefined,
  repoPath: process.env.REPO_PATH || process.cwd(),
  maxConcurrent: 10,
}

const BASE = path.join(os.homedir(), '.agent-harness')
const LOCKS = path.join(BASE, 'locks')
const WORKSPACES = path.join(BASE, 'workspaces')
const LOGS = path.join(BASE, 'logs')

const log = pino({ name: 'agent-harness' })

interface Lock {
  pid: number
  issueId: string
  identifier: string
  startedAt: string
  attempt: number
}

async function readLock(issueId: string): Promise<Lock | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(LOCKS, `${issueId}.json`), 'utf-8'))
  } catch {
    return null
  }
}

async function writeLock(lock: Lock): Promise<void> {
  await fs.writeFile(path.join(LOCKS, `${lock.issueId}.json`), JSON.stringify(lock, null, 2))
}

async function removeLock(issueId: string): Promise<void> {
  await fs.unlink(path.join(LOCKS, `${issueId}.json`)).catch(() => {})
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_')
}

async function cleanup(): Promise<void> {
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const lock = await readLock(f.replace('.json', ''))
    if (lock && !isAlive(lock.pid)) {
      log.info({ issueId: lock.issueId, issueIdentifier: lock.identifier }, 'dead lock cleaned')
      await removeLock(lock.issueId)
    }
  }
}

async function countRunning(): Promise<number> {
  let n = 0
  for (const f of await fs.readdir(LOCKS).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const lock = await readLock(f.replace('.json', ''))
    if (lock && isAlive(lock.pid)) n++
  }
  return n
}

async function ensureWorktree(identifier: string): Promise<string> {
  const key = sanitize(identifier)
  const ws = path.join(WORKSPACES, key)
  try {
    await fs.access(ws)
    execSync('git fetch origin && git rebase origin/main', { cwd: ws, stdio: 'pipe' })
  } catch {
    execSync(`git worktree add "${ws}" -b "agent/${key}" origin/main`, {
      cwd: config.repoPath,
      stdio: 'pipe',
    })
  }
  return ws
}

function spawnAgent(
  issue: { id: string; identifier: string; title: string; description?: string | null },
  ws: string,
): number {
  const prompt = [
    `Linear issue: ${issue.identifier} — ${issue.title}`,
    '',
    issue.description || '(no description)',
    '',
    'Follow CLAUDE.md. Branch, implement, test, create PR.',
  ].join('\n')

  const out = createWriteStream(path.join(LOGS, `${sanitize(issue.identifier)}.log`), { flags: 'a' })
  const child = spawn('claude', ['-p', prompt], {
    cwd: ws,
    stdio: ['ignore', out, out],
    detached: true,
    env: { ...process.env },
  })
  child.unref()
  return child.pid!
}

async function tick(): Promise<void> {
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

  const linear = new LinearClient({ apiKey: config.linearApiKey })
  const filter: Record<string, unknown> = {
    team: { key: { eq: config.teamKey } },
    state: { name: { in: ['Todo'] } },
  }
  if (config.projectSlug) {
    filter.project = { slugId: { eq: config.projectSlug } }
  }
  const result = await linear.issues({ filter, first: 50 })

  const candidates = []
  for (const issue of result.nodes) {
    const lock = await readLock(issue.id)
    if (lock && isAlive(lock.pid)) continue
    candidates.push(issue)
  }

  const pri = (p?: number) => (p ? p : 99)
  const time = (d?: Date) => d?.getTime() ?? Infinity
  candidates.sort((a, b) => {
    if (pri(a.priority) !== pri(b.priority)) return pri(a.priority) - pri(b.priority)
    if (time(a.createdAt) !== time(b.createdAt)) return time(a.createdAt) - time(b.createdAt)
    return a.identifier.localeCompare(b.identifier)
  })

  for (const issue of candidates.slice(0, slots)) {
    try {
      log.info({ issueId: issue.id, issueIdentifier: issue.identifier }, 'dispatching')
      const ws = await ensureWorktree(issue.identifier)
      const pid = spawnAgent(
        { id: issue.id, identifier: issue.identifier, title: issue.title, description: issue.description },
        ws,
      )
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

tick().catch((err) => {
  log.error(err, 'tick failed')
  process.exit(1)
})
