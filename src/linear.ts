import { LinearClient, Issue } from '@linear/sdk'
import { config, log } from './config.js'

export interface IssueInfo {
  id: string
  identifier: string
  title: string
  description?: string | null
}

const TERMINAL_STATES = new Set(['Done', 'Canceled', 'Duplicate'])

function createClient(): LinearClient {
  return new LinearClient({ apiKey: config.linearApiKey })
}

async function isBlocked(issue: Issue): Promise<string[]> {
  const inverseRelations = await issue.inverseRelations()
  const blockerIds: string[] = []

  for (const rel of inverseRelations.nodes) {
    if (rel.type !== 'blocks') continue
    const blocker = await rel.issue
    if (!blocker) continue
    const state = await blocker.state
    if (!state || !TERMINAL_STATES.has(state.name)) {
      blockerIds.push(blocker.identifier)
    }
  }

  return blockerIds
}

export async function fetchCandidates(): Promise<IssueInfo[]> {
  const linear = createClient()
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

  const candidates: IssueInfo[] = []
  for (const issue of sorted) {
    const blockers = await isBlocked(issue)
    if (blockers.length > 0) {
      log.info(
        { issueId: issue.id, issueIdentifier: issue.identifier, blockers },
        'issue blocked',
      )
      continue
    }
    candidates.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
    })
  }

  return candidates
}
