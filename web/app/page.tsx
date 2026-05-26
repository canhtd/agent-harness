"use client";

import { useEffect, useState } from "react";
import type { TokenRecord } from "./api/tokens/route";

type SortKey =
  | "task"
  | "date"
  | "model"
  | "turns"
  | "input_tokens"
  | "output_tokens"
  | "cache_read_tokens"
  | "estimated_cost_usd";

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
  if (cost >= 8) return "var(--color-cost-yellow)";
  return "var(--color-accent)";
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

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
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortAsc ? cmp : -cmp;
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
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
        <span className="rounded-full bg-accent/10 px-3 py-0.5 text-sm font-medium text-accent">
          Dashboard
        </span>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
          <p className="text-muted text-lg">No sessions recorded yet</p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total Sessions" value={totalSessions.toString()} />
            <MetricCard label="Total Cost" value={formatCost(totalCost)} />
            <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} />
            <MetricCard label="Avg Cost / Session" value={formatCost(avgCost)} />
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 font-medium text-muted hover:text-ink"
                    >
                      {col.label}
                      {sortKey === col.key ? (sortAsc ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr
                    key={s.task + "-" + s.date}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">{s.task}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {new Date(s.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{s.model}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.turns}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatTokens(s.input_tokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatTokens(s.output_tokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatTokens(s.cache_read_tokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: costColor(s.estimated_cost_usd) }}
                      >
                        {formatCost(s.estimated_cost_usd)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 font-medium">
                  <td className="px-4 py-3 text-ink">Total</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {sessions.reduce((s, r) => s + r.turns, 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatTokens(sessions.reduce((s, r) => s + r.input_tokens, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatTokens(sessions.reduce((s, r) => s + r.output_tokens, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatTokens(sessions.reduce((s, r) => s + r.cache_read_tokens, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: costColor(totalCost) }}
                    >
                      {formatCost(totalCost)}
                    </span>
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

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "task", label: "Task" },
  { key: "date", label: "Date" },
  { key: "model", label: "Model" },
  { key: "turns", label: "Turns" },
  { key: "input_tokens", label: "Input Tokens" },
  { key: "output_tokens", label: "Output Tokens" },
  { key: "cache_read_tokens", label: "Cache Read" },
  { key: "estimated_cost_usd", label: "Cost" },
];

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
