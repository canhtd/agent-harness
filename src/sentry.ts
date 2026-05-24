import { LinearClient } from '@linear/sdk'
import { config, log } from './config.js'

interface SentryIssue {
  id: string
  title: string
  culprit: string
  permalink: string
  metadata: { type?: string; value?: string }
  count: string
  firstSeen: string
  lastSeen: string
}

const sentryConfig = {
  authToken: process.env.SENTRY_AUTH_TOKEN || '',
  org: process.env.SENTRY_ORG || '',
  project: process.env.SENTRY_PROJECT || '',
}

function isSentryConfigured(): boolean {
  return !!(sentryConfig.authToken && sentryConfig.org && sentryConfig.project)
}

async function fetchUnresolvedIssues(): Promise<SentryIssue[]> {
  const { authToken, org, project } = sentryConfig
  const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  })

  if (!res.ok) {
    throw new Error(`Sentry API returned ${res.status}: ${await res.text()}`)
  }

  return res.json() as Promise<SentryIssue[]>
}

function sentryLabel(sentryIssueId: string): string {
  return `sentry:${sentryIssueId}`
}

async function findExistingLinearIssue(
  linear: LinearClient,
  sentryIssueId: string,
): Promise<boolean> {
  const result = await linear.issues({
    filter: {
      team: { key: { eq: config.teamKey } },
      description: { contains: sentryLabel(sentryIssueId) },
    },
    first: 1,
  })
  return result.nodes.length > 0
}

function buildDescription(issue: SentryIssue): string {
  const lines = [
    `**Sentry Issue:** [${issue.id}](${issue.permalink})`,
    '',
    `**Error:** ${issue.metadata.type || 'Unknown'}: ${issue.metadata.value || issue.title}`,
    `**Culprit:** ${issue.culprit}`,
    `**Occurrences:** ${issue.count}`,
    `**First seen:** ${issue.firstSeen}`,
    `**Last seen:** ${issue.lastSeen}`,
    '',
    `<!-- ${sentryLabel(issue.id)} -->`,
  ]
  return lines.join('\n')
}

async function getOrCreateLabel(linear: LinearClient): Promise<string> {
  const team = await linear.teams({ filter: { key: { eq: config.teamKey } }, first: 1 })
  const teamId = team.nodes[0]?.id
  if (!teamId) throw new Error(`Team ${config.teamKey} not found`)

  const labels = await linear.issueLabels({
    filter: { team: { id: { eq: teamId } }, name: { eq: 'sentry-auto' } },
    first: 1,
  })

  if (labels.nodes.length > 0) return labels.nodes[0].id

  const created = await linear.createIssueLabel({ name: 'sentry-auto', teamId })
  const label = await created.issueLabel
  if (!label) throw new Error('Failed to create sentry-auto label')
  return label.id
}

export async function pollSentry(): Promise<void> {
  if (!isSentryConfigured()) {
    log.debug('sentry not configured, skipping')
    return
  }

  const linear = new LinearClient({ apiKey: config.linearApiKey })

  let sentryIssues: SentryIssue[]
  try {
    sentryIssues = await fetchUnresolvedIssues()
  } catch (err) {
    log.error({ error: String(err) }, 'sentry poll failed')
    return
  }

  if (sentryIssues.length === 0) return

  let labelId: string | undefined
  const team = await linear.teams({ filter: { key: { eq: config.teamKey } }, first: 1 })
  const teamId = team.nodes[0]?.id
  if (!teamId) {
    log.error({ teamKey: config.teamKey }, 'team not found')
    return
  }

  for (const issue of sentryIssues) {
    const exists = await findExistingLinearIssue(linear, issue.id)
    if (exists) {
      log.debug({ sentryIssueId: issue.id }, 'sentry issue already tracked')
      continue
    }

    if (!labelId) {
      labelId = await getOrCreateLabel(linear)
    }

    const created = await linear.createIssue({
      teamId,
      title: issue.title,
      description: buildDescription(issue),
      priority: 2,
      labelIds: [labelId],
    })

    const linearIssue = await created.issue
    log.info(
      {
        sentryIssueId: issue.id,
        issueId: linearIssue?.id,
        issueIdentifier: linearIssue?.identifier,
      },
      'sentry issue created',
    )
  }
}
