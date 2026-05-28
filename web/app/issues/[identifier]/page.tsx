"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { IssueDetail } from "../../api/issues/[identifier]/route";

const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function IssueDetailPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/issues/${identifier}`)
      .then(async (res) => {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setIssue(data.issue);
        }
      })
      .catch(() => setError("Failed to fetch issue"))
      .finally(() => setLoading(false));
  }, [identifier]);

  if (loading) {
    return (
      <main className="page">
        <Link href="/issues" className="detail-back">
          ← Issues
        </Link>
        <div className="detail-layout">
          <div className="detail-main">
            <div className="skeleton-line skeleton-short" />
            <div
              className="skeleton-line"
              style={{ width: "60%", height: "1.5rem", marginTop: "0.5rem" }}
            />
          </div>
        </div>
      </main>
    );
  }

  if (error || !issue) {
    return (
      <main className="page">
        <Link href="/issues" className="detail-back">
          ← Issues
        </Link>
        <p className="empty-state">{error ?? "Issue not found"}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <Link href="/issues" className="detail-back">
        ← Issues
      </Link>
      <div className="detail-layout">
        <div className="detail-main">
          <span className="kanban-id">{issue.identifier}</span>
          <h1 className="detail-title">{issue.title}</h1>
          <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "1rem 0" }} />
          {issue.description ? (
            <div className="detail-description">{issue.description}</div>
          ) : (
            <p className="text-muted" style={{ fontStyle: "italic" }}>
              No description
            </p>
          )}
        </div>
        <aside className="detail-sidebar">
          <div>
            <span className="detail-meta-label">Status</span>
            <span
              className="label-pill"
              style={{
                background: `${issue.state.color}18`,
                color: issue.state.color,
              }}
            >
              {issue.state.name}
            </span>
          </div>
          <div>
            <span className="detail-meta-label">Priority</span>
            <span className="detail-meta-value">
              {issue.priority > 0 && (
                <span
                  className={`priority-dot priority-dot-inline priority-${issue.priority}`}
                />
              )}
              {PRIORITY_LABELS[issue.priority] ?? "Unknown"}
            </span>
          </div>
          {issue.labels.length > 0 && (
            <div>
              <span className="detail-meta-label">Labels</span>
              <div className="detail-labels">
                {issue.labels.map((label) => (
                  <span
                    key={label.id}
                    className="label-pill"
                    style={{
                      background: `${label.color}18`,
                      color: label.color,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="detail-meta-label">Created</span>
            <span className="detail-meta-value">
              {relativeTime(issue.createdAt)}
            </span>
          </div>
          <div>
            <span className="detail-meta-label">Updated</span>
            <span className="detail-meta-value">
              {relativeTime(issue.updatedAt)}
            </span>
          </div>
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="detail-linear-link"
          >
            Open in Linear →
          </a>
        </aside>
      </div>
    </main>
  );
}
