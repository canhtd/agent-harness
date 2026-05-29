"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { CycleDetail } from "../../../../api/cycles/[cycleId]/route";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

function CycleDetailSkeleton() {
  return (
    <main className="page">
      <div className="cycle-detail-breadcrumb">
        <span className="skeleton-line" style={{ width: "16rem", height: "0.75rem" }} />
      </div>
      <div className="cycle-detail-header">
        <div style={{ flex: 1 }}>
          <div className="skeleton-line" style={{ width: "50%", height: "1.5rem" }} />
          <div className="skeleton-line" style={{ width: "12rem", height: "0.75rem", marginTop: "0.5rem" }} />
        </div>
      </div>
      <div className="cycle-detail-progress-wrapper">
        <div className="skeleton-line" style={{ width: "100%", height: "0.5rem", borderRadius: "0.25rem" }} />
      </div>
      <div className="table-wrapper">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="cycle-detail-issue-row" style={{ padding: "0.75rem 1rem" }}>
            <div className="skeleton-line skeleton-long" />
          </div>
        ))}
      </div>
    </main>
  );
}

export default function CycleDetailPage() {
  const { teamId, cycleId } = useParams<{ teamId: string; cycleId: string }>();
  const router = useRouter();

  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/cycles/${cycleId}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setCycle(data.cycle);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to fetch cycle");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [cycleId]);

  if (loading) return <CycleDetailSkeleton />;

  if (error || !cycle) {
    return (
      <main className="page">
        <Link href={`/teams/${teamId}`} className="detail-back">
          &larr; Back to team
        </Link>
        <p className="empty-state">{error ?? "Cycle not found"}</p>
      </main>
    );
  }

  const pct = Math.round(cycle.progress * 100);
  const cycleName = cycle.name ?? `Cycle ${cycle.number}`;

  return (
    <main className="page">
      <nav className="cycle-detail-breadcrumb">
        <Link href="/teams" className="cycle-detail-breadcrumb-link">Teams</Link>
        <span className="cycle-detail-breadcrumb-sep">/</span>
        <Link href={`/teams/${teamId}`} className="cycle-detail-breadcrumb-link">
          {cycle.team.name}
        </Link>
        <span className="cycle-detail-breadcrumb-sep">/</span>
        <Link href={`/teams/${teamId}`} className="cycle-detail-breadcrumb-link">
          Cycles
        </Link>
        <span className="cycle-detail-breadcrumb-sep">/</span>
        <span className="cycle-detail-breadcrumb-current">{cycleName}</span>
      </nav>

      <div className="cycle-detail-header">
        <div>
          <h1 className="cycle-detail-title">{cycleName}</h1>
          <span className="cycle-detail-dates">
            {formatDate(cycle.startsAt)} &ndash; {formatDate(cycle.endsAt)}
          </span>
        </div>
      </div>

      <div className="cycle-detail-progress-wrapper">
        <div className="cycle-detail-progress-info">
          <span className="cycle-detail-progress-label">Progress</span>
          <span className="cycle-detail-progress-stats">
            {cycle.completedScopeCount}/{cycle.totalScope} &middot; {pct}%
          </span>
        </div>
        <div className="cycle-detail-progress-track">
          <div
            className="cycle-detail-progress-fill"
            style={{
              width: `${pct}%`,
              background: pct === 100 ? "#16a34a" : "var(--color-accent)",
            }}
          />
        </div>
      </div>

      {cycle.issues.length === 0 ? (
        <div className="empty-state">No issues in this cycle</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th className="table-th">Identifier</th>
                <th className="table-th">Title</th>
                <th className="table-th">Status</th>
                <th className="table-th">Priority</th>
                <th className="table-th">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {cycle.issues.map((issue) => (
                <tr
                  key={issue.id}
                  className="table-row cycle-detail-issue-row"
                  onClick={() => router.push(`/issues/${issue.identifier}`)}
                >
                  <td className="table-td">
                    <span className="cycle-detail-issue-id">{issue.identifier}</span>
                  </td>
                  <td className="table-td">
                    <span className="cycle-detail-issue-title">{issue.title}</span>
                  </td>
                  <td className="table-td">
                    <span
                      className="status-badge"
                      style={{
                        background: `color-mix(in srgb, ${issue.state.color} 12%, transparent)`,
                        color: issue.state.color,
                      }}
                    >
                      {issue.state.name}
                    </span>
                  </td>
                  <td className="table-td">
                    {issue.priority > 0 && (
                      <span className="cycle-detail-priority">
                        <span className={`priority-dot-inline priority-${issue.priority}`} />
                        <span className="cycle-detail-priority-label">
                          {PRIORITY_LABELS[issue.priority] ?? ""}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="table-td">
                    {issue.assignee ? (
                      <span className="cycle-detail-assignee">
                        {issue.assignee.avatarUrl ? (
                          <img
                            src={issue.assignee.avatarUrl}
                            alt={issue.assignee.displayName}
                            className="cycle-detail-assignee-avatar"
                          />
                        ) : (
                          <span className="cycle-detail-assignee-placeholder">
                            {issue.assignee.displayName.charAt(0)}
                          </span>
                        )}
                        <span className="cycle-detail-assignee-name">
                          {issue.assignee.displayName}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">&mdash;</span>
                    )}
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
