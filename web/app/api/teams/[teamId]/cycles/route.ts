import { NextResponse } from "next/server";

export interface TeamCycle {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  progress: number;
  completedScopeCount: number;
  scopeCount: number;
}

const QUERY = `
query($teamId: String!) {
  team(id: $teamId) {
    cycles(orderBy: startsAt) {
      nodes {
        id name number startsAt endsAt
        progress
        completedScopeCount
        scopeCount
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
        cycles: {
          nodes: Array<{
            id: string;
            name: string | null;
            number: number;
            startsAt: string;
            endsAt: string;
            progress: number;
            completedScopeCount: number;
            scopeCount: number;
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

  const nodes = data.data.team.cycles.nodes;
  const cycles: TeamCycle[] = nodes
    .map((n) => ({
      id: n.id,
      name: n.name,
      number: n.number,
      startsAt: n.startsAt,
      endsAt: n.endsAt,
      progress: n.progress,
      completedScopeCount: n.completedScopeCount,
      scopeCount: n.scopeCount,
    }))
    .reverse();

  return NextResponse.json({ cycles });
}
