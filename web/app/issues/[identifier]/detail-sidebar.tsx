"use client";

import { useRef, useState, useCallback } from "react";
import type { IssueDetail } from "../../api/issues/[identifier]/route";
import type { WorkflowState } from "../../api/issues/states/route";
import {
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  formatDuration,
  costColor,
  statusBadgeClass,
  relativeTime,
  useClickOutside,
} from "./utils";

interface DetailSidebarProps {
  issue: IssueDetail;
  workflowStates: WorkflowState[];
  onPatch: (fields: Record<string, unknown>) => Promise<IssueDetail | null>;
  onIssueUpdate: (issue: IssueDetail) => void;
}

export default function DetailSidebar({ issue, workflowStates, onPatch, onIssueUpdate }: DetailSidebarProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState(false);

  const [priorityOpen, setPriorityOpen] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState(false);

  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  const closeStatus = useCallback(() => setStatusOpen(false), []);
  useClickOutside(statusDropdownRef, closeStatus);

  const closePriority = useCallback(() => setPriorityOpen(false), []);
  useClickOutside(priorityDropdownRef, closePriority);

  async function selectStatus(state: WorkflowState) {
    setStatusOpen(false);
    setSavingStatus(true);
    setStatusError(false);
    const updated = await onPatch({ stateId: state.id });
    setSavingStatus(false);
    if (updated) {
      onIssueUpdate(updated);
    } else {
      setStatusError(true);
      setTimeout(() => setStatusError(false), 1500);
    }
  }

  async function selectPriority(value: number) {
    setPriorityOpen(false);
    setSavingPriority(true);
    setPriorityError(false);
    const updated = await onPatch({ priority: value });
    setSavingPriority(false);
    if (updated) {
      onIssueUpdate(updated);
    } else {
      setPriorityError(true);
      setTimeout(() => setPriorityError(false), 1500);
    }
  }

  return (
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
  );
}
