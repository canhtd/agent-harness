import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config, WORKSPACES } from './config.js'

export function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_')
}

export async function ensureWorktree(identifier: string): Promise<string> {
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

export async function listWorktreeIdentifiers(): Promise<string[]> {
  try {
    const entries = await fs.readdir(WORKSPACES, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function removeWorktree(identifier: string): Promise<void> {
  const key = sanitize(identifier)
  const ws = path.join(WORKSPACES, key)
  execSync(`git worktree remove "${ws}" --force`, {
    cwd: config.repoPath,
    stdio: 'pipe',
  })
}
