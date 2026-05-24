import type { IssueInfo } from './linear.js'

const TODO_STEPS = [
  'Follow CLAUDE.md. You are running autonomously — do not ask for confirmation.',
  'Steps: implement the task, run pnpm typecheck, git add + commit, git push, create PR with gh pr create.',
].join('\n')

const REWORK_STEPS = [
  'Follow CLAUDE.md. You are running autonomously — do not ask for confirmation.',
  'This is a rework issue — the previous PR was rejected by a reviewer.',
  'Steps: find and read review comments on the existing PR using `gh pr list --state closed --head agent/${identifier}` and `gh pr view`,',
  'close the old PR if still open with `gh pr close`, implement fixes addressing all review feedback,',
  'run pnpm typecheck, git add + commit, git push, create a new PR with gh pr create referencing the review feedback.',
].join('\n')

export function buildPrompt(issue: IssueInfo): string {
  const steps = issue.stateName === 'Rework' ? REWORK_STEPS : TODO_STEPS
  return [
    `Linear issue: ${issue.identifier} — ${issue.title}`,
    '',
    issue.description || '(no description)',
    '',
    steps,
  ].join('\n')
}
