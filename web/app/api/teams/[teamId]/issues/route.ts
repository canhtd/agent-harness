import { NextResponse } from "next/server";

export interface TeamIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  createdAt: string;
  state: { name: string; type: string; color: string };
  assignee: { id: string; displayName: string; avatarUrl: string | null } | null;
}

const QUERY = `
query($teamId: String!) {
  team(id: $teamId) {
    issues(first: 200, orderBy: updatedAt) {
      nodes {
        id identifier title priority url createdAt
        state { name type color }
        assignee { id displayName avatarUrl }
      }
    }
  }
}`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY not set" },
      { status: 500 },
    );
  }

  let data: {
    data?: {
      team: {
        issues: {
          nodes: Array<{
            id: string;
            identifier: string;
            title: string;
            priority: number;
            url: string;
            createdAt: string;
            state: { name: string; type: string; color: string };
            assignee: { id: string; displayName: string; avatarUrl: string | null } | null;
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
      body: JSON.stringify({ query: QUERY, variables: { teamId } }),
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

  if (!data.data?.team) {
    return NextResponse.json(
      { error: "Team not found" },
      { status: 404 },
    );
  }

  const issues: TeamIssue[] = data.data.team.issues.nodes.map((n) => ({
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    priority: n.priority,
    url: n.url,
    createdAt: n.createdAt,
    state: n.state,
    assignee: n.assignee,
  }));

  return NextResponse.json({ issues });
}
