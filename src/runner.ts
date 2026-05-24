import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { LOGS } from './config.js'
import { sanitize } from './workspace.js'
import { buildPrompt } from './prompt.js'
import type { IssueInfo } from './linear.js'

export interface AgentRunner {
  spawn(issue: IssueInfo, workspacePath: string): number
}

export function spawnAgent(issue: IssueInfo, ws: string): number {
  const prompt = buildPrompt(issue)
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
