import { execSync } from 'node:child_process'
import { config } from './config.js'
import { sanitize } from './workspace.js'

export type PrOutcome =
  | { action: 'done' }
  | { action: 'skip'; reason: string }
  | { action: 'redispatch'; reason: string }

export function checkPrStatus(identifier: string): PrOutcome {
  const branch = `agent/${sanitize(identifier)}`
  let prs: Array<{ number: number; state: string; mergeStateStatus: string; statusCheckRollup: Array<{ status: string; conclusion: string; state: string }> | null }>
  try {
    const raw = execSync(
      `gh pr list --head "${branch}" --state all --json number,state,mergeStateStatus,statusCheckRollup`,
      { cwd: config.repoPath, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 },
    ).toString().trim()
    prs = JSON.parse(raw)
  } catch {
    return { action: 'redispatch', reason: 'failed to check PR status' }
  }

  if (prs.length === 0) {
    return { action: 'redispatch', reason: 'no PR found — agent may have failed silently' }
  }

  if (prs.some((pr) => pr.state === 'MERGED')) {
    return { action: 'done' }
  }

  const openPr = prs.find((pr) => pr.state === 'OPEN')
  if (!openPr) {
    return { action: 'redispatch', reason: 'PR was closed without merging' }
  }

  if (openPr.mergeStateStatus === 'DIRTY') {
    return { action: 'redispatch', reason: 'PR has merge conflicts' }
  }

  const checks = openPr.statusCheckRollup ?? []
  const hasFailure = checks.some((c) =>
    c.conclusion === 'FAILURE' || c.conclusion === 'TIMED_OUT' ||
    c.state === 'FAILURE' || c.state === 'ERROR',
  )
  if (hasFailure) {
    return { action: 'redispatch', reason: 'CI checks failed' }
  }

  const hasPending = checks.some((c) =>
    (c.status && c.status !== 'COMPLETED') ||
    c.state === 'PENDING' || c.state === 'EXPECTED',
  )
  if (hasPending) {
    return { action: 'skip', reason: 'CI pending' }
  }

  return { action: 'skip', reason: 'PR open, CI passed — awaiting review' }
}
