import { LinearClient } from '@linear/sdk'
import { config, log } from './config.js'

interface SentryIssue {
  id: string
  title: string
  culprit: string
  permalink: string
  shortId: string
  metadata: { type?: string; value?: string }
  count: string
  firstSeen: string
  lastSeen: string
}

interface SentryEvent {
  entries?: Array<{
    type: string
    data?: {
      values?: Array<{
        type?: string
        value?: string
        stacktrace?: {
          frames?: Array<{
            filename?: string
            function?: string
            lineNo?: number
          }>
        }
      }>
    }
  }>
}

const SENTRY_MARKER = (id: string) => `[sentry:${id}]`

async function sentryFetch<T>(path: string): Promise<T> {
  const res = await fetch(`https://sentry.io${path}`, {
    headers: { Authorization: `Bearer ${config.sentryAuthToken}` },
  })
  if (!res.ok) throw new Error(`Sentry API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function fetchUnresolvedIssues(): Promise<SentryIssue[]> {
  return sentryFetch<SentryIssue[]>(
    `/api/0/projects/${config.sentryOrg}/${config.sentryProject}/issues/?query=is:unresolved`,
  )
}

async function fetchLatestEvent(issueId: string): Promise<SentryEvent | null> {
  try {
    return await sentryFetch<SentryEvent>(`/api/0/issues/${issueId}/events/latest/`)
  } catch {
    return null
  }
}

function formatStackTrace(event: SentryEvent | null): string {
  if (!event?.entries) return ''

  for (const entry of event.entries) {
    if (entry.type !== 'exception' || !entry.data?.values) continue
    const lines: string[] = []
    for (const exc of entry.data.values) {
      if (exc.type || exc.value) lines.push(`${exc.type ?? ''}: ${exc.value ?? ''}`)
      if (exc.stacktrace?.frames) {
        for (const frame of exc.stacktrace.frames.slice(-10)) {
          lines.push(`  at ${frame.function ?? '?'} (${frame.filename ?? '?'}:${frame.lineNo ?? '?'})`)
        }
      }
    }
    if (lines.length) return lines.join('\n')
  }
  return ''
}

async function findTrackedSentryIds(linear: LinearClient, teamId: string): Promise<Set<string>> {
  const issues = await linear.issues({
    filter: {
      team: { id: { eq: teamId } },
      labels: { name: { eq: 'sentry-auto' } },
    },
    first: 100,
  })
  const ids = new Set<string>()
  for (const issue of issues.nodes) {
    const match = issue.description?.match(/\[sentry:(\d+)\]/)
    if (match) ids.add(match[1])
  }
  return ids
}

async function getOrCreateLabel(linear: LinearClient, teamId: string): Promise<string> {
  const labels = await linear.issueLabels({
    filter: { name: { eq: 'sentry-auto' }, team: { id: { eq: teamId } } },
  })
  if (labels.nodes.length > 0) return labels.nodes[0].id

  const result = await linear.createIssueLabel({ name: 'sentry-auto', teamId })
  const label = await result.issueLabel
  if (!label) throw new Error('Failed to create sentry-auto label')
  return label.id
}

async function resolveTeamId(linear: LinearClient): Promise<string> {
  const teams = await linear.teams({ filter: { key: { eq: config.teamKey } } })
  const teamId = teams.nodes[0]?.id
  if (!teamId) throw new Error(`Team ${config.teamKey} not found`)
  return teamId
}

export async function pollSentry(): Promise<void> {
  if (!config.sentryAuthToken || !config.sentryOrg || !config.sentryProject) return

  log.info('sentry poll start')

  const issues = await fetchUnresolvedIssues()
  if (issues.length === 0) {
    log.info('no unresolved sentry issues')
    return
  }

  const linear = new LinearClient({ apiKey: config.linearApiKey })
  const teamId = await resolveTeamId(linear)
  const tracked = await findTrackedSentryIds(linear, teamId)
  const newIssues = issues.filter((i) => !tracked.has(i.id))

  if (newIssues.length === 0) {
    log.info({ total: issues.length }, 'all sentry issues already tracked')
    return
  }

  const labelId = await getOrCreateLabel(linear, teamId)

  for (const issue of newIssues) {
    const event = await fetchLatestEvent(issue.id)
    const stackTrace = formatStackTrace(event)

    const description = [
      `**Sentry Issue:** [${issue.shortId}](${issue.permalink})`,
      `**First seen:** ${issue.firstSeen}`,
      `**Last seen:** ${issue.lastSeen}`,
      `**Events:** ${issue.count}`,
      '',
      stackTrace ? `\`\`\`\n${stackTrace}\n\`\`\`` : '',
      '',
      SENTRY_MARKER(issue.id),
    ]
      .filter(Boolean)
      .join('\n')

    const created = await linear.createIssue({
      teamId,
      title: issue.title,
      description,
      priority: 2,
      labelIds: [labelId],
    })

    const linearIssue = await created.issue
    log.info(
      { sentryIssueId: issue.id, linearIssueId: linearIssue?.id, linearIdentifier: linearIssue?.identifier },
      'sentry issue created',
    )
  }
}
