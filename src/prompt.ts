import fs from 'node:fs/promises'
import path from 'node:path'
import { Liquid } from 'liquidjs'
import type { IssueInfo } from './linear.js'

interface WorkflowFile {
  config: Record<string, string>
  body: string
}

function parseFrontMatter(content: string): WorkflowFile {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { config: {}, body: content }

  const config: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) config[key] = value
  }

  return { config, body: match[2] }
}

function isBugFix(issue: IssueInfo): boolean {
  return issue.labels.some((l) => l === 'sentry-auto' || l === 'bug')
}

function bugFixPrompt(issue: IssueInfo): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title} (BUG FIX)`,
    '',
    issue.description || '(no description)',
    '',
    'You are running autonomously — do not ask for confirmation.',
    'Steps:',
    '1. Read CLAUDE.md and GOTCHAS.md',
    '2. Investigate the bug — follow the stack trace, reproduce the error',
    '3. Write a test that reproduces the bug — the test MUST fail before your fix',
    '4. Fix the bug',
    '5. Run the test again — it must now pass',
    '6. Run the full project test suite (see CLAUDE.md) — all tests must pass',
    '7. Run pnpm typecheck — must pass',
    '8. git add + commit + push',
    '9. Create PR with gh pr create — describe root cause, fix, and test coverage',
  ].join('\n')
}

function defaultPrompt(issue: IssueInfo): string {
  if (isBugFix(issue)) return bugFixPrompt(issue)
  return [
    `Linear issue: ${issue.identifier} — ${issue.title}`,
    '',
    issue.description || '(no description)',
    '',
    'You are running autonomously — do not ask for confirmation.',
    'Steps:',
    '1. Read CLAUDE.md and GOTCHAS.md',
    '2. Implement the task',
    '3. Write tests that verify each acceptance criterion — tests are mandatory, not optional',
    '4. Verify EVERY acceptance criterion in the issue description — do not skip any',
    '5. Run the project test command (see CLAUDE.md) — all tests must pass',
    '6. Run pnpm typecheck — must pass',
    '7. git add + commit + push',
    '8. Create PR with gh pr create — list which acceptance criteria are met in the PR body',
  ].join('\n')
}

function reworkPrompt(issue: IssueInfo): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title} (REWORK)`,
    '',
    issue.description || '(no description)',
    '',
    'This issue was previously implemented but the PR was rejected by a reviewer.',
    'You are running autonomously — do not ask for confirmation.',
    'Steps:',
    '1. Read CLAUDE.md and GOTCHAS.md',
    `2. Find the existing PR for this issue using \`gh pr list --head agent/${issue.identifier}\``,
    '3. Read ALL review comments and requested changes on the PR using `gh pr view <number> --comments`',
    '4. Close the old PR with `gh pr close <number>`',
    '5. Create a fresh branch from origin/main — do NOT reuse the old branch',
    '6. Implement the task from scratch, addressing ALL review feedback',
    '7. Write tests that verify each acceptance criterion — tests are mandatory, not optional',
    '8. Verify EVERY acceptance criterion in the issue description — do not skip any',
    '9. Run the project test command (see CLAUDE.md) — all tests must pass',
    '10. Run pnpm typecheck — must pass',
    '11. git add + commit + push',
    '12. Create a new PR with gh pr create — reference the old PR and list which review comments are addressed',
  ].join('\n')
}

export function buildContinuationPrompt(issue: IssueInfo, reason: string): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title} (CONTINUATION)`,
    '',
    `Your previous work on this issue needs attention: ${reason}`,
    '',
    'You are running autonomously — do not ask for confirmation.',
    'You have context from the previous turn via --continue.',
    'Steps:',
    '1. Understand what changed since your last run',
    '2. Fix the issue (rebase if conflicts, fix code if CI failed, recreate PR if closed)',
    '3. Run pnpm typecheck — must pass',
    '4. git add + commit + push',
    '5. Verify the PR is updated or create one if needed',
  ].join('\n')
}

export async function buildPrompt(
  issue: IssueInfo,
  opts: { attempt?: number; repoPath: string },
): Promise<string> {
  const templateFile = issue.stateName === 'Rework' ? 'WORKFLOW_REWORK.md' : 'WORKFLOW.md'
  const fallback = issue.stateName === 'Rework' ? reworkPrompt : defaultPrompt

  let raw: string
  try {
    raw = await fs.readFile(path.join(opts.repoPath, templateFile), 'utf-8')
  } catch {
    return fallback(issue)
  }

  const { body } = parseFrontMatter(raw)

  const engine = new Liquid()
  return engine.parseAndRender(body, {
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? '',
      priority: issue.priority ?? null,
      labels: issue.labels,
      stateName: issue.stateName,
    },
    attempt: opts.attempt ?? null,
  })
}
