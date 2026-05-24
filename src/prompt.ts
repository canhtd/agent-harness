import type { IssueInfo } from './linear.js'

function buildTodoPrompt(issue: IssueInfo): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title}`,
    '',
    issue.description || '(no description)',
    '',
    'You are running autonomously — do not ask for confirmation.',
    'Steps:',
    '1. Read CLAUDE.md and GOTCHAS.md',
    '2. Implement the task',
    '3. Verify EVERY acceptance criterion in the issue description — do not skip any',
    '4. Run pnpm typecheck — must pass',
    '5. git add + commit + push',
    '6. Create PR with gh pr create — list which acceptance criteria are met in the PR body',
  ].join('\n')
}

function buildReworkPrompt(issue: IssueInfo): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title} (REWORK)`,
    '',
    issue.description || '(no description)',
    '',
    'This issue was previously implemented but the PR was rejected by a reviewer.',
    'You are running autonomously — do not ask for confirmation.',
    'Steps:',
    '1. Read CLAUDE.md and GOTCHAS.md',
    '2. Find the existing PR for this issue using gh pr list — read the review comments to understand what needs to change',
    '3. Close the old PR with gh pr close',
    '4. Delete the old remote branch with git push origin --delete <branch>',
    '5. Start fresh from origin/main on a new branch',
    '6. Re-implement the task, addressing ALL review feedback',
    '7. Verify EVERY acceptance criterion in the issue description — do not skip any',
    '8. Run pnpm typecheck — must pass',
    '9. git add + commit + push',
    '10. Create a new PR with gh pr create — list which acceptance criteria are met and which review feedback was addressed in the PR body',
  ].join('\n')
}

export function buildPrompt(issue: IssueInfo): string {
  if (issue.stateName === 'Rework') return buildReworkPrompt(issue)
  return buildTodoPrompt(issue)
}
