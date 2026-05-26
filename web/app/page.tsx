"use client";

import { useEffect, useState } from "react";
import type { TokenRecord } from "./api/tokens/route";

type SortKey = keyof TokenRecord;
type SortDir = "asc" | "desc";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)";
  if (cost > 8) return "var(--color-cost-yellow)";
  return "var(--color-cost-green)";
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "task", label: "Task" },
  { key: "date", label: "Date" },
  { key: "model", label: "Model" },
  { key: "turns", label: "Turns" },
  { key: "input_tokens", label: "Input tokens" },
  { key: "output_tokens", label: "Output tokens" },
  { key: "cache_read_tokens", label: "Cache read" },
  { key: "estimated_cost_usd", label: "Cost" },
];

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

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp =
      typeof av === "string"
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const totalSessions = sessions.length;
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0);
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  );
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-center text-[var(--color-muted)]">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-10 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
          Agent Harness
        </h1>
        <span className="rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-xs font-medium text-white">
          Live
        </span>
      </header>

      {totalSessions === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
          <p className="text-[var(--color-muted)]">
            No sessions recorded yet
          </p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total sessions" value={String(totalSessions)} />
            <MetricCard label="Total cost" value={formatCost(totalCost)} />
            <MetricCard
              label="Total tokens"
              value={formatTokens(totalTokens)}
            />
            <MetricCard label="Avg cost/session" value={formatCost(avgCost)} />
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="cursor-pointer px-4 py-3 font-medium text-[var(--color-muted)] select-none hover:text-[var(--color-ink)]"
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
                {sorted.map((s, i) => (
                  <tr
                    key={`${s.task}-${s.date}-${i}`}
                    className="border-b border-gray-50 last:border-0 even:bg-gray-50/50"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                      {s.task}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {new Date(s.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {s.model}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {s.turns}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {formatTokens(s.input_tokens)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {formatTokens(s.output_tokens)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {formatTokens(s.cache_read_tokens)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{
                          backgroundColor: costColor(s.estimated_cost_usd),
                        }}
                      >
                        {formatCost(s.estimated_cost_usd)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 font-medium text-[var(--color-ink)]">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3">
                    {sessions.reduce((s, r) => s + r.turns, 0)}
                  </td>
                  <td className="px-4 py-3">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.input_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.output_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.cache_read_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3">
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="mb-1 text-sm text-[var(--color-muted)]">{label}</p>
      <p className="text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
