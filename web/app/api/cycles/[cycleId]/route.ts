import { NextResponse } from "next/server";

export interface CycleIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  state: {
    name: string;
    type: string;
    color: string;
  };
  assignee: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export interface CycleDetail {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  progress: number;
  completedScopeCount: number;
  totalScope: number;
  team: {
    id: string;
    name: string;
    key: string;
  };
  issues: CycleIssue[];
}

const QUERY = `
query($cycleId: String!) {
  cycle(id: $cycleId) {
    id name number startsAt endsAt
    progress
    completedScopeCount
    scopeCount
    team {
      id name key
    }
    issues(first: 200) {
      nodes {
        id identifier title priority
        state { name type color }
        assignee { id displayName avatarUrl }
      }
    }
  }
}`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await params;

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY not set" },
      { status: 500 },
    );
  }

  let data: {
    data?: {
      cycle: {
        id: string;
        name: string | null;
        number: number;
        startsAt: string;
        endsAt: string;
        progress: number;
        completedScopeCount: number;
        scopeCount: number;
        team: {
          id: string;
          name: string;
          key: string;
        };
        issues: {
          nodes: Array<{
            id: string;
            identifier: string;
            title: string;
            priority: number;
            state: { name: string; type: string; color: string };
            assignee: {
              id: string;
              displayName: string;
              avatarUrl: string | null;
            } | null;
          }>;
        };
      } | null;
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
      body: JSON.stringify({ query: QUERY, variables: { cycleId } }),
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

  const node = data.data?.cycle;
  if (!node) {
    return NextResponse.json(
      { error: "Cycle not found" },
      { status: 404 },
    );
  }

  const cycle: CycleDetail = {
    id: node.id,
    name: node.name,
    number: node.number,
    startsAt: node.startsAt,
    endsAt: node.endsAt,
    progress: node.progress,
    completedScopeCount: node.completedScopeCount,
    totalScope: node.scopeCount,
    team: node.team,
    issues: node.issues.nodes.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      priority: issue.priority,
      state: issue.state,
      assignee: issue.assignee,
    })),
  };

  return NextResponse.json({ cycle });
}
