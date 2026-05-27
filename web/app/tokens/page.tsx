"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type { TokenRecord, DailyActivity } from "../api/tokens/route";

type SortKey =
  | "task"
  | "status"
  | "model"
  | "messages"
  | "input_tokens"
  | "output_tokens"
  | "duration_seconds"
  | "estimated_cost_usd";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)";
  if (cost >= 8) return "var(--color-cost-yellow)";
  return "var(--color-cost-green)";
}

function statusBadge(status: string) {
  let className = "status-badge status-unknown";
  if (status === "completed") className = "status-badge status-completed";
  else if (status === "failed") className = "status-badge status-failed";
  return <span className={className}>{status}</span>;
}

function DailyActivityChart({ data }: { data: DailyActivity[] }) {
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  const maxCount = Math.max(...data.map((d) => d.completed + d.failed), 1);

  const handleMouseEnter = useCallback(
    (idx: number, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setHover({ idx, x: rect.left + rect.width / 2, y: rect.top });
    },
    [],
  );
  const handleMouseLeave = useCallback(() => setHover(null), []);

  if (data.length === 0) return null;

  const hovered = hover !== null ? data[hover.idx] : null;

  return (
    <div className="chart-container">
      <div className="chart-label">Daily Activity</div>
      <div className="chart-bars">
        {data.map((d, i) => {
          const completedH = (d.completed / maxCount) * 100;
          const failedH = (d.failed / maxCount) * 100;
          return (
            <div
              key={d.date}
              className="chart-bar-col"
              onMouseEnter={(e) => handleMouseEnter(i, e)}
              onMouseLeave={handleMouseLeave}
            >
              <div className="chart-bar-stack" style={{ height: `${completedH + failedH}%` }}>
                {d.failed > 0 && (
                  <div className="chart-bar-segment chart-bar-failed" style={{ flexBasis: `${(d.failed / (d.completed + d.failed)) * 100}%` }} />
                )}
                {d.completed > 0 && (
                  <div className="chart-bar-segment chart-bar-completed" style={{ flexBasis: `${(d.completed / (d.completed + d.failed)) * 100}%` }} />
                )}
              </div>
              <span className="chart-bar-date">{d.date.slice(5)}</span>
            </div>
          );
        })}
      </div>
      {hovered && hover && (
        <div className="chart-tooltip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hovered.date}</strong>
          <span>Completed: {hovered.completed}</span>
          <span>Failed: {hovered.failed}</span>
          <span>Cost: ${hovered.totalCost.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

export default function TokensPage() {
  const [sessions, setSessions] = useState<TokenRecord[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("estimated_cost_usd");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data: { sessions: TokenRecord[]; dailyActivity: DailyActivity[] }) => {
        setSessions(data.sessions);
        setDailyActivity(data.dailyActivity ?? []);
      })
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
      messages: sessions.reduce((s, r) => s + r.messages, 0),
      input_tokens: sessions.reduce((s, r) => s + r.input_tokens, 0),
      output_tokens: sessions.reduce((s, r) => s + r.output_tokens, 0),
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
    { key: "status", label: "Status" },
    { key: "model", label: "Model" },
    { key: "messages", label: "Messages" },
    { key: "input_tokens", label: "Input tokens" },
    { key: "output_tokens", label: "Output tokens" },
    { key: "duration_seconds", label: "Duration" },
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

      <DailyActivityChart data={dailyActivity} />

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
                  <td className="table-td">{statusBadge(r.status)}</td>
                  <td className="table-td text-muted">{r.model}</td>
                  <td className="table-td text-right">{r.messages}</td>
                  <td className="table-td text-right">
                    {formatTokens(r.input_tokens)}
                  </td>
                  <td className="table-td text-right">
                    {formatTokens(r.output_tokens)}
                  </td>
                  <td className="table-td text-right">
                    {formatDuration(r.duration_seconds)}
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
                <td className="table-td text-right">{totals.messages}</td>
                <td className="table-td text-right">
                  {formatTokens(totals.input_tokens)}
                </td>
                <td className="table-td text-right">
                  {formatTokens(totals.output_tokens)}
                </td>
                <td className="table-td text-right"></td>
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
