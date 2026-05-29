import { NextResponse } from "next/server";

export interface TeamMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

export interface TeamDetail {
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  timezone: string | null;
  members: TeamMember[];
}

const QUERY = `
query($teamId: String!) {
  team(id: $teamId) {
    id name key description color icon timezone
    members {
      nodes { id displayName avatarUrl email }
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
        id: string;
        name: string;
        key: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        timezone: string | null;
        members: {
          nodes: Array<{
            id: string;
            displayName: string;
            avatarUrl: string | null;
            email: string | null;
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

  const node = data.data?.team;
  if (!node) {
    return NextResponse.json(
      { error: "Team not found" },
      { status: 404 },
    );
  }

  const team: TeamDetail = {
    id: node.id,
    name: node.name,
    key: node.key,
    description: node.description,
    color: node.color,
    icon: node.icon,
    timezone: node.timezone,
    members: node.members.nodes.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      email: m.email,
    })),
  };

  return NextResponse.json({ team });
}
