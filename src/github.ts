import { execSync } from 'node:child_process'
import { config, log } from './config.js'
import { sanitize } from './workspace.js'

const GH_TOKEN = process.env.GITHUB_BOT_TOKEN || process.env.GH_TOKEN || ''

function ghExec(cmd: string, opts?: { timeout?: number }): string {
  return execSync(cmd, {
    cwd: config.repoPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: opts?.timeout ?? 30_000,
    env: GH_TOKEN ? { ...process.env, GH_TOKEN } : process.env,
  }).toString().trim()
}

export type PrOutcome =
  | { action: 'done' }
  | { action: 'skip'; reason: string }
  | { action: 'redispatch'; reason: string }
  | { action: 'review'; prNumber: number }

export function checkPrStatus(identifier: string): PrOutcome {
  const branch = `agent/${sanitize(identifier)}`
  let prs: Array<{ number: number; state: string; mergeStateStatus: string; statusCheckRollup: Array<{ status: string; conclusion: string; state: string }> | null }>
  try {
    const raw = ghExec(
      `gh pr list --head "${branch}" --state all --json number,state,mergeStateStatus,statusCheckRollup`,
    )
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

  if (reviewState !== 'none' && hasNewCommitsSinceReview(openPr.number)) {
    return { action: 'review', prNumber: openPr.number }
  }

  if (reviewState === 'approved') {
    if (mergePr(openPr.number)) {
      return { action: 'done' }
    }
    return { action: 'skip', reason: 'merge failed, will retry' }
  }

  if (reviewState === 'changes_requested') {
    const reviewBody = fetchLastReviewBody(openPr.number)
    const reason = reviewBody
      ? `review requested changes:\n\n${reviewBody}`
      : 'review requested changes'
    return { action: 'redispatch', reason }
  }

  return { action: 'review', prNumber: openPr.number }
}

export function fetchLastReviewBody(prNumber: number): string {
  try {
    return ghExec(
      `gh pr view ${prNumber} --json reviews --jq '.reviews | map(select(.state == "CHANGES_REQUESTED")) | last | .body'`,
    )
  } catch {
    return ''
  }
}

export function getOpenPrNumber(identifier: string): number | null {
  const branch = `agent/${sanitize(identifier)}`
  try {
    const raw = ghExec(
      `gh pr list --head "${branch}" --state open --json number`,
    )
    const prs = JSON.parse(raw) as Array<{ number: number }>
    return prs[0]?.number ?? null
  } catch {
    return null
  }
}

export function closePr(prNumber: number): void {
  try {
    ghExec(`gh pr close ${prNumber}`)
  } catch {}
}

export function deleteRemoteBranch(identifier: string): void {
  const branch = `agent/${sanitize(identifier)}`
  try {
    ghExec(`git push origin --delete "${branch}"`)
  } catch {}
}

function getReviewState(prNumber: number): 'approved' | 'changes_requested' | 'none' {
  try {
    const raw = ghExec(
      `gh pr view ${prNumber} --json reviewDecision --jq '.reviewDecision'`,
    )
    if (raw === 'APPROVED') return 'approved'
    if (raw === 'CHANGES_REQUESTED') return 'changes_requested'
    return 'none'
  } catch {
    return 'none'
  }
}

export function hasNewCommitsSinceReview(prNumber: number): boolean {
  try {
    const raw = ghExec(
      `gh pr view ${prNumber} --json reviews,commits --jq '{ lastReview: ([.reviews[] | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED")] | sort_by(.submittedAt) | last | .submittedAt), lastCommit: (.commits | last | .committedDate) }'`,
    )
    const { lastReview, lastCommit } = JSON.parse(raw)
    if (!lastReview || !lastCommit) return false
    return new Date(lastCommit) > new Date(lastReview)
  } catch {
    return false
  }
}

export function mergePr(prNumber: number): boolean {
  try {
    ghExec(`gh pr checks ${prNumber} --fail-fast`)
  } catch {
    log.warn({ prNumber }, 'PR merge skipped — CI checks not passing')
    return false
  }

  try {
    ghExec(`gh pr merge ${prNumber} --squash`, { timeout: 60_000 })
    log.info({ prNumber }, 'PR auto-merged')
    return true
  } catch (err) {
    log.warn({ prNumber, error: String(err) }, 'PR merge failed')
    return false
  }
}
