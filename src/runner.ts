import { spawn } from 'node:child_process'
import { openSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { config, LOCKS, LOGS } from './config.js'
import { sanitize } from './workspace.js'
import { buildPrompt, buildContinuationPrompt, buildResearchPrompt } from './prompt.js'
import type { IssueInfo } from './linear.js'

export interface AgentRunner {
  spawn(issue: IssueInfo, workspacePath: string): number
}

export async function spawnAgent(issue: IssueInfo, ws: string, attempt?: number): Promise<number> {
  const prompt = await buildPrompt(issue, { attempt, repoPath: config.repoPath })
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'w')
  const exitCodeFile = path.join(LOCKS, `${issue.id}.exit`)
  const { GITHUB_BOT_TOKEN: _, ...agentEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p "$1" --verbose --output-format stream-json; echo $? > "$2"', '_', prompt, exitCodeFile], {
    cwd: ws,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: agentEnv,
  })
  child.unref()
  return child.pid!
}

export async function spawnContinuation(issue: IssueInfo, ws: string, reason: string): Promise<number> {
  const prompt = buildContinuationPrompt(issue, reason)
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'a')
  const exitCodeFile = path.join(LOCKS, `${issue.id}.exit`)
  const { GITHUB_BOT_TOKEN: _bot, ...contEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p "$1" --continue --verbose --output-format stream-json; echo $? > "$2"', '_', prompt, exitCodeFile], {
    cwd: ws,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: contEnv,
  })
  child.unref()
  return child.pid!
}

export function spawnResearchAgent(issue: IssueInfo): number {
  const prompt = buildResearchPrompt(issue)
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'w')
  const exitCodeFile = path.join(LOCKS, `${issue.id}.exit`)
  const { GITHUB_BOT_TOKEN: _, ...agentEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p "$1" --verbose --output-format stream-json; echo $? > "$2"', '_', prompt, exitCodeFile], {
    cwd: config.repoPath,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: agentEnv,
  })
  child.unref()
  return child.pid!
}

export function spawnBabysit(context: string): number {
  const skillPath = path.join(config.repoPath, '.claude', 'skills', 'babysit', 'SKILL.md')
  const skillContent = readFileSync(skillPath, 'utf-8')
  const prompt = `You are a recovery agent. Follow the instructions below.\n\n${skillContent}\n\nContext:\n${context}`
  const fd = openSync(path.join(LOGS, 'babysit.log'), 'a')
  const { GITHUB_BOT_TOKEN: _token, ...babysitEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p "$1" --verbose --output-format stream-json', '_', prompt], {
    cwd: config.repoPath,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: babysitEnv,
  })
  child.unref()
  return child.pid!
}
