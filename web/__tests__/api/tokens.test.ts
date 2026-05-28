import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReadFile = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

vi.mock("node:os", () => ({
  homedir: () => "/mock-home",
}));

import { GET } from "@/app/api/tokens/route";

describe("GET /api/tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOKENS_LOG_PATH = "/tmp/tokens.jsonl";
  });

  afterEach(() => {
    delete process.env.TOKENS_LOG_PATH;
  });

  it("parses token records and returns sessions", async () => {
    const records = [
      {
        task: "ENG-10",
        date: "2025-01-01T00:00:00Z",
        model: "claude-sonnet-4-20250514",
        messages: 5,
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_tokens: 100,
        cache_read_tokens: 50,
        estimated_cost_usd: 0.5,
        duration_seconds: 120,
        status: "completed",
      },
    ];
    mockReadFile.mockResolvedValueOnce(records.map((r) => JSON.stringify(r)).join("\n"));

    const res = await GET();
    const data = await res.json();

    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].task).toBe("ENG-10");
    expect(data.sessions[0].messages).toBe(5);
    expect(data.sessions[0].status).toBe("completed");
  });

  it("normalizes old format with turns field to messages", async () => {
    const record = {
      task: "ENG-10",
      date: "2025-01-01T00:00:00Z",
      model: "claude-sonnet-4-20250514",
      turns: 8,
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_tokens: 100,
      cache_read_tokens: 50,
      estimated_cost_usd: 0.5,
    };
    mockReadFile.mockResolvedValueOnce(JSON.stringify(record));

    const res = await GET();
    const data = await res.json();

    expect(data.sessions[0].messages).toBe(8);
    expect(data.sessions[0].duration_seconds).toBe(0);
    expect(data.sessions[0].status).toBe("unknown");
  });

  it("aggregates daily activity", async () => {
    const records = [
      {
        task: "ENG-10",
        date: "2025-01-01T10:00:00Z",
        model: "m",
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        estimated_cost_usd: 0.3,
        status: "completed",
      },
      {
        task: "ENG-11",
        date: "2025-01-01T14:00:00Z",
        model: "m",
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        estimated_cost_usd: 0.7,
        status: "failed",
      },
      {
        task: "ENG-12",
        date: "2025-01-02T10:00:00Z",
        model: "m",
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        estimated_cost_usd: 0.5,
        status: "completed",
      },
    ];
    mockReadFile.mockResolvedValueOnce(records.map((r) => JSON.stringify(r)).join("\n"));

    const res = await GET();
    const data = await res.json();

    expect(data.dailyActivity).toHaveLength(2);
    expect(data.dailyActivity[0].date).toBe("2025-01-01");
    expect(data.dailyActivity[0].completed).toBe(1);
    expect(data.dailyActivity[0].failed).toBe(1);
    expect(data.dailyActivity[0].totalCost).toBeCloseTo(1.0);
    expect(data.dailyActivity[1].date).toBe("2025-01-02");
    expect(data.dailyActivity[1].completed).toBe(1);
  });

  it("returns empty sessions when file doesn't exist", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    expect(data.sessions).toEqual([]);
  });

  it("skips malformed lines", async () => {
    const content = [
      "not valid json",
      JSON.stringify({
        task: "ENG-10",
        date: "2025-01-01T00:00:00Z",
        model: "m",
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        estimated_cost_usd: 0.5,
        status: "completed",
      }),
      "",
    ].join("\n");
    mockReadFile.mockResolvedValueOnce(content);

    const res = await GET();
    const data = await res.json();

    expect(data.sessions).toHaveLength(1);
  });
});
