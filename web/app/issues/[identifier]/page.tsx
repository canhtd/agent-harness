"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { IssueDetail, AgentMeta } from "../../api/issues/[identifier]/route";
import type { WorkflowState } from "../../api/issues/states/route";

const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

const PRIORITY_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function costColor(cost: number): string {
  if (cost < 20) return "var(--color-cost-green)";
  if (cost < 50) return "var(--color-cost-yellow)";
  return "var(--color-cost-red)";
}

function statusBadgeClass(meta: AgentMeta): string {
  if (meta.alive) return "status-badge status-completed";
  if (meta.lastStatus === "completed") return "status-badge status-completed";
  if (meta.lastStatus === "failed") return "status-badge status-failed";
  return "status-badge status-unknown";
}

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

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, handler]);
}

export default function IssueDetailPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing states
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState(false);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [descError, setDescError] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [workflowStates, setWorkflowStates] = useState<WorkflowState[]>([]);

  const [priorityOpen, setPriorityOpen] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const titleSavingRef = useRef(false);
  const descSavingRef = useRef(false);

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

  useEffect(() => {
    fetch("/api/issues/states")
      .then(async (res) => {
        const data = await res.json();
        if (data.states) setWorkflowStates(data.states);
      })
      .catch(() => {});
  }, []);

  const patchIssue = useCallback(
    async (fields: Record<string, unknown>): Promise<IssueDetail | null> => {
      const res = await fetch(`/api/issues/${identifier}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok || data.error) return null;
      return data.issue;
    },
    [identifier],
  );

  // Title editing
  function startEditTitle() {
    if (!issue) return;
    setTitleDraft(issue.title);
    setEditingTitle(true);
    setTitleError(false);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  async function saveTitle() {
    if (titleSavingRef.current) return;
    if (!issue || titleDraft === issue.title) {
      setEditingTitle(false);
      return;
    }
    titleSavingRef.current = true;
    setSavingTitle(true);
    setTitleError(false);
    const updated = await patchIssue({ title: titleDraft });
    titleSavingRef.current = false;
    setSavingTitle(false);
    if (updated) {
      setIssue(updated);
      setEditingTitle(false);
    } else {
      setTitleError(true);
      setTitleDraft(issue.title);
      setTimeout(() => {
        setTitleError(false);
        setEditingTitle(false);
      }, 1500);
    }
  }

  function cancelEditTitle() {
    if (issue) setTitleDraft(issue.title);
    setEditingTitle(false);
    setTitleError(false);
  }

  // Description editing
  function startEditDesc() {
    if (!issue) return;
    setDescDraft(issue.description ?? "");
    setEditingDesc(true);
    setDescError(false);
    setTimeout(() => descTextareaRef.current?.focus(), 0);
  }

  async function saveDesc() {
    if (descSavingRef.current) return;
    if (!issue) {
      setEditingDesc(false);
      return;
    }
    const newVal = descDraft;
    if (newVal === (issue.description ?? "")) {
      setEditingDesc(false);
      return;
    }
    descSavingRef.current = true;
    setSavingDesc(true);
    setDescError(false);
    const updated = await patchIssue({ description: newVal });
    descSavingRef.current = false;
    setSavingDesc(false);
    if (updated) {
      setIssue(updated);
      setEditingDesc(false);
    } else {
      setDescError(true);
      setDescDraft(issue.description ?? "");
      setTimeout(() => {
        setDescError(false);
        setEditingDesc(false);
      }, 1500);
    }
  }

  function cancelEditDesc() {
    setDescDraft(issue?.description ?? "");
    setEditingDesc(false);
    setDescError(false);
  }

  // Status dropdown
  const closeStatus = useCallback(() => setStatusOpen(false), []);
  useClickOutside(statusDropdownRef, closeStatus);

  async function selectStatus(state: WorkflowState) {
    if (!issue) return;
    setStatusOpen(false);
    setSavingStatus(true);
    setStatusError(false);
    const updated = await patchIssue({ stateId: state.id });
    setSavingStatus(false);
    if (updated) {
      setIssue(updated);
    } else {
      setStatusError(true);
      setTimeout(() => setStatusError(false), 1500);
    }
  }

  // Priority dropdown
  const closePriority = useCallback(() => setPriorityOpen(false), []);
  useClickOutside(priorityDropdownRef, closePriority);

  async function selectPriority(value: number) {
    if (!issue) return;
    setPriorityOpen(false);
    setSavingPriority(true);
    setPriorityError(false);
    const updated = await patchIssue({ priority: value });
    setSavingPriority(false);
    if (updated) {
      setIssue(updated);
    } else {
      setPriorityError(true);
      setTimeout(() => setPriorityError(false), 1500);
    }
  }

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
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className={`detail-title-input${titleError ? " detail-error-flash" : ""}`}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") cancelEditTitle();
              }}
              onBlur={saveTitle}
              style={savingTitle ? { opacity: 0.6 } : undefined}
            />
          ) : (
            <h1
              className={`detail-title detail-editable${savingTitle ? " detail-saving" : ""}`}
              onClick={startEditTitle}
            >
              {issue.title}
            </h1>
          )}
          <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "1rem 0" }} />
          {editingDesc ? (
            <textarea
              ref={descTextareaRef}
              className={`detail-desc-textarea${descError ? " detail-error-flash" : ""}`}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEditDesc();
              }}
              onBlur={saveDesc}
              style={savingDesc ? { opacity: 0.6 } : undefined}
              rows={8}
            />
          ) : (
            <div
              className={`detail-editable${savingDesc ? " detail-saving" : ""}`}
              onClick={startEditDesc}
            >
              {issue.description ? (
                <div className="detail-description">{issue.description}</div>
              ) : (
                <p className="text-muted" style={{ fontStyle: "italic" }}>
                  No description
                </p>
              )}
            </div>
          )}
        </div>
        <aside className="detail-sidebar">
          <div ref={statusDropdownRef} style={{ position: "relative" }}>
            <span className="detail-meta-label">Status</span>
            <span
              className={`label-pill detail-editable${savingStatus ? " detail-saving" : ""}${statusError ? " detail-error-flash" : ""}`}
              style={{
                background: `${issue.state.color}18`,
                color: issue.state.color,
              }}
              onClick={() => setStatusOpen(!statusOpen)}
            >
              {issue.state.name}
            </span>
            {statusOpen && (
              <div className="detail-dropdown">
                {workflowStates.map((s) => (
                  <button
                    key={s.id}
                    className={`detail-dropdown-item${s.id === issue.state.id ? " detail-dropdown-active" : ""}`}
                    onClick={() => selectStatus(s)}
                  >
                    <span
                      className="detail-dropdown-dot"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div ref={priorityDropdownRef} style={{ position: "relative" }}>
            <span className="detail-meta-label">Priority</span>
            <span
              className={`detail-meta-value detail-editable${savingPriority ? " detail-saving" : ""}${priorityError ? " detail-error-flash" : ""}`}
              onClick={() => setPriorityOpen(!priorityOpen)}
            >
              {issue.priority > 0 && (
                <span
                  className={`priority-dot priority-dot-inline priority-${issue.priority}`}
                />
              )}
              {PRIORITY_LABELS[issue.priority] ?? "Unknown"}
            </span>
            {priorityOpen && (
              <div className="detail-dropdown">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`detail-dropdown-item${opt.value === issue.priority ? " detail-dropdown-active" : ""}`}
                    onClick={() => selectPriority(opt.value)}
                  >
                    {opt.value > 0 && (
                      <span
                        className={`priority-dot priority-dot-inline priority-${opt.value}`}
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
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
          {issue.agentMeta && (
            <div className="detail-agent-section">
              <span className="detail-meta-label">Agent</span>
              <div className="detail-agent-row">
                <span className="text-muted">Status</span>
                <span className={statusBadgeClass(issue.agentMeta)}>
                  {issue.agentMeta.alive ? "running" : issue.agentMeta.lastStatus}
                </span>
              </div>
              <div className="detail-agent-row">
                <span className="text-muted">Cost</span>
                <span
                  className="detail-cost"
                  style={{ color: costColor(issue.agentMeta.totalCost) }}
                >
                  ${issue.agentMeta.totalCost.toFixed(2)}
                </span>
              </div>
              <div className="detail-agent-row">
                <span className="text-muted">Attempt / Turn</span>
                <span className="detail-meta-value">
                  Attempt {issue.agentMeta.attempt} / Turn {issue.agentMeta.turn}
                </span>
              </div>
              <div className="detail-agent-row">
                <span className="text-muted">Duration</span>
                <span className="detail-meta-value">
                  {formatDuration(issue.agentMeta.durationSeconds)}
                </span>
              </div>
              <div className="detail-agent-row">
                <span className="text-muted">PR</span>
                <a
                  href={issue.agentMeta.prSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-linear-link"
                >
                  View PR →
                </a>
              </div>
            </div>
          )}
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
