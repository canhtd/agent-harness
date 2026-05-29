"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { IssueDetail } from "../../api/issues/[identifier]/route";
import type { WorkflowState } from "../../api/issues/states/route";
import DetailSidebar from "./detail-sidebar";

export default function IssueDetailPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workflowStates, setWorkflowStates] = useState<WorkflowState[]>([]);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState(false);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [descError, setDescError] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
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
        body: JSON.stringify({ ...fields, issueId: issue?.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return null;
      return data.issue;
    },
    [identifier, issue?.id],
  );

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
          <hr style={{ border: "none", borderTop: "1px solid var(--border-primary)", margin: "1rem 0" }} />
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
        <DetailSidebar
          issue={issue}
          workflowStates={workflowStates}
          onPatch={patchIssue}
          onIssueUpdate={setIssue}
        />
      </div>
    </main>
  );
}
