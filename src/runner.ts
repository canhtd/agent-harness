import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
import path from 'node:path'
import { config, LOCKS, LOGS } from './config.js'
import { sanitize } from './workspace.js'
import { buildPrompt, buildContinuationPrompt } from './prompt.js'
import type { IssueInfo } from './linear.js'

export interface AgentRunner {
  spawn(issue: IssueInfo, workspacePath: string): number
}

export async function spawnAgent(issue: IssueInfo, ws: string, attempt?: number): Promise<number> {
  const prompt = await buildPrompt(issue, { attempt, repoPath: config.repoPath })
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'w')
  const exitCodeFile = path.join(LOCKS, `${issue.id}.exit`)
  const child = spawn('sh', ['-c', 'claude -p "$1" --output-format stream-json; echo $? > "$2"', '_', prompt, exitCodeFile], {
    cwd: ws,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: { ...process.env },
  })
  child.unref()
  return child.pid!
}

export async function spawnContinuation(issue: IssueInfo, ws: string, reason: string): Promise<number> {
  const prompt = buildContinuationPrompt(issue, reason)
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'a')
  const exitCodeFile = path.join(LOCKS, `${issue.id}.exit`)
  const child = spawn('sh', ['-c', 'claude -p "$1" --continue --output-format stream-json; echo $? > "$2"', '_', prompt, exitCodeFile], {
    cwd: ws,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: { ...process.env },
  })
  child.unref()
  return child.pid!
}
