import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/issues/states/route";
import { _resetStatesCache } from "@/app/api/issues/states/cache";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const STATE_NODES = [
  { id: "s3", name: "Done", type: "completed", color: "#00ff00", position: 3 },
  { id: "s1", name: "Backlog", type: "backlog", color: "#cccccc", position: 1 },
  { id: "s2", name: "In Progress", type: "started", color: "#0000ff", position: 2 },
];

describe("GET /api/issues/states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetStatesCache();
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_KEY = "ENG";
  });

  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_TEAM_KEY;
  });

  it("queries states with team key filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { teams: { nodes: [{ states: { nodes: STATE_NODES } }] } },
      }),
    });

    await GET();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.variables).toEqual({ teamKey: "ENG" });
    expect(body.query).toContain("teams(filter: { key: { eq: $teamKey } })");
  });

  it("returns states sorted by position", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { teams: { nodes: [{ states: { nodes: STATE_NODES } }] } },
      }),
    });

    const res = await GET();
    const data = await res.json();

    expect(data.states).toHaveLength(3);
    expect(data.states[0].name).toBe("Backlog");
    expect(data.states[0].position).toBe(1);
    expect(data.states[1].name).toBe("In Progress");
    expect(data.states[1].position).toBe(2);
    expect(data.states[2].name).toBe("Done");
    expect(data.states[2].position).toBe(3);
  });

  it("returns 500 when LINEAR_API_KEY not set", async () => {
    delete process.env.LINEAR_API_KEY;
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns 502 when Linear returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns 502 when Linear returns GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: "Query error" }] }),
    });

    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns 404 when team not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { teams: { nodes: [] } } }),
    });

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns 502 when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns cached states on second call without hitting API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { teams: { nodes: [{ states: { nodes: STATE_NODES } }] } },
      }),
    });

    const res1 = await GET();
    expect(res1.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const res2 = await GET();
    const data2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(data2.states).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes cache after TTL expires", async () => {
    vi.useFakeTimers();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { teams: { nodes: [{ states: { nodes: STATE_NODES } }] } },
      }),
    });

    await GET();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await GET();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
