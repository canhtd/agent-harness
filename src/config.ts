import path from 'node:path'
import os from 'node:os'
import pino from 'pino'
import 'dotenv/config'

export const config = {
  linearApiKey: process.env.LINEAR_API_KEY!,
  teamKey: process.env.LINEAR_TEAM_KEY!,
  projectSlug: process.env.LINEAR_PROJECT_SLUG || undefined,
  repoPath: process.env.REPO_PATH || process.cwd(),
  maxConcurrent: 10,
  maxReworkConcurrent: 2,
  stallTimeoutMs: Number(process.env.STALL_TIMEOUT_MS) || 600_000,
  maxTurns: Number(process.env.MAX_TURNS) || 5,
  maxAttempts: Number(process.env.MAX_ATTEMPTS) || 3,
  babysitCooldownMs: Number(process.env.BABYSIT_COOLDOWN_MS) || 600_000,
  babysitThreshold: Number(process.env.BABYSIT_THRESHOLD) || 3,
  maxCostPerIssueUsd: Number(process.env.MAX_COST_PER_ISSUE_USD) || 50,
}

const BASE = path.join(os.homedir(), '.agent-harness')
export const LOCKS = path.join(BASE, 'locks')
export const WORKSPACES = path.join(BASE, 'workspaces')
export const LOGS = path.join(BASE, 'logs')
export const TOKENS_LOG = path.join(LOGS, 'tokens.jsonl')
export const HANDOFFS = path.join(BASE, 'handoffs')
export const BABYSIT_STATE = path.join(BASE, 'babysit-last.json')

export const log = pino({ name: 'agent-harness' })
