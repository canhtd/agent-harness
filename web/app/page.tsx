"use client";

import { useEffect, useState, useMemo } from "react";
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
  return n.toLocaleString();
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)";
  if (cost >= 8) return "var(--color-cost-yellow)";
  return "var(--color-cost-green)";
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data: { sessions: TokenRecord[] }) => setSessions(data.sessions))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string")
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return copy;
  }, [sessions, sortKey, sortAsc]);

  const totalSessions = sessions.length;
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0);
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  );
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;

  const totals = useMemo(
    () => ({
      turns: sessions.reduce((s, r) => s + r.turns, 0),
      input_tokens: sessions.reduce((s, r) => s + r.input_tokens, 0),
      output_tokens: sessions.reduce((s, r) => s + r.output_tokens, 0),
      cache_read_tokens: sessions.reduce(
        (s, r) => s + r.cache_read_tokens,
        0,
      ),
      estimated_cost_usd: totalCost,
    }),
    [sessions, totalCost],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? " ▲" : " ▼";
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

  if (loading) {
    return (
      <main className="page">
        <p className="empty-state">Loading…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="header">
        <h1 className="header-title">Agent Harness</h1>
        <span className="status-badge">Dashboard</span>
      </header>

      <div className="cards-grid">
        <div className="card">
          <span className="card-label">Total sessions</span>
          <span className="card-value">{totalSessions}</span>
        </div>
        <div className="card">
          <span className="card-label">Total cost</span>
          <span className="card-value">${totalCost.toFixed(2)}</span>
        </div>
        <div className="card">
          <span className="card-label">Total tokens</span>
          <span className="card-value">{formatTokens(totalTokens)}</span>
        </div>
        <div className="card">
          <span className="card-label">Avg cost / session</span>
          <span className="card-value">${avgCost.toFixed(2)}</span>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="empty-state">No sessions recorded yet</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="table-th"
                  >
                    {col.label}
                    {sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.task}-${r.date}-${i}`} className="table-row">
                  <td className="table-td font-medium">{r.task}</td>
                  <td className="table-td text-muted">
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                  <td className="table-td text-muted">{r.model}</td>
                  <td className="table-td text-right">{r.turns}</td>
                  <td className="table-td text-right">
                    {formatTokens(r.input_tokens)}
                  </td>
                  <td className="table-td text-right">
                    {formatTokens(r.output_tokens)}
                  </td>
                  <td className="table-td text-right">
                    {formatTokens(r.cache_read_tokens)}
                  </td>
                  <td className="table-td text-right">
                    <span
                      className="cost-bar"
                      style={
                        {
                          "--cost-color": costColor(r.estimated_cost_usd),
                        } as React.CSSProperties
                      }
                    >
                      ${r.estimated_cost_usd.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="table-footer">
                <td className="table-td font-medium" colSpan={3}>
                  Totals
                </td>
                <td className="table-td text-right">{totals.turns}</td>
                <td className="table-td text-right">
                  {formatTokens(totals.input_tokens)}
                </td>
                <td className="table-td text-right">
                  {formatTokens(totals.output_tokens)}
                </td>
                <td className="table-td text-right">
                  {formatTokens(totals.cache_read_tokens)}
                </td>
                <td className="table-td text-right font-medium">
                  ${totals.estimated_cost_usd.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </main>
  );
}
