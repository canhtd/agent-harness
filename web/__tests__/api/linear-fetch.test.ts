import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { linearFetch } from "@/app/api/linear-fetch";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const API_KEY = "test-key";
const BODY = { query: "query { test }", variables: {} };

describe("linearFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await linearFetch(API_KEY, BODY);
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries once on 400 and returns second response", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = linearFetch(API_KEY, BODY);
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries once on 429", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = linearFetch(API_KEY, BODY);
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries once on 500", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = linearFetch(API_KEY, BODY);
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns error response after max retries exhausted", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const promise = linearFetch(API_KEY, BODY);
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-retryable status (e.g. 403)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const res = await linearFetch(API_KEY, BODY);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries once on network error then succeeds", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = linearFetch(API_KEY, BODY);
    await vi.advanceTimersByTimeAsync(1000);
    const res = await promise;

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws on network error after max retries", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("network error"));

    const promise = linearFetch(API_KEY, BODY);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("network error");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends correct headers and body", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await linearFetch(API_KEY, BODY);

    expect(mockFetch).toHaveBeenCalledWith("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: API_KEY,
      },
      body: JSON.stringify(BODY),
    });
  });
});
