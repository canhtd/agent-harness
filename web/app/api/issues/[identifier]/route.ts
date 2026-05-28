import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AgentMeta {
  totalCost: number;
  attempt: number;
  turn: number;
  alive: boolean;
  lastStatus: string;
  durationSeconds: number;
  prSearchUrl: string;
}

export interface IssueDetail {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  url: string;
  createdAt: string;
  updatedAt: string;
  state: { id: string; name: string; type: string; color: string };
  labels: Array<{ id: string; name: string; color: string }>;
  assignee: { id: string; displayName: string; avatarUrl: string } | null;
  agentMeta?: AgentMeta;
}

export function parseIdentifier(identifier: string): { teamKey: string; number: number } | null {
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) return null;
  return { teamKey: match[1], number: parseInt(match[2], 10) };
}

const QUERY = `
query($teamKey: String!, $number: Float!) {
  issues(filter: { number: { eq: $number }, team: { key: { eq: $teamKey } } }, first: 1) {
    nodes {
      id identifier title description priority url
      createdAt updatedAt
      state { id name type color }
      labels { nodes { id name color } }
      assignee { id displayName avatarUrl }
    }
  }
}`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ identifier: string }> },
) {
  const { identifier } = await params;

  const parsed = parseIdentifier(identifier);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid identifier format (expected TEAM-123)" },
      { status: 400 },
    );
  }

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY not set" },
      { status: 500 },
    );
  }

  let data: {
    data?: {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          description: string | null;
          priority: number;
          url: string;
          createdAt: string;
          updatedAt: string;
          state: { id: string; name: string; type: string; color: string };
          labels: { nodes: Array<{ id: string; name: string; color: string }> };
          assignee: {
            id: string;
            displayName: string;
            avatarUrl: string;
          } | null;
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          teamKey: parsed.teamKey,
          number: parsed.number,
        },
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Linear API returned ${res.status}` },
        { status: 502 },
      );
    }
    data = await res.json();
  } catch (err) {
    console.error("Linear API fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to reach Linear API" },
      { status: 502 },
    );
  }

  if (data.errors?.length) {
    return NextResponse.json(
      { error: data.errors[0]?.message ?? "Unknown GraphQL error" },
      { status: 502 },
    );
  }

  const node = data.data?.issues.nodes[0];
  if (!node) {
    return NextResponse.json(
      { error: "Issue not found" },
      { status: 404 },
    );
  }

  const agentMeta = await gatherAgentMeta(node.id, node.identifier);

  const issue: IssueDetail = {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    priority: node.priority,
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    state: node.state,
    labels: node.labels.nodes,
    assignee: node.assignee,
    agentMeta,
  };

  return NextResponse.json({ issue });
}

function isAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function gatherAgentMeta(
  issueId: string,
  identifier: string,
): Promise<AgentMeta | undefined> {
  const tokensPath =
    process.env.TOKENS_LOG_PATH ||
    join(homedir(), ".agent-harness", "logs", "tokens.jsonl");
  const locksDir =
    process.env.LOCKS_DIR ||
    join(homedir(), ".agent-harness", "locks");
  const repo = process.env.GITHUB_REPO || "canhtd/agent-harness";

  let totalCost = 0;
  let lastStatus = "";
  let durationSeconds = 0;
  let hasTokens = false;

  try {
    const content = await readFile(tokensPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as {
          identifier?: string;
          status?: string;
          duration_seconds?: number;
          estimated_cost_usd?: number;
        };
        if (rec.identifier !== identifier) continue;
        hasTokens = true;
        totalCost += rec.estimated_cost_usd ?? 0;
        if (rec.status) lastStatus = rec.status;
        if (rec.duration_seconds != null) durationSeconds = rec.duration_seconds;
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // tokens file doesn't exist
  }

  let attempt = 0;
  let turn = 0;
  let alive = false;
  let hasLock = false;

  try {
    const raw = await readFile(join(locksDir, `${issueId}.json`), "utf-8");
    const lock = JSON.parse(raw) as {
      pid: number;
      attempt: number;
      turn?: number;
    };
    hasLock = true;
    attempt = lock.attempt;
    turn = lock.turn ?? 0;
    alive = isAlive(lock.pid);
  } catch {
    // lockfile doesn't exist
  }

  if (!hasTokens && !hasLock) return undefined;

  if (!alive && lastStatus === "running") lastStatus = "failed";
  if (alive && !lastStatus) lastStatus = "running";
  if (!lastStatus) lastStatus = "unknown";

  const prSearchUrl = `https://github.com/${repo}/pulls?q=is:pr+${identifier}`;

  return {
    totalCost,
    attempt,
    turn,
    alive,
    lastStatus,
    durationSeconds,
    prSearchUrl,
  };
}

const UPDATE_MUTATION = `
mutation($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id identifier title description priority
      url createdAt updatedAt
      state { id name type color }
      labels { nodes { id name color } }
      assignee { id displayName avatarUrl }
    }
  }
}`;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ identifier: string }> },
) {
  const { identifier } = await params;

  const parsed = parseIdentifier(identifier);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid identifier format (expected TEAM-123)" },
      { status: 400 },
    );
  }

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY not set" },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const jsonBody = await request.json();
    if (typeof jsonBody !== "object" || jsonBody === null || Array.isArray(jsonBody)) {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    body = jsonBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string") {
      return NextResponse.json({ error: "title must be a string" }, { status: 400 });
    }
    input.title = body.title;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      return NextResponse.json({ error: "description must be a string" }, { status: 400 });
    }
    input.description = body.description;
  }
  if (body.priority !== undefined) {
    if (typeof body.priority !== "number" || !Number.isInteger(body.priority) || body.priority < 0 || body.priority > 4) {
      return NextResponse.json({ error: "priority must be an integer 0-4" }, { status: 400 });
    }
    input.priority = body.priority;
  }
  if (body.stateId !== undefined) {
    if (typeof body.stateId !== "string") {
      return NextResponse.json({ error: "stateId must be a string" }, { status: 400 });
    }
    input.stateId = body.stateId;
  }

  if (Object.keys(input).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  // Resolve issue ID from identifier
  let issueId: string;
  try {
    const lookupRes = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { teamKey: parsed.teamKey, number: parsed.number },
      }),
    });
    if (!lookupRes.ok) {
      return NextResponse.json(
        { error: `Linear API returned ${lookupRes.status}` },
        { status: 502 },
      );
    }
    const lookupData = await lookupRes.json();
    const node = lookupData.data?.issues?.nodes?.[0];
    if (!node) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }
    issueId = node.id;
  } catch {
    return NextResponse.json(
      { error: "Failed to reach Linear API" },
      { status: 502 },
    );
  }

  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: UPDATE_MUTATION,
        variables: { id: issueId, input },
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Linear API returned ${res.status}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    if (data.errors?.length) {
      return NextResponse.json(
        { error: data.errors[0]?.message ?? "Unknown GraphQL error" },
        { status: 502 },
      );
    }
    const result = data.data?.issueUpdate;
    if (!result?.success) {
      return NextResponse.json(
        { error: "Update failed" },
        { status: 502 },
      );
    }
    const n = result.issue;
    const issue: IssueDetail = {
      id: n.id,
      identifier: n.identifier,
      title: n.title,
      description: n.description,
      priority: n.priority,
      url: n.url,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      state: n.state,
      labels: n.labels.nodes,
      assignee: n.assignee,
    };
    return NextResponse.json({ issue });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach Linear API" },
      { status: 502 },
    );
  }
}
