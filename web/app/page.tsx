"use client";

import { useEffect, useState } from "react";
import type { TokenRecord } from "@/app/api/tokens/route";

type SortKey = keyof TokenRecord;
type SortDir = "asc" | "desc";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)";
  if (cost > 8) return "var(--color-cost-yellow)";
  return "var(--color-cost-green)";
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((data: { sessions: TokenRecord[] }) => setSessions(data.sessions))
      .finally(() => setLoading(false));
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalSessions = sessions.length;
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0);
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  );
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;

  if (loading) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </main>
    );
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "task", label: "Task" },
    { key: "date", label: "Date" },
    { key: "model", label: "Model" },
    { key: "turns", label: "Turns" },
    { key: "input_tokens", label: "Input tokens" },
    { key: "output_tokens", label: "Output tokens" },
    { key: "cache_read_tokens", label: "Cache read" },
    { key: "estimated_cost_usd", label: "Cost" },
  ];

  const totals = {
    turns: sessions.reduce((s, r) => s + r.turns, 0),
    input_tokens: sessions.reduce((s, r) => s + r.input_tokens, 0),
    output_tokens: sessions.reduce((s, r) => s + r.output_tokens, 0),
    cache_read_tokens: sessions.reduce((s, r) => s + r.cache_read_tokens, 0),
    estimated_cost_usd: totalCost,
  };

  return (
    <main className="min-h-screen bg-page">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
          <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent">
            Dashboard
          </span>
        </div>

        {totalSessions === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-card shadow-sm">
            <p className="text-muted">No sessions recorded yet</p>
          </div>
        ) : (
          <>
            {/* Metric Cards */}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total sessions" value={String(totalSessions)} />
              <MetricCard label="Total cost" value={`$${totalCost.toFixed(2)}`} />
              <MetricCard label="Total tokens" value={formatTokens(totalTokens)} />
              <MetricCard label="Avg cost/session" value={`$${avgCost.toFixed(2)}`} />
            </div>

            {/* Sessions Table */}
            <div className="overflow-x-auto rounded-2xl bg-card shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="cursor-pointer px-4 py-3 font-medium text-muted hover:text-ink select-none"
                      >
                        {col.label}
                        {sortKey === col.key && (
                          <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr key={`${s.task}-${s.date}`} className="border-b border-border last:border-0 even:bg-row-alt">
                      <td className="px-4 py-3 font-medium text-ink">{s.task}</td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(s.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted">{s.model}</td>
                      <td className="px-4 py-3 text-muted">{s.turns}</td>
                      <td className="px-4 py-3 text-muted">{formatTokens(s.input_tokens)}</td>
                      <td className="px-4 py-3 text-muted">{formatTokens(s.output_tokens)}</td>
                      <td className="px-4 py-3 text-muted">{formatTokens(s.cache_read_tokens)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: costColor(s.estimated_cost_usd) }}
                        >
                          ${s.estimated_cost_usd.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-medium text-ink">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3">{totals.turns}</td>
                    <td className="px-4 py-3">{formatTokens(totals.input_tokens)}</td>
                    <td className="px-4 py-3">{formatTokens(totals.output_tokens)}</td>
                    <td className="px-4 py-3">{formatTokens(totals.cache_read_tokens)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: costColor(totals.estimated_cost_usd) }}
                      >
                        ${totals.estimated_cost_usd.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
