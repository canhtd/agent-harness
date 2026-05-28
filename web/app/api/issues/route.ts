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

const TEAM_QUERY = `
query($teamKey: String!) {
  teams(filter: { key: { eq: $teamKey } }) {
    nodes { id }
  }
}`;

const CREATE_MUTATION = `
mutation($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id identifier title priority url createdAt
      state { name type }
    }
  }
}`;

export async function POST(request: Request) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY not set" },
      { status: 500 },
    );
  }

  let body: { title?: string; description?: string; priority?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const teamKey = process.env.LINEAR_TEAM_KEY || "ENG";
  const headers = {
    "Content-Type": "application/json",
    Authorization: apiKey,
  };

  let teamId: string;
  try {
    const teamRes = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: TEAM_QUERY, variables: { teamKey } }),
    });
    if (!teamRes.ok) {
      return NextResponse.json(
        { error: `Linear API returned ${teamRes.status}` },
        { status: 502 },
      );
    }
    const teamData = await teamRes.json();
    const teamNode = teamData.data?.teams?.nodes?.[0];
    if (!teamNode) {
      return NextResponse.json(
        { error: `Team "${teamKey}" not found` },
        { status: 502 },
      );
    }
    teamId = teamNode.id;
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch team from Linear" },
      { status: 502 },
    );
  }

  const input: { teamId: string; title: string; description?: string; priority: number } = {
    teamId,
    title: body.title.trim(),
    priority: body.priority ?? 3,
  };
  if (body.description) {
    input.description = body.description;
  }

  try {
    const createRes = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: CREATE_MUTATION, variables: { input } }),
    });
    if (!createRes.ok) {
      return NextResponse.json(
        { error: `Linear API returned ${createRes.status}` },
        { status: 502 },
      );
    }
    const createData = await createRes.json();

    if (createData.errors?.length) {
      return NextResponse.json(
        { error: createData.errors[0]?.message ?? "GraphQL error" },
        { status: 502 },
      );
    }

    const result = createData.data?.issueCreate;
    if (!result?.success || !result.issue) {
      return NextResponse.json(
        { error: "Issue creation failed" },
        { status: 502 },
      );
    }

    const node = result.issue;
    const issue: IssueCard = {
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      priority: node.priority,
      url: node.url,
      status: node.state.name,
      column: COLUMN_MAP[node.state.type] ?? "todo",
      createdAt: node.createdAt,
    };

    return NextResponse.json({ issue }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create issue on Linear" },
      { status: 502 },
    );
  }
}

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
