import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { log } from './config.js'

export type HookName = 'after_create' | 'before_run' | 'after_run' | 'before_remove'

export interface HooksConfig {
  after_create?: string
  before_run: string
  after_run?: string
  before_remove?: string
  timeout: number
}

const DEFAULT_BEFORE_RUN = 'git fetch origin && git rebase origin/main'
const DEFAULT_TIMEOUT = 60

function parseFrontMatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) result[key] = value
  }
  return result
}

export async function loadHooksConfig(repoPath: string): Promise<HooksConfig> {
  let fm: Record<string, string> = {}
  try {
    const raw = await fs.readFile(path.join(repoPath, 'WORKFLOW.md'), 'utf-8')
    fm = parseFrontMatter(raw)
  } catch { /* no WORKFLOW.md */ }

  return {
    after_create: process.env.HOOK_AFTER_CREATE || fm.hook_after_create || undefined,
    before_run: process.env.HOOK_BEFORE_RUN || fm.hook_before_run || DEFAULT_BEFORE_RUN,
    after_run: process.env.HOOK_AFTER_RUN || fm.hook_after_run || undefined,
    before_remove: process.env.HOOK_BEFORE_REMOVE || fm.hook_before_remove || undefined,
    timeout: Number(process.env.HOOK_TIMEOUT || fm.hook_timeout) || DEFAULT_TIMEOUT,
  }
}

export function recoverWorktree(
  ws: string,
  meta: { issueId: string; issueIdentifier: string },
): boolean {
  const recovered: string[] = []

  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd: ws, stdio: 'pipe' }).toString().trim()
    const absGitDir = path.resolve(ws, gitDir)

    let removedRebase = false
    for (const name of ['rebase-merge', 'rebase-apply']) {
      const dirPath = path.join(absGitDir, name)
      if (fsSync.existsSync(dirPath)) {
        fsSync.rmSync(dirPath, { recursive: true })
        removedRebase = true
      }
    }
    if (removedRebase) recovered.push('stale-rebase')
  } catch (err) {
    log.warn({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, error: String(err) }, 'rebase state recovery failed')
  }

  try {
    const status = execSync('git status --porcelain', { cwd: ws, stdio: 'pipe' }).toString().trim()
    if (status) {
      execSync('git checkout -- .', { cwd: ws, stdio: 'pipe' })
      execSync('git clean -fd', { cwd: ws, stdio: 'pipe' })
      recovered.push('unstaged-changes')
    }
  } catch (err) {
    log.warn({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, error: String(err) }, 'dirty worktree recovery failed')
  }

  if (recovered.length > 0) {
    log.info(
      { issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, recoveryType: recovered },
      'worktree auto-recovered',
    )
    return true
  }
  return false
}

export function runHook(
  name: HookName,
  script: string,
  ws: string,
  timeoutSec: number,
  meta: { issueId: string; issueIdentifier: string },
): void {
  log.info({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, hook: name }, 'hook start')
  try {
    execSync(script, {
      cwd: ws,
      stdio: 'pipe',
      timeout: timeoutSec * 1000,
    })
    log.info({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, hook: name }, 'hook ok')
  } catch (err) {
    if (name === 'before_run') {
      const recovered = recoverWorktree(ws, meta)
      if (recovered) {
        try {
          execSync(script, {
            cwd: ws,
            stdio: 'pipe',
            timeout: timeoutSec * 1000,
          })
          log.info({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, hook: name }, 'hook ok after recovery')
          return
        } catch (retryErr) {
          log.error({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, hook: name, error: String(retryErr) }, 'hook failed after recovery, aborting')
          throw new Error(`hook ${name} failed after recovery: ${retryErr}`)
        }
      }
      log.error({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, hook: name, error: String(err) }, 'hook failed, aborting')
      throw new Error(`hook ${name} failed: ${err}`)
    }
    if (name === 'after_create') {
      log.error({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, hook: name, error: String(err) }, 'hook failed, aborting')
      throw new Error(`hook ${name} failed: ${err}`)
    }
    log.warn({ issueId: meta.issueId, issueIdentifier: meta.issueIdentifier, hook: name, error: String(err) }, 'hook failed, continuing')
  }
}
