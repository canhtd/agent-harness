import { NextResponse } from "next/server";

export interface TeamMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface TeamCard {
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  memberCount: number;
  members: TeamMember[];
}

const QUERY = `
query {
  teams(first: 50, orderBy: updatedAt) {
    nodes {
      id name key description color icon
      members(first: 5) {
        nodes { id displayName avatarUrl }
      }
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

  let data: {
    data?: {
      teams: {
        nodes: Array<{
          id: string;
          name: string;
          key: string;
          description: string | null;
          color: string | null;
          icon: string | null;
          members: {
            nodes: Array<{
              id: string;
              displayName: string;
              avatarUrl: string | null;
            }>;
          };
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
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Linear API returned ${res.status}`, teams: [] },
        { status: 502 },
      );
    }
    data = await res.json();
  } catch (err) {
    console.error("Linear API fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to reach Linear API", teams: [] },
      { status: 502 },
    );
  }

  if (data.errors?.length) {
    return NextResponse.json(
      { error: data.errors[0]?.message ?? "Unknown GraphQL error", teams: [] },
      { status: 502 },
    );
  }

  const nodes = data.data?.teams.nodes ?? [];
  const teams: TeamCard[] = nodes.map((node) => ({
    id: node.id,
    name: node.name,
    key: node.key,
    description: node.description,
    color: node.color,
    icon: node.icon,
    memberCount: node.members.nodes.length,
    members: node.members.nodes.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
    })),
  }));

  return NextResponse.json({ teams });
}
