"use client";

import type { IssueComment, IssueHistoryEntry } from "../../api/issues/[identifier]/route";
import { relativeTime } from "./utils";
import Markdown from "../../components/Markdown";
import StatusIcon from "../../components/StatusIcon";

const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low",
};

type ActivityItem =
  | { type: "comment"; ts: string; data: IssueComment }
  | { type: "history"; ts: string; data: IssueHistoryEntry };

function mergeAndSort(comments: IssueComment[], history: IssueHistoryEntry[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...comments.map((c) => ({ type: "comment" as const, ts: c.createdAt, data: c })),
    ...history.map((h) => ({ type: "history" as const, ts: h.createdAt, data: h })),
  ];
  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return items;
}

function describeHistory(h: IssueHistoryEntry): string | null {
  const actor = h.actor?.displayName ?? "Someone";
  if (h.fromState && h.toState) {
    return `${actor} changed status from ${h.fromState.name} to ${h.toState.name}`;
  }
  if (h.toState) {
    return `${actor} set status to ${h.toState.name}`;
  }
  if (h.fromPriority != null && h.toPriority != null) {
    return `${actor} changed priority from ${PRIORITY_LABELS[h.fromPriority] ?? "Unknown"} to ${PRIORITY_LABELS[h.toPriority] ?? "Unknown"}`;
  }
  if (h.fromAssignee && h.toAssignee) {
    return `${actor} reassigned from ${h.fromAssignee.displayName} to ${h.toAssignee.displayName}`;
  }
  if (h.toAssignee) {
    return `${actor} assigned to ${h.toAssignee.displayName}`;
  }
  if (h.fromAssignee && !h.toAssignee) {
    return `${actor} unassigned ${h.fromAssignee.displayName}`;
  }
  return null;
}

interface ActivityProps {
  comments: IssueComment[];
  history: IssueHistoryEntry[];
}

export default function Activity({ comments, history }: ActivityProps) {
  const items = mergeAndSort(comments, history);

  if (items.length === 0) {
    return (
      <div className="activity-section">
        <h3 className="activity-title">Activity</h3>
        <p className="text-muted" style={{ fontSize: "0.875rem" }}>No activity yet</p>
      </div>
    );
  }

  return (
    <div className="activity-section">
      <h3 className="activity-title">Activity</h3>
      <div className="activity-timeline">
        {items.map((item) => {
          if (item.type === "comment") {
            const c = item.data;
            return (
              <div key={c.id} className="activity-item activity-comment">
                <div className="activity-avatar">
                  {c.user?.avatarUrl ? (
                    <img src={c.user.avatarUrl} alt="" className="activity-avatar-img" />
                  ) : (
                    <div className="activity-avatar-placeholder" />
                  )}
                </div>
                <div className="activity-content">
                  <div className="activity-header">
                    <span className="activity-actor">{c.user?.displayName ?? "Unknown"}</span>
                    <span className="activity-time">{relativeTime(c.createdAt)}</span>
                  </div>
                  <Markdown content={c.body} className="activity-comment-body" />
                </div>
              </div>
            );
          }
          const h = item.data;
          const desc = describeHistory(h);
          if (!desc) return null;
          return (
            <div key={h.id} className="activity-item activity-event">
              <div className="activity-dot-wrapper">
                {h.toState ? (
                  <StatusIcon type={h.toState.name.toLowerCase().includes("done") ? "completed" : h.toState.name.toLowerCase().includes("cancel") ? "canceled" : "started"} color={h.toState.color} size={12} />
                ) : (
                  <div className="activity-dot" />
                )}
              </div>
              <div className="activity-event-text">
                <span>{desc}</span>
                <span className="activity-time">{relativeTime(h.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
