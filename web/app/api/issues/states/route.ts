import { NextResponse } from "next/server";
import { linearFetch } from "../../linear-fetch";
import { readStatesCache, writeStatesCache } from "./cache";

export interface WorkflowState {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
}

const QUERY = `
query($teamKey: String!) {
  teams(filter: { key: { eq: $teamKey } }) {
    nodes {
      states {
        nodes { id name type color position }
      }
    }
  }
}`;

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  const cached = readStatesCache();
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({ states: cached.states });
  }

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY not set" },
      { status: 500 },
    );
  }

  const teamKey = process.env.LINEAR_TEAM_KEY || "ENG";

  try {
    const res = await linearFetch(apiKey, {
      query: QUERY,
      variables: { teamKey },
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
    const team = data.data?.teams?.nodes?.[0];
    if (!team) {
      return NextResponse.json(
        { error: "Team not found" },
        { status: 404 },
      );
    }
    const states: WorkflowState[] = (team.states.nodes as WorkflowState[])
      .slice()
      .sort((a: WorkflowState, b: WorkflowState) => a.position - b.position);

    writeStatesCache(states, Date.now() + CACHE_TTL_MS);

    return NextResponse.json({ states });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach Linear API" },
      { status: 502 },
    );
  }
}
