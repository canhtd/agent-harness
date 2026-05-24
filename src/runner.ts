import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
import path from 'node:path'
import { LOGS } from './config.js'
import { sanitize } from './workspace.js'
import { buildPrompt } from './prompt.js'
import type { IssueInfo } from './linear.js'

export interface AgentRunner {
  spawn(issue: IssueInfo, workspacePath: string): Promise<number>
}

export async function spawnAgent(issue: IssueInfo, ws: string, attempt?: number | null): Promise<number> {
  const prompt = await buildPrompt(issue, ws, attempt)
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'a')
  const child = spawn('claude', ['-p', prompt], {
    cwd: ws,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: { ...process.env },
  })
  child.unref()
  return child.pid!
}
