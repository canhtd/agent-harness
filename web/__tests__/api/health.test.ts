import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReaddir = vi.fn();
const mockReadFile = vi.fn();

vi.mock("node:fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

vi.mock("node:os", () => ({
  homedir: () => "/mock-home",
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCKS_DIR = "/tmp/locks";
    process.env.TOKENS_LOG_PATH = "/tmp/tokens.jsonl";
  });

  afterEach(() => {
    delete process.env.LOCKS_DIR;
    delete process.env.TOKENS_LOG_PATH;
    delete process.env.MAX_ATTEMPTS;
  });

  it("parses lockfiles and returns sessions", async () => {
    mockReaddir.mockResolvedValueOnce(["issue-1.json"]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/tmp/locks/issue-1.json") {
        return JSON.stringify({
          pid: 99999999,
          issueId: "issue-1",
          identifier: "ENG-10",
          startedAt: "2025-01-01T00:00:00Z",
          attempt: 1,
          turn: 3,
          stateName: "Todo",
        });
      }
      if (path === "/tmp/tokens.jsonl") {
        throw new Error("ENOENT");
      }
      throw new Error("ENOENT");
    });

    const res = await GET();
    const data = await res.json();

    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].identifier).toBe("ENG-10");
    expect(data.sessions[0].attempt).toBe(1);
    expect(data.sessions[0].turn).toBe(3);
    expect(data.sessions[0].alive).toBe(false);
  });

  it("aggregates cost and duration from tokens.jsonl", async () => {
    mockReaddir.mockResolvedValueOnce([]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/tmp/tokens.jsonl") {
        return [
          JSON.stringify({ status: "completed", duration_seconds: 100, estimated_cost_usd: 0.5 }),
          JSON.stringify({ status: "failed", duration_seconds: 200, estimated_cost_usd: 1.0 }),
        ].join("\n");
      }
      throw new Error("ENOENT");
    });

    const res = await GET();
    const data = await res.json();

    expect(data.totalCost).toBe(1.5);
    expect(data.maxDuration).toBe(200);
    expect(data.avgDuration).toBe(150);
    expect(data.successRate).toBe(50);
  });

  it("handles missing locks dir gracefully", async () => {
    mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    expect(data.sessions).toEqual([]);
    expect(data.running).toBe(0);
    expect(data.totalCost).toBe(0);
  });

  it("handles missing tokens file gracefully", async () => {
    mockReaddir.mockResolvedValueOnce([]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    expect(data.successRate).toBe(0);
    expect(data.totalCost).toBe(0);
  });

  it("counts blocked sessions when exitCode !== 0", async () => {
    mockReaddir.mockResolvedValueOnce(["issue-1.json"]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/tmp/locks/issue-1.json") {
        return JSON.stringify({
          pid: 99999999,
          issueId: "issue-1",
          identifier: "ENG-10",
          startedAt: "2025-01-01T00:00:00Z",
          attempt: 1,
          exitCode: 1,
          stateName: "Todo",
        });
      }
      throw new Error("ENOENT");
    });

    const res = await GET();
    const data = await res.json();

    expect(data.blocked).toBe(1);
    expect(data.running).toBe(0);
  });

  it("counts blocked when attempt >= maxAttempts", async () => {
    process.env.MAX_ATTEMPTS = "2";
    mockReaddir.mockResolvedValueOnce(["issue-1.json"]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/tmp/locks/issue-1.json") {
        return JSON.stringify({
          pid: 99999999,
          issueId: "issue-1",
          identifier: "ENG-10",
          startedAt: "2025-01-01T00:00:00Z",
          attempt: 2,
          stateName: "Todo",
        });
      }
      throw new Error("ENOENT");
    });

    const res = await GET();
    const data = await res.json();

    expect(data.blocked).toBe(1);
  });

  it("skips non-json files in locks dir", async () => {
    mockReaddir.mockResolvedValueOnce(["readme.txt", "lock.json"]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/tmp/locks/lock.json") {
        return JSON.stringify({
          pid: 99999999,
          issueId: "issue-1",
          identifier: "ENG-10",
          startedAt: "2025-01-01T00:00:00Z",
          attempt: 1,
          stateName: "Todo",
        });
      }
      throw new Error("ENOENT");
    });

    const res = await GET();
    const data = await res.json();

    expect(data.sessions).toHaveLength(1);
  });
});
