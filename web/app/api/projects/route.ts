import { NextResponse } from "next/server";

export interface ProjectCard {
  id: string;
  name: string;
  state: string;
  progress: number;
  startDate: string | null;
  targetDate: string | null;
  lead: { id: string; displayName: string; avatarUrl: string | null } | null;
  color: string | null;
  icon: string | null;
}

const QUERY = `
query {
  projects(first: 50, orderBy: updatedAt) {
    nodes {
      id name description icon color state
      startDate targetDate progress
      lead { id displayName avatarUrl }
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
      projects: {
        nodes: Array<{
          id: string;
          name: string;
          description: string | null;
          icon: string | null;
          color: string | null;
          state: string;
          startDate: string | null;
          targetDate: string | null;
          progress: number;
          lead: { id: string; displayName: string; avatarUrl: string | null } | null;
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
        { error: `Linear API returned ${res.status}`, projects: [] },
        { status: 502 },
      );
    }
    data = await res.json();
  } catch (err) {
    console.error("Linear API fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to reach Linear API", projects: [] },
      { status: 502 },
    );
  }

  if (data.errors?.length) {
    return NextResponse.json(
      { error: data.errors[0]?.message ?? "Unknown GraphQL error", projects: [] },
      { status: 502 },
    );
  }

  const nodes = data.data?.projects.nodes ?? [];
  const projects: ProjectCard[] = nodes.map((node) => ({
    id: node.id,
    name: node.name,
    state: node.state,
    progress: node.progress,
    startDate: node.startDate,
    targetDate: node.targetDate,
    lead: node.lead,
    color: node.color,
    icon: node.icon,
  }));

  return NextResponse.json({ projects });
}
