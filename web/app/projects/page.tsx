"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProjectCard } from "../api/projects/route";

const STATUS_OPTIONS = [
  "All",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
] as const;

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  started: "Started",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
  backlog: "Backlog",
};

const STATUS_COLORS: Record<string, string> = {
  planned: "#6b7280",
  started: "#2563eb",
  paused: "#f59e0b",
  completed: "#16a34a",
  canceled: "#ef4444",
  backlog: "#9ca3af",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterLead, setFilterLead] = useState<string>("All");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  useEffect(() => {
    fetch("/api/projects")
      .then(async (res) => {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setProjects(data.projects ?? []);
        } else {
          setProjects(data.projects);
        }
      })
      .catch(() => setError("Failed to fetch projects"))
      .finally(() => setLoading(false));
  }, []);

  const uniqueLeads = useMemo(() => {
    const map = new Map<string, { id: string; displayName: string }>();
    for (const p of projects) {
      if (p.lead) {
        map.set(p.lead.id, { id: p.lead.id, displayName: p.lead.displayName });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filterStatus !== "All" && p.state.toLowerCase() !== filterStatus) {
        return false;
      }
      if (filterLead !== "All" && p.lead?.id !== filterLead) {
        return false;
      }
      if (filterDateFrom && p.targetDate) {
        if (p.targetDate < filterDateFrom) return false;
      }
      if (filterDateFrom && !p.targetDate) {
        return false;
      }
      if (filterDateTo && p.targetDate) {
        if (p.targetDate > filterDateTo) return false;
      }
      if (filterDateTo && !p.targetDate) {
        return false;
      }
      return true;
    });
  }, [projects, filterStatus, filterLead, filterDateFrom, filterDateTo]);

  if (loading) {
    return (
      <main className="page">
        <div className="project-filter-bar">
          <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
          <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
          <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
          <div className="skeleton-line" style={{ width: "120px", height: "32px" }} />
        </div>
        <div className="project-list">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="project-row project-row-skeleton">
              <div className="skeleton-line skeleton-short" />
              <div className="skeleton-line skeleton-long" />
              <div className="skeleton-line" style={{ width: "60px" }} />
              <div className="skeleton-line" style={{ width: "100px" }} />
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      {error && <div className="kanban-error">{error}</div>}

      <div className="project-filter-bar">
        <div className="project-filters">
          <select
            className="project-filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="All">All statuses</option>
            {STATUS_OPTIONS.filter((s) => s !== "All").map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>

          <select
            className="project-filter-select"
            value={filterLead}
            onChange={(e) => setFilterLead(e.target.value)}
          >
            <option value="All">All leads</option>
            {uniqueLeads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.displayName}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="project-filter-date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            title="From date"
          />
          <input
            type="date"
            className="project-filter-date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            title="To date"
          />
        </div>

        <div className="project-view-toggle">
          <button className="project-view-btn project-view-btn-active" type="button">
            List
          </button>
          <button
            className="project-view-btn"
            type="button"
            disabled
            title="Coming soon"
          >
            Timeline
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No projects match the current filters</div>
      ) : (
        <div className="project-list">
          {filtered.map((project) => {
            const statusColor = STATUS_COLORS[project.state.toLowerCase()] ?? "#6b7280";
            const statusLabel = STATUS_LABELS[project.state.toLowerCase()] ?? project.state;
            return (
              <div key={project.id} className="project-row">
                <div className="project-row-icon">
                  <span
                    className="project-color-dot"
                    style={{ background: project.color ?? statusColor }}
                  />
                  {project.icon && <span className="project-icon">{project.icon}</span>}
                </div>

                <div className="project-row-name">{project.name}</div>

                <span
                  className="project-status-badge"
                  style={{
                    background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                    color: statusColor,
                  }}
                >
                  {statusLabel}
                </span>

                <div className="project-progress-cell">
                  <div className="project-progress-bar">
                    <div
                      className="project-progress-fill"
                      style={{
                        width: `${Math.round(project.progress * 100)}%`,
                        background: statusColor,
                      }}
                    />
                  </div>
                  <span className="project-progress-text">
                    {Math.round(project.progress * 100)}%
                  </span>
                </div>

                <div className="project-row-lead">
                  {project.lead ? (
                    <>
                      {project.lead.avatarUrl ? (
                        <img
                          className="project-lead-avatar"
                          src={project.lead.avatarUrl}
                          alt={project.lead.displayName}
                        />
                      ) : (
                        <span className="project-lead-avatar-placeholder">
                          {project.lead.displayName.charAt(0)}
                        </span>
                      )}
                      <span className="project-lead-name">{project.lead.displayName}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </div>

                <div className="project-row-dates">
                  {formatShortDate(project.startDate)} → {formatShortDate(project.targetDate)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
