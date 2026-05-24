import type { IssueInfo } from './linear.js'

export function buildPrompt(issue: IssueInfo): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title}`,
    '',
    issue.description || '(no description)',
    '',
    'Follow CLAUDE.md. You are running autonomously — do not ask for confirmation.',
    'Steps: implement the task, run pnpm typecheck, git add + commit, git push, create PR with gh pr create.',
  ].join('\n')
}
