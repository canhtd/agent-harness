"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProjectCard } from "../api/projects/route";
import { STATUS_LABELS } from "./constants";
import { ProjectListSkeleton } from "./ProjectListSkeleton";
import { ProjectRow } from "./ProjectRow";

const STATUS_OPTIONS = [
  "All",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
] as const;

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterLead, setFilterLead] = useState<string>("All");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setProjects(data.projects ?? []);
        } else {
          setProjects(data.projects ?? []);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to fetch projects");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
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

  if (loading) return <ProjectListSkeleton />;

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
          {filtered.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      )}
    </main>
  );
}
