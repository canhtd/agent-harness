"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { IssueCard } from "../api/issues/route";
import CreateIssueModal from "../components/CreateIssueModal";

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
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (showQuickCreate) {
      setTimeout(() => quickInputRef.current?.focus(), 0);
    }
  }, [showQuickCreate]);

  const handleQuickCreate = async () => {
    if (!quickTitle.trim() || quickLoading) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: IssueCard = {
      id: tempId,
      identifier: "...",
      title: quickTitle.trim(),
      priority: 3,
      url: "",
      status: "Todo",
      column: "todo",
      createdAt: new Date().toISOString(),
    };

    setIssues((prev) => [optimistic, ...prev]);
    setQuickLoading(true);
    setQuickError(null);

    const titleValue = quickTitle.trim();
    setQuickTitle("");

    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIssues((prev) => prev.filter((i) => i.id !== tempId));
        setQuickError(data.error || "Failed to create issue");
        return;
      }
      setIssues((prev) =>
        prev.map((i) => (i.id === tempId ? data.issue : i)),
      );
      setShowQuickCreate(false);
    } catch {
      setIssues((prev) => prev.filter((i) => i.id !== tempId));
      setQuickError("Failed to create issue");
    } finally {
      setQuickLoading(false);
    }
  };

  const handleQuickKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleQuickCreate();
    } else if (e.key === "Escape") {
      setShowQuickCreate(false);
      setQuickTitle("");
      setQuickError(null);
    }
  };

  const handleModalCreated = (issue: IssueCard) => {
    setIssues((prev) => [issue, ...prev]);
  };

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
      <div className="kanban-top-bar">
        <button
          className="btn-primary"
          onClick={() => setModalOpen(true)}
        >
          New Issue
        </button>
      </div>
      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const items = grouped[col.key];
          return (
            <div key={col.key} className="kanban-column">
              <div className={`kanban-header ${col.colorClass}`}>
                <span className="kanban-header-label">
                  {col.label}
                  <span className="kanban-count">{items.length}</span>
                  {col.key === "todo" && (
                    <button
                      className="kanban-add-btn"
                      onClick={() => setShowQuickCreate(!showQuickCreate)}
                      type="button"
                      title="Quick create issue"
                    >
                      +
                    </button>
                  )}
                </span>
              </div>
              <div className="kanban-cards">
                {col.key === "todo" && showQuickCreate && (
                  <div className="kanban-quick-input-wrapper">
                    <input
                      ref={quickInputRef}
                      className="input kanban-quick-input"
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      onKeyDown={handleQuickKeyDown}
                      placeholder="Issue title..."
                      disabled={quickLoading}
                    />
                    {quickError && (
                      <div className="kanban-quick-error">{quickError}</div>
                    )}
                  </div>
                )}
                {items.length === 0 && !(col.key === "todo" && showQuickCreate) ? (
                  <p className="kanban-empty">No issues</p>
                ) : (
                  items.map((issue) => (
                    <Link
                      key={issue.id}
                      href={`/issues/${issue.identifier}`}
                      className="kanban-card"
                    >
                      {issue.priority > 0 && (
                        <span
                          className={`priority-dot priority-${issue.priority}`}
                        />
                      )}
                      <span className="kanban-id">{issue.identifier}</span>
                      <span className="kanban-title">{issue.title}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <CreateIssueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleModalCreated}
      />
    </main>
  );
}
