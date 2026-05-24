import { LinearClient } from '@linear/sdk'
import { config } from './config.js'

export interface IssueInfo {
  id: string
  identifier: string
  title: string
  description?: string | null
}

export async function fetchCandidates(): Promise<IssueInfo[]> {
  const linear = new LinearClient({ apiKey: config.linearApiKey })
  const filter: Record<string, unknown> = {
    team: { key: { eq: config.teamKey } },
    state: { name: { in: ['Todo'] } },
  }
  if (config.projectSlug) {
    filter.project = { slugId: { eq: config.projectSlug } }
  }
  const result = await linear.issues({ filter, first: 50 })

  const pri = (p?: number) => (p ? p : 99)
  const time = (d?: Date) => d?.getTime() ?? Infinity
  const sorted = [...result.nodes].sort((a, b) => {
    if (pri(a.priority) !== pri(b.priority)) return pri(a.priority) - pri(b.priority)
    if (time(a.createdAt) !== time(b.createdAt)) return time(a.createdAt) - time(b.createdAt)
    return a.identifier.localeCompare(b.identifier)
  })

  return sorted.map((issue) => ({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
  }))
}
