import { NextResponse } from "next/server";

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
}

const QUERY = `
query($filter: IssueFilter!) {
  issues(filter: $filter, first: 1) {
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
          filter: { identifier: { eq: identifier } },
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
  };

  return NextResponse.json({ issue });
}
