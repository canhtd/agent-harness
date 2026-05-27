import { NextResponse } from "next/server";

export interface IssueCard {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  status: string;
  column: "todo" | "working" | "done" | "cancel";
  createdAt: string;
}

const COLUMN_MAP: Record<string, IssueCard["column"]> = {
  unstarted: "todo",
  started: "working",
  completed: "done",
  canceled: "cancel",
};

const QUERY = `
query($teamKey: String!) {
  issues(
    filter: { team: { key: { eq: $teamKey } }, state: { type: { nin: ["backlog", "triage"] } } }
    first: 200
    orderBy: updatedAt
  ) {
    nodes {
      id
      identifier
      title
      priority
      url
      createdAt
      state { name type }
    }
  }
}`;

export async function GET() {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY not set" },
      { status: 500 },
    );
  }

  const teamKey = process.env.LINEAR_TEAM_KEY || "ENG";

  let data: {
    data?: {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          priority: number;
          url: string;
          createdAt: string;
          state: { name: string; type: string };
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
      body: JSON.stringify({ query: QUERY, variables: { teamKey } }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Linear API returned ${res.status}`, issues: [] },
        { status: 502 },
      );
    }
    data = await res.json();
  } catch (err) {
    console.error("Linear API fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to reach Linear API", issues: [] },
      { status: 502 },
    );
  }

  if (data.errors?.length) {
    return NextResponse.json(
      { error: data.errors[0]?.message ?? "Unknown GraphQL error", issues: [] },
      { status: 502 },
    );
  }

  const nodes = data.data?.issues.nodes ?? [];
  const issues: IssueCard[] = nodes.map((node) => ({
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    priority: node.priority,
    url: node.url,
    status: node.state.name,
    column: COLUMN_MAP[node.state.type] ?? "todo",
    createdAt: node.createdAt,
  }));

  return NextResponse.json({ issues });
}
