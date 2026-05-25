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

function defaultPrompt(issue: IssueInfo): string {
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
    '7. Verify EVERY acceptance criterion in the issue description — do not skip any',
    '8. Run pnpm typecheck — must pass',
    '9. git add + commit + push',
    '10. Create a new PR with gh pr create — reference the old PR and list which review comments are addressed',
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
