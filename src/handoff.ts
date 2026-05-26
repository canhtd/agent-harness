import fs from 'node:fs/promises'
import path from 'node:path'
import { HANDOFFS, LOGS, log } from './config.js'
import { sanitize } from './workspace.js'
import { fetchLastReviewBody } from './github.js'

export async function writeHandoff(
  issueId: string,
  identifier: string,
  attempt: number,
  turns: number,
  prNumber: number | null,
): Promise<void> {
  const safe = sanitize(identifier)

  let reviewBody = ''
  if (prNumber !== null) {
    try {
      reviewBody = fetchLastReviewBody(prNumber)
    } catch (err) {
      log.warn({ issueId, issueIdentifier: identifier, error: String(err) }, 'failed to fetch review body for handoff')
    }
  }

  let logTail = ''
  try {
    const logPath = path.join(LOGS, `${safe}.log`)
    const content = await fs.readFile(logPath, 'utf-8')
    const lines = content.split('\n')
    logTail = lines.slice(-50).join('\n')
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      logTail = '(no agent log found)'
    } else {
      log.warn({ issueId, issueIdentifier: identifier, error: String(err) }, 'failed to read agent log for handoff')
      logTail = '(failed to read agent log)'
    }
  }

  const handoff = [
    `# Handoff — Attempt ${attempt}`,
    '',
    '## Current State',
    prNumber !== null
      ? `PR #${prNumber} bị reject sau ${turns} turns`
      : `Agent hit ${turns} turns without creating a PR`,
    '',
    '## Tried & Failed',
    reviewBody || '(no review feedback)',
    '',
    '## Agent Log (last 50 lines)',
    logTail,
  ].join('\n')

  const handoffPath = path.join(HANDOFFS, `${safe}.md`)
  await fs.writeFile(handoffPath, handoff, 'utf-8')

  log.info({ issueId, issueIdentifier: identifier, attempt, handoffPath }, 'handoff written')
}

export async function readHandoff(identifier: string): Promise<string | null> {
  const safe = sanitize(identifier)
  try {
    return await fs.readFile(path.join(HANDOFFS, `${safe}.md`), 'utf-8')
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null
    }
    log.warn({ issueIdentifier: identifier, error: String(err) }, 'failed to read handoff')
    return null
  }
}

export async function removeHandoff(identifier: string): Promise<void> {
  const safe = sanitize(identifier)
  try {
    await fs.unlink(path.join(HANDOFFS, `${safe}.md`))
    log.info({ issueIdentifier: identifier }, 'handoff removed')
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return
    log.warn({ issueIdentifier: identifier, error: String(err) }, 'failed to remove handoff')
  }
}
