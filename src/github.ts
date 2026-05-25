import { execSync } from 'node:child_process'
import { config } from './config.js'
import { sanitize } from './workspace.js'

export type PrOutcome =
  | { action: 'done' }
  | { action: 'skip'; reason: string }
  | { action: 'redispatch'; reason: string }
  | { action: 'review'; prNumber: number }

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

  const reviewState = getReviewState(openPr.number)
  if (reviewState === 'approved') {
    return { action: 'skip', reason: 'PR approved — awaiting merge' }
  }
  if (reviewState === 'changes_requested') {
    return { action: 'redispatch', reason: 'review requested changes' }
  }

  return { action: 'review', prNumber: openPr.number }
}

function getReviewState(prNumber: number): 'approved' | 'changes_requested' | 'none' {
  try {
    const raw = execSync(
      `gh pr view ${prNumber} --json reviews --jq '.reviews | map(.state) | unique'`,
      { cwd: config.repoPath, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 },
    ).toString().trim()
    const states: string[] = JSON.parse(raw || '[]')
    if (states.includes('CHANGES_REQUESTED')) return 'changes_requested'
    if (states.includes('APPROVED')) return 'approved'
    return 'none'
  } catch {
    return 'none'
  }
}
