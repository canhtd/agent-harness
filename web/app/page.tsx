"use client";

import { useEffect, useState, useCallback } from "react";
import type { HealthData, SessionInfo } from "./api/health/route";

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

function elapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return "—";
  return formatDuration(Math.round(ms / 1000));
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((d: HealthData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) {
    return (
      <main className="page">
        <p className="empty-state">Loading…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <p className="empty-state">Failed to load health data</p>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="cards-grid">
        <div className="card">
          <span className="card-label">Running agents</span>
          <span className="card-value" style={{ color: "var(--color-accent)" }}>
            {data.running}
          </span>
        </div>
        <div className="card">
          <span className="card-label">Blocked / Failed</span>
          <span
            className="card-value"
            style={{ color: data.blocked > 0 ? "var(--color-cost-red)" : undefined }}
          >
            {data.blocked}
          </span>
        </div>
        <div className="card">
          <span className="card-label">Success rate</span>
          <span className="card-value">{data.successRate}%</span>
        </div>
        <div className="card">
          <span className="card-label">Avg duration</span>
          <span className="card-value">{formatDuration(data.avgDuration)}</span>
        </div>
        <div className="card">
          <span className="card-label">Total cost</span>
          <span className="card-value">${data.totalCost.toFixed(2)}</span>
        </div>
      </div>

      {data.sessions.length === 0 ? (
        <p className="empty-state">No active sessions</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th className="table-th">Issue</th>
                <th className="table-th">State</th>
                <th className="table-th">Attempt</th>
                <th className="table-th">Turn</th>
                <th className="table-th">Started</th>
                <th className="table-th">Duration</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s: SessionInfo) => (
                <tr key={s.identifier} className="table-row">
                  <td className="table-td font-medium">{s.identifier}</td>
                  <td className="table-td text-muted">{s.stateName}</td>
                  <td className="table-td text-right">{s.attempt}</td>
                  <td className="table-td text-right">{s.turn}</td>
                  <td className="table-td text-muted">{relativeTime(s.startedAt)}</td>
                  <td className="table-td text-right">{elapsed(s.startedAt)}</td>
                  <td className="table-td">
                    <span
                      className={`status-badge ${s.alive ? "status-completed" : "status-failed"}`}
                    >
                      {s.alive ? "alive" : "dead"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
