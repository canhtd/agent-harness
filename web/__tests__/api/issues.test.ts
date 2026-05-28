import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "@/app/api/issues/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const ISSUE_NODE = {
  id: "id-1",
  identifier: "ENG-55",
  title: "Test issue",
  priority: 2,
  url: "https://linear.app/team/ENG-55",
  createdAt: "2025-01-01T00:00:00Z",
  state: { name: "In Progress", type: "started" },
};

describe("GET /api/issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_KEY = "ENG";
  });

  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_TEAM_KEY;
  });

  it("sends correct GraphQL query with teamKey variable", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [ISSUE_NODE] } } }),
    });

    await GET();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.linear.app/graphql");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("test-key");

    const body = JSON.parse(opts.body);
    expect(body.variables).toEqual({ teamKey: "ENG" });
    expect(body.query).toContain("team: { key: { eq: $teamKey } }");
    expect(body.query).toContain('nin: ["backlog", "triage"]');
  });

  it("maps nodes to IssueCard[] with correct column mapping", async () => {
    const nodes = [
      { ...ISSUE_NODE, state: { name: "Todo", type: "unstarted" } },
      { ...ISSUE_NODE, id: "id-2", state: { name: "In Progress", type: "started" } },
      { ...ISSUE_NODE, id: "id-3", state: { name: "Done", type: "completed" } },
      { ...ISSUE_NODE, id: "id-4", state: { name: "Cancelled", type: "canceled" } },
      { ...ISSUE_NODE, id: "id-5", state: { name: "Custom", type: "custom" } },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issues: { nodes } } }),
    });

    const res = await GET();
    const data = await res.json();

    expect(data.issues).toHaveLength(5);
    expect(data.issues[0].column).toBe("todo");
    expect(data.issues[1].column).toBe("working");
    expect(data.issues[2].column).toBe("done");
    expect(data.issues[3].column).toBe("cancel");
    expect(data.issues[4].column).toBe("todo");
  });

  it("returns 500 when LINEAR_API_KEY not set", async () => {
    delete process.env.LINEAR_API_KEY;

    const res = await GET();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("LINEAR_API_KEY not set");
  });

  it("returns 502 when Linear returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await GET();
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("500");
  });

  it("returns 502 when Linear returns GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: "Bad query" }] }),
    });

    const res = await GET();
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("Bad query");
  });

  it("returns 502 when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const res = await GET();
    expect(res.status).toBe(502);
  });
});

describe("POST /api/issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_KEY = "ENG";
  });

  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_TEAM_KEY;
  });

  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("sends create mutation with correct input", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { teams: { nodes: [{ id: "team-1" }] } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issueCreate: {
              success: true,
              issue: ISSUE_NODE,
            },
          },
        }),
      });

    const res = await POST(makeRequest({ title: "New issue", description: "desc", priority: 1 }));
    expect(res.status).toBe(201);

    const createCall = mockFetch.mock.calls[1];
    const body = JSON.parse(createCall[1].body);
    expect(body.query).toContain("issueCreate");
    expect(body.variables.input.title).toBe("New issue");
    expect(body.variables.input.description).toBe("desc");
    expect(body.variables.input.priority).toBe(1);
    expect(body.variables.input.teamId).toBe("team-1");
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makeRequest({ description: "no title" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("title");
  });

  it("returns 400 when title is empty string", async () => {
    const res = await POST(makeRequest({ title: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when LINEAR_API_KEY not set", async () => {
    delete process.env.LINEAR_API_KEY;
    const res = await POST(makeRequest({ title: "test" }));
    expect(res.status).toBe(500);
  });

  it("defaults priority to 3", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { teams: { nodes: [{ id: "team-1" }] } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { issueCreate: { success: true, issue: ISSUE_NODE } },
        }),
      });

    await POST(makeRequest({ title: "Test" }));

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.variables.input.priority).toBe(3);
  });

  it("returns 502 when team not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { teams: { nodes: [] } } }),
    });

    const res = await POST(makeRequest({ title: "test" }));
    expect(res.status).toBe(502);
  });
});
