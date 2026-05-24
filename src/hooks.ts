import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { log } from './config.js'
import { parseFrontMatter } from './prompt.js'

export interface HooksConfig {
  after_create?: string
  before_run?: string
  after_run?: string
  before_remove?: string
  hookTimeoutMs: number
}

const DEFAULT_BEFORE_RUN = 'git fetch origin && git rebase origin/main'
const DEFAULT_HOOK_TIMEOUT_S = 60

export async function loadHooksConfig(repoPath: string): Promise<HooksConfig> {
  let frontMatter: Record<string, string> = {}
  try {
    const raw = await fs.readFile(path.join(repoPath, 'WORKFLOW.md'), 'utf-8')
    frontMatter = parseFrontMatter(raw).config
  } catch {}

  const timeoutStr = process.env.HOOK_TIMEOUT ?? frontMatter.hook_timeout
  const timeoutS = timeoutStr ? Number(timeoutStr) : DEFAULT_HOOK_TIMEOUT_S

  return {
    after_create: process.env.HOOK_AFTER_CREATE ?? frontMatter.after_create ?? undefined,
    before_run: process.env.HOOK_BEFORE_RUN ?? frontMatter.before_run ?? DEFAULT_BEFORE_RUN,
    after_run: process.env.HOOK_AFTER_RUN ?? frontMatter.after_run ?? undefined,
    before_remove: process.env.HOOK_BEFORE_REMOVE ?? frontMatter.before_remove ?? undefined,
    hookTimeoutMs: timeoutS * 1000,
  }
}

export function runHook(
  name: string,
  script: string,
  cwd: string,
  timeoutMs: number,
  ctx: { issueId: string; issueIdentifier: string },
): void {
  log.info({ issueId: ctx.issueId, issueIdentifier: ctx.issueIdentifier, hook: name }, 'running hook')
  execSync(script, { cwd, stdio: 'pipe', timeout: timeoutMs })
  log.info({ issueId: ctx.issueId, issueIdentifier: ctx.issueIdentifier, hook: name }, 'hook completed')
}
