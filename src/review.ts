import { execFileSync, execSync, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { config, log } from './config.js'

const SKILL_DIR = path.join(config.repoPath, '.claude', 'skills')
const BOT_TOKEN = process.env.GITHUB_BOT_TOKEN || ''

const REVIEWERS = [
  { name: 'quality', skill: 'review-quality' },
  { name: 'security', skill: 'review-security' },
  { name: 'deps', skill: 'review-deps' },
] as const

interface ReviewResult {
  reviewer: string
  approved: boolean
  body: string
}

async function loadSkillPrompt(skill: string): Promise<string> {
  return fs.readFile(path.join(SKILL_DIR, skill, 'SKILL.md'), 'utf-8')
}

function getPrDiff(prNumber: number): string {
  return execSync(`gh pr diff ${prNumber}`, {
    cwd: config.repoPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  }).toString()
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const child = spawn('claude', ['-p', '-'], {
      cwd: config.repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stdin.write(prompt)
    child.stdin.end()
    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString().trim()
      if (code !== 0) reject(new Error(`claude exited ${code}: ${output}`))
      else resolve(output)
    })
    child.on('error', reject)
  })
}

async function runSingleReview(prNumber: number, diff: string, reviewer: typeof REVIEWERS[number]): Promise<ReviewResult> {
  const skill = await loadSkillPrompt(reviewer.skill)
  const prompt = [skill, '', '## PR Diff', '', '```diff', diff, '```'].join('\n')

  log.info({ prNumber, reviewer: reviewer.name }, 'review started')

  const output = await runClaude(prompt)
  const approved = output.toUpperCase().includes('APPROVE') && !output.toUpperCase().includes('REQUEST_CHANGES')
  const body = `**[${reviewer.name}]** ${output}`

  log.info({ prNumber, reviewer: reviewer.name, approved }, 'review complete')
  return { reviewer: reviewer.name, approved, body }
}

export async function reviewPr(prNumber: number): Promise<{ approved: boolean; results: ReviewResult[] }> {
  const diff = getPrDiff(prNumber)
  if (!diff.trim()) {
    log.warn({ prNumber }, 'empty diff, skipping review')
    return { approved: true, results: [] }
  }

  const results = await Promise.all(
    REVIEWERS.map((r) => runSingleReview(prNumber, diff, r).catch((err): ReviewResult => {
      log.error({ prNumber, reviewer: r.name, error: String(err) }, 'review failed')
      return { reviewer: r.name, approved: false, body: `**[${r.name}]** Review failed: ${err}` }
    })),
  )

  const approved = results.every((r) => r.approved)

  const combinedBody = results.map((r) => r.body).join('\n\n---\n\n')
  const action = approved ? '--approve' : '--request-changes'

  const tmpFile = path.join(os.tmpdir(), `review-${prNumber}.md`)
  try {
    fsSync.writeFileSync(tmpFile, combinedBody)
    const env = BOT_TOKEN
      ? { ...process.env, GH_TOKEN: BOT_TOKEN }
      : { ...process.env }
    execFileSync('gh', ['pr', 'review', String(prNumber), action, '-F', tmpFile], {
      cwd: config.repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
      env,
    })
    log.info({ prNumber, approved }, 'review posted via bot')
  } catch (err) {
    log.error({ prNumber, error: String(err) }, 'failed to post review')
  } finally {
    try { fsSync.unlinkSync(tmpFile) } catch {}
  }

  return { approved, results }
}

export function getPrNumber(identifier: string): number | null {
  try {
    const raw = execSync(
      `gh pr list --head "agent/${identifier}" --state open --json number --jq '.[0].number'`,
      { cwd: config.repoPath, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 },
    ).toString().trim()
    return raw ? parseInt(raw, 10) : null
  } catch {
    return null
  }
}
