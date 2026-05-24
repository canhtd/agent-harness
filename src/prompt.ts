import { Liquid } from 'liquidjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { IssueInfo } from './linear.js'

interface WorkflowFile {
  config: Record<string, unknown>
  template: string
}

function parseWorkflow(raw: string): WorkflowFile {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { config: {}, template: raw }

  const config: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const val = line.slice(sep + 1).trim()
    if (key) config[key] = val
  }

  return { config, template: match[2] }
}

function defaultPrompt(issue: IssueInfo): string {
  return [
    `Linear issue: ${issue.identifier} — ${issue.title}`,
    '',
    issue.description || '(no description)',
    '',
    'Follow CLAUDE.md. You are running autonomously — do not ask for confirmation.',
    'Steps: implement the task, run pnpm typecheck, git add + commit, git push, create PR with gh pr create.',
  ].join('\n')
}

export async function buildPrompt(
  issue: IssueInfo,
  workspacePath: string,
  attempt?: number | null,
): Promise<string> {
  const workflowPath = path.join(workspacePath, 'WORKFLOW.md')
  let raw: string
  try {
    raw = await fs.readFile(workflowPath, 'utf-8')
  } catch {
    return defaultPrompt(issue)
  }

  const { template } = parseWorkflow(raw)
  const engine = new Liquid()
  return await engine.parseAndRender(template, {
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? '',
      priority: issue.priority ?? null,
      labels: issue.labels,
    },
    attempt: attempt ?? null,
  })
}
