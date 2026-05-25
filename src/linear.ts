import { LinearClient, Issue } from '@linear/sdk'
import { config, log } from './config.js'

export interface IssueInfo {
  id: string
  identifier: string
  title: string
  description?: string | null
  priority?: number
  labels: string[]
}

const TERMINAL_STATES = new Set(['Done', 'Canceled', 'Cancelled', 'Duplicate'])

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

export async function fetchIssueState(issueId: string): Promise<{ stateName: string; terminal: boolean } | null> {
  const linear = createClient()
  try {
    const issue = await linear.issue(issueId)
    const state = await issue.state
    if (!state) return null
    return { stateName: state.name, terminal: TERMINAL_STATES.has(state.name) }
  } catch {
    return null
  }
}

export async function fetchIssueStateByIdentifier(identifier: string): Promise<{ id: string; stateName: string; terminal: boolean } | null> {
  const match = identifier.match(/^([A-Za-z]+)-(\d+)$/)
  if (!match) return null
  const [, teamKey, numStr] = match
  const linear = createClient()
  try {
    const result = await linear.issues({
      filter: {
        team: { key: { eq: teamKey } },
        number: { eq: parseInt(numStr, 10) },
      },
      first: 1,
    })
    const issue = result.nodes[0]
    if (!issue) return null
    const state = await issue.state
    if (!state) return null
    return { id: issue.id, stateName: state.name, terminal: TERMINAL_STATES.has(state.name) }
  } catch {
    return null
  }
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
    const labelNodes = await issue.labels()
    candidates.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      labels: labelNodes.nodes.map((l) => l.name),
    })
  }

  return candidates
}

export async function fetchInProgressIssues(): Promise<IssueInfo[]> {
  const linear = createClient()
  const filter: Record<string, unknown> = {
    team: { key: { eq: config.teamKey } },
    state: { name: { in: ['In Progress'] } },
  }
  if (config.projectSlug) {
    filter.project = { slugId: { eq: config.projectSlug } }
  }
  const result = await linear.issues({ filter, first: 50 })
  const issues: IssueInfo[] = []
  for (const issue of result.nodes) {
    const labelNodes = await issue.labels()
    issues.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      labels: labelNodes.nodes.map((l) => l.name),
    })
  }
  return issues
}

export async function transitionToDone(issueId: string): Promise<void> {
  const linear = createClient()
  const teams = await linear.teams({ filter: { key: { eq: config.teamKey } }, first: 1 })
  const team = teams.nodes[0]
  if (!team) return
  const states = await team.states()
  const doneState = states.nodes.find((s) => s.name === 'Done')
  if (!doneState) return
  await linear.updateIssue(issueId, { stateId: doneState.id })
}
