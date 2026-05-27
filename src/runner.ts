import { spawn } from 'node:child_process'
import { openSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { config, LOCKS, LOGS } from './config.js'
import { sanitize } from './workspace.js'
import { buildPrompt, buildContinuationPrompt, buildResearchPrompt } from './prompt.js'
import type { IssueInfo } from './linear.js'

export interface AgentRunner {
  spawn(issue: IssueInfo, workspacePath: string): number
}

function writePromptFile(identifier: string, prompt: string): string {
  const dir = path.join(os.tmpdir(), 'agent-harness-prompts')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${sanitize(identifier)}.txt`)
  writeFileSync(file, prompt)
  return file
}

export async function spawnAgent(issue: IssueInfo, ws: string, attempt?: number): Promise<number> {
  const prompt = await buildPrompt(issue, { attempt, repoPath: config.repoPath })
  const promptFile = writePromptFile(issue.identifier, prompt)
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'w')
  const exitCodeFile = path.join(LOCKS, `${issue.id}.exit`)
  const { GITHUB_BOT_TOKEN: _, ...agentEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p < "$1" --verbose --output-format stream-json; echo $? > "$2"', '_', promptFile, exitCodeFile], {
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
  const promptFile = writePromptFile(`${issue.identifier}-cont`, prompt)
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'a')
  const exitCodeFile = path.join(LOCKS, `${issue.id}.exit`)
  const { GITHUB_BOT_TOKEN: _bot, ...contEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p < "$1" --continue --verbose --output-format stream-json; echo $? > "$2"', '_', promptFile, exitCodeFile], {
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
  const promptFile = writePromptFile(`${issue.identifier}-research`, prompt)
  const fd = openSync(path.join(LOGS, `${sanitize(issue.identifier)}.log`), 'w')
  const { GITHUB_BOT_TOKEN: _, ...agentEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p < "$1" --verbose --output-format stream-json', '_', promptFile], {
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
  const promptFile = writePromptFile('babysit', prompt)
  const fd = openSync(path.join(LOGS, 'babysit.log'), 'a')
  const { GITHUB_BOT_TOKEN: _token, ...babysitEnv } = process.env
  const child = spawn('sh', ['-c', 'claude -p < "$1" --verbose --output-format stream-json', '_', promptFile], {
    cwd: config.repoPath,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: babysitEnv,
  })
  child.unref()
  return child.pid!
}
