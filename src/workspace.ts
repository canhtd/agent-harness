import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config, WORKSPACES } from './config.js'

export interface WorkspaceResult {
  path: string
  created: boolean
}

export function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_')
}

export async function ensureWorktree(identifier: string): Promise<WorkspaceResult> {
  const key = sanitize(identifier)
  const ws = path.join(WORKSPACES, key)
  try {
    await fs.access(ws)
    return { path: ws, created: false }
  } catch {
    try { execSync(`git worktree remove "${ws}" --force`, { cwd: config.repoPath, stdio: 'pipe' }) } catch { /* no worktree */ }
    try { execSync(`git branch -D "agent/${key}"`, { cwd: config.repoPath, stdio: 'pipe' }) } catch { /* no branch */ }
    execSync(`git worktree add "${ws}" -b "agent/${key}" origin/main`, {
      cwd: config.repoPath,
      stdio: 'pipe',
    })
    return { path: ws, created: true }
  }
}

export function workspacePath(identifier: string): string {
  return path.join(WORKSPACES, sanitize(identifier))
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
