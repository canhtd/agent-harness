"use client";

import { useEffect, useState } from "react";
import type { TokenRecord } from "./api/tokens/route";

type SortKey = keyof TokenRecord;
type SortDir = "asc" | "desc";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)";
  if (cost > 8) return "var(--color-cost-yellow)";
  return "var(--color-cost-green)";
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
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

  if (totalSessions === 0) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-muted text-lg">No sessions recorded yet</p>
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

  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent/10 text-accent">
            Active
          </span>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard label="Total Sessions" value={totalSessions.toString()} />
          <MetricCard label="Total Cost" value={formatCost(totalCost)} />
          <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} />
          <MetricCard label="Avg Cost/Session" value={formatCost(avgCost)} />
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left font-medium text-muted cursor-pointer hover:text-ink select-none whitespace-nowrap"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="ml-1">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr
                    key={s.task + "-" + s.date}
                    className="border-b border-border last:border-0 even:bg-row-alt"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {s.task}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {new Date(s.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted">{s.model}</td>
                    <td className="px-4 py-3 text-muted">{s.turns}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatTokens(s.input_tokens)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatTokens(s.output_tokens)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatTokens(s.cache_read_tokens)}
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <span
                        style={{ color: costColor(s.estimated_cost_usd) }}
                      >
                        {formatCost(s.estimated_cost_usd)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-page font-medium">
                  <td className="px-4 py-3 text-ink">Total</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-muted">
                    {sessions.reduce((s, r) => s + r.turns, 0)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.input_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.output_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.cache_read_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: costColor(totalCost) }}>
                      {formatCost(totalCost)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border p-5">
      <p className="text-sm text-muted mb-1">{label}</p>
      <p className="text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
