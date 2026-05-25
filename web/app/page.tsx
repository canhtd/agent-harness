"use client";

import { useEffect, useState } from "react";

interface TokenRecord {
  session_id: string;
  task: string;
  date: string;
  model: string;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
}

type SortKey = keyof TokenRecord;
type SortDir = "asc" | "desc";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)";
  if (cost > 8) return "var(--color-cost-yellow)";
  return "var(--color-cost-green)";
}

function costBarWidth(cost: number): number {
  return Math.min(100, (cost / 20) * 100);
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((data: { sessions: TokenRecord[] }) => {
        setSessions(data.sessions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalSessions = sessions.length;
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0);
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  );
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;

  const totInputTokens = sessions.reduce((s, r) => s + r.input_tokens, 0);
  const totOutputTokens = sessions.reduce((s, r) => s + r.output_tokens, 0);
  const totCacheRead = sessions.reduce((s, r) => s + r.cache_read_tokens, 0);
  const totTurns = sessions.reduce((s, r) => s + r.turns, 0);

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <p className="text-center text-muted">Loading...</p>
      </main>
    );
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-ink">Agent Harness</h1>
        <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
          Dashboard
        </span>
      </header>

      {sessions.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-muted">No sessions recorded yet</p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total Sessions" value={totalSessions.toString()} />
            <MetricCard label="Total Cost" value={formatCost(totalCost)} />
            <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} />
            <MetricCard label="Avg Cost / Session" value={formatCost(avgCost)} />
          </div>

          <div className="overflow-x-auto rounded-2xl bg-card shadow-sm ring-1 ring-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  {(
                    [
                      ["task", "Task"],
                      ["date", "Date"],
                      ["model", "Model"],
                      ["turns", "Turns"],
                      ["input_tokens", "Input Tokens"],
                      ["output_tokens", "Output Tokens"],
                      ["cache_read_tokens", "Cache Read"],
                      ["estimated_cost_usd", "Cost"],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      className="cursor-pointer px-4 py-3 font-medium select-none hover:text-ink"
                      onClick={() => handleSort(key)}
                    >
                      {label}
                      {sortIndicator(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr
                    key={r.session_id ?? i}
                    className={i % 2 === 1 ? "bg-row-alt" : ""}
                  >
                    <td className="px-4 py-2.5 font-medium">{r.task}</td>
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{r.model}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.turns}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatTokens(r.input_tokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatTokens(r.output_tokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatTokens(r.cache_read_tokens)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-border overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${costBarWidth(r.estimated_cost_usd)}%`,
                              backgroundColor: costColor(r.estimated_cost_usd),
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-right">
                          {formatCost(r.estimated_cost_usd)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-right tabular-nums">{totTurns}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatTokens(totInputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatTokens(totOutputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatTokens(totCacheRead)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="tabular-nums">{formatCost(totalCost)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border backdrop-blur-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
