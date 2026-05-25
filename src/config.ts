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
  stallTimeoutMs: Number(process.env.STALL_TIMEOUT_MS) || 300_000,
  maxTurns: Number(process.env.MAX_TURNS) || 5,
}

const BASE = path.join(os.homedir(), '.agent-harness')
export const LOCKS = path.join(BASE, 'locks')
export const WORKSPACES = path.join(BASE, 'workspaces')
export const LOGS = path.join(BASE, 'logs')

export const log = pino({ name: 'agent-harness' })
