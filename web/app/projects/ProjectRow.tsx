import type { ProjectCard } from "../api/projects/route";
import { STATUS_COLORS, STATUS_LABELS } from "./constants";

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProjectRow({ project }: { project: ProjectCard }) {
  const statusColor = STATUS_COLORS[project.state.toLowerCase()] ?? "#6b7280";
  const statusLabel = STATUS_LABELS[project.state.toLowerCase()] ?? project.state;

  return (
    <div className="project-row">
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
            style={{ width: `${Math.round(project.progress * 100)}%` }}
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
}
