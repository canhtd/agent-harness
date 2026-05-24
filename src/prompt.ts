import type { IssueInfo } from './linear.js'

export function buildPrompt(issue: IssueInfo): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title}`,
    '',
    issue.description || '(no description)',
    '',
    'Follow CLAUDE.md. Branch, implement, test, create PR.',
  ].join('\n')
}
