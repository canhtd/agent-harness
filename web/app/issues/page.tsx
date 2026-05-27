"use client";

import { useEffect, useState } from "react";
import type { IssueCard } from "../api/issues/route";

const COLUMNS = [
  { key: "todo" as const, label: "Todo", colorClass: "kanban-header-todo" },
  {
    key: "working" as const,
    label: "Working",
    colorClass: "kanban-header-working",
  },
  { key: "done" as const, label: "Done", colorClass: "kanban-header-done" },
  {
    key: "cancel" as const,
    label: "Cancel",
    colorClass: "kanban-header-cancel",
  },
];

export default function IssuesPage() {
  const [issues, setIssues] = useState<IssueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/issues")
      .then(async (res) => {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setIssues(data.issues ?? []);
        } else {
          setIssues(data.issues);
        }
      })
      .catch(() => setError("Failed to fetch issues"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="page">
        <div className="kanban-board">
          {COLUMNS.map((col) => (
            <div key={col.key} className="kanban-column">
              <div className={`kanban-header ${col.colorClass}`}>
                <span className="kanban-header-label">
                  {col.label}
                  <span className="kanban-count kanban-count-skeleton" />
                </span>
              </div>
              <div className="kanban-cards">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="kanban-card kanban-card-skeleton">
                    <div className="skeleton-line skeleton-short" />
                    <div className="skeleton-line skeleton-long" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  const grouped: Record<IssueCard["column"], IssueCard[]> = {
    todo: [],
    working: [],
    done: [],
    cancel: [],
  };
  for (const issue of issues) {
    grouped[issue.column]?.push(issue);
  }

  return (
    <main className="page">
      {error && <div className="kanban-error">{error}</div>}
      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const items = grouped[col.key];
          return (
            <div key={col.key} className="kanban-column">
              <div className={`kanban-header ${col.colorClass}`}>
                <span className="kanban-header-label">
                  {col.label}
                  <span className="kanban-count">{items.length}</span>
                </span>
              </div>
              <div className="kanban-cards">
                {items.length === 0 ? (
                  <p className="kanban-empty">No issues</p>
                ) : (
                  items.map((issue) => (
                    <button
                      key={issue.id}
                      className="kanban-card"
                      type="button"
                      onClick={() => window.open(issue.url, "_blank")}
                    >
                      {issue.priority > 0 && (
                        <span
                          className={`priority-dot priority-${issue.priority}`}
                        />
                      )}
                      <span className="kanban-id">{issue.identifier}</span>
                      <span className="kanban-title">{issue.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
