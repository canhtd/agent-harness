"use client";

import { useEffect, useRef, useState } from "react";
import type { IssueCard } from "../api/issues/route";

const PRIORITIES = [
  { value: 0, label: "None" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (issue: IssueCard) => void;
}

export default function CreateIssueModal({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setPriority(3);
      setError(null);
      setTimeout(() => titleRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create issue");
        return;
      }
      onCreated(data.issue);
      onClose();
    } catch {
      setError("Failed to create issue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropClick}>
      <div className="modal-dialog" ref={dialogRef}>
        <div className="modal-header">
          <span>New Issue</span>
          <button className="modal-close-btn" onClick={onClose} type="button">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <label htmlFor="issue-title">Title *</label>
            <input
              ref={titleRef}
              id="issue-title"
              className="modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title..."
            />
          </div>
          <div className="modal-field">
            <label htmlFor="issue-description">Description</label>
            <textarea
              id="issue-description"
              className="modal-textarea"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
            />
          </div>
          <div className="modal-field">
            <label htmlFor="issue-priority">Priority</label>
            <select
              id="issue-priority"
              className="modal-select"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-btn-primary"
              disabled={!title.trim() || loading}
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
