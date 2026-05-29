import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
}));

vi.mock("node:os", () => ({
  homedir: () => "/mock-home",
}));

import { GET, PATCH } from "@/app/api/issues/[identifier]/route";
import { parseIdentifier } from "@/app/api/issues/[identifier]/parse-identifier";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const ISSUE_NODE = {
  id: "issue-1",
  identifier: "ENG-55",
  title: "Test issue",
  description: "A test issue",
  priority: 2,
  url: "https://linear.app/team/ENG-55",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-02T00:00:00Z",
  state: { id: "state-1", name: "In Progress", type: "started", color: "#0000ff" },
  labels: { nodes: [{ id: "label-1", name: "bug", color: "#ff0000" }] },
  assignee: { id: "user-1", displayName: "Test User", avatarUrl: "https://example.com/avatar.jpg" },
};

describe("parseIdentifier", () => {
  it('parses "ENG-55" correctly', () => {
    expect(parseIdentifier("ENG-55")).toEqual({ teamKey: "ENG", number: 55 });
  });

  it('parses "TEAM-1" correctly', () => {
    expect(parseIdentifier("TEAM-1")).toEqual({ teamKey: "TEAM", number: 1 });
  });

  it("returns null for invalid formats", () => {
    expect(parseIdentifier("invalid")).toBeNull();
    expect(parseIdentifier("eng-55")).toBeNull();
    expect(parseIdentifier("ENG-")).toBeNull();
    expect(parseIdentifier("")).toBeNull();
    expect(parseIdentifier("ENG55")).toBeNull();
  });
});

function makeParams(identifier: string) {
  return { params: Promise.resolve({ identifier }) };
}

describe("GET /api/issues/[identifier]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINEAR_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.TOKENS_LOG_PATH;
    delete process.env.LOCKS_DIR;
    delete process.env.GITHUB_REPO;
  });

  it("uses number + team.key filter, NOT identifier", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [ISSUE_NODE] } } }),
    });

    await GET(new Request("http://localhost/api/issues/ENG-55"), makeParams("ENG-55"));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.variables).toHaveProperty("teamKey", "ENG");
    expect(body.variables).toHaveProperty("number", 55);
    expect(body.variables).not.toHaveProperty("identifier");
    expect(body.query).toContain("number: { eq: $number }");
    expect(body.query).toContain("team: { key: { eq: $teamKey } }");
    expect(body.query).not.toContain("identifier: {");
  });

  it("returns issue detail with correct shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [ISSUE_NODE] } } }),
    });

    const res = await GET(new Request("http://localhost/api/issues/ENG-55"), makeParams("ENG-55"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.issue.id).toBe("issue-1");
    expect(data.issue.identifier).toBe("ENG-55");
    expect(data.issue.labels).toEqual([{ id: "label-1", name: "bug", color: "#ff0000" }]);
    expect(data.issue.state.id).toBe("state-1");
  });

  it("returns 400 for invalid identifier", async () => {
    const res = await GET(new Request("http://localhost/api/issues/invalid"), makeParams("invalid"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid identifier");
  });

  it("returns 500 when LINEAR_API_KEY not set", async () => {
    delete process.env.LINEAR_API_KEY;

    const res = await GET(new Request("http://localhost/api/issues/ENG-55"), makeParams("ENG-55"));
    expect(res.status).toBe(500);
  });

  it("returns 404 when issue not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [] } } }),
    });

    const res = await GET(new Request("http://localhost/api/issues/ENG-99"), makeParams("ENG-99"));
    expect(res.status).toBe(404);
  });

  it("returns 502 when Linear returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await GET(new Request("http://localhost/api/issues/ENG-55"), makeParams("ENG-55"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when Linear returns GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: "Syntax error" }] }),
    });

    const res = await GET(new Request("http://localhost/api/issues/ENG-55"), makeParams("ENG-55"));
    expect(res.status).toBe(502);
  });
});

describe("PATCH /api/issues/[identifier]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINEAR_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
  });

  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/issues/ENG-55", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const UPDATED_NODE = {
    ...ISSUE_NODE,
    title: "Updated title",
  };

  it("sends update mutation with correct fields", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { issues: { nodes: [ISSUE_NODE] } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { issueUpdate: { success: true, issue: UPDATED_NODE } },
        }),
      });

    const res = await PATCH(
      makeRequest({ title: "Updated title", priority: 1, description: "new desc", stateId: "state-2" }),
      makeParams("ENG-55"),
    );
    expect(res.status).toBe(200);

    const updateBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(updateBody.query).toContain("issueUpdate");
    expect(updateBody.variables.input).toEqual({
      title: "Updated title",
      priority: 1,
      description: "new desc",
      stateId: "state-2",
    });
  });

  it("skips lookup when issueId is provided in body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { issueUpdate: { success: true, issue: UPDATED_NODE } },
      }),
    });

    const res = await PATCH(
      makeRequest({ title: "Updated title", issueId: "issue-1" }),
      makeParams("ENG-55"),
    );
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.query).toContain("issueUpdate");
    expect(body.variables.id).toBe("issue-1");
    expect(body.variables.input).toEqual({ title: "Updated title" });
  });

  it("returns 400 for invalid identifier", async () => {
    const res = await PATCH(makeRequest({ title: "x" }), makeParams("bad"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is not a string", async () => {
    const res = await PATCH(makeRequest({ title: 123 }), makeParams("ENG-55"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("title must be a string");
  });

  it("returns 400 when priority is out of range", async () => {
    const res = await PATCH(makeRequest({ priority: 5 }), makeParams("ENG-55"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("priority must be an integer 0-4");
  });

  it("returns 400 when priority is not integer", async () => {
    const res = await PATCH(makeRequest({ priority: 1.5 }), makeParams("ENG-55"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no valid fields provided", async () => {
    const res = await PATCH(makeRequest({ unknown: "value" }), makeParams("ENG-55"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No valid fields");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/issues/ENG-55", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, makeParams("ENG-55"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when issue not found for update", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [] } } }),
    });

    const res = await PATCH(makeRequest({ title: "x" }), makeParams("ENG-55"));
    expect(res.status).toBe(404);
  });
});
