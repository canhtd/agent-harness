"use client";

import { useMemo, useState } from "react";
import type { ProjectCard } from "../api/projects/route";
import { STATUS_COLORS } from "./constants";

interface TimelineProps {
  projects: ProjectCard[];
}

interface MonthMarker {
  label: string;
  offset: number;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function Timeline({ projects }: TimelineProps) {
  const [tooltip, setTooltip] = useState<{
    project: ProjectCard;
    x: number;
    y: number;
  } | null>(null);

  const { rangeStart, totalDays, months } = useMemo(() => {
    const today = new Date();
    let earliest = today;
    let latest = today;

    for (const p of projects) {
      if (p.startDate) {
        const d = new Date(p.startDate + "T00:00:00");
        if (d < earliest) earliest = d;
      }
      if (p.targetDate) {
        const d = new Date(p.targetDate + "T00:00:00");
        if (d > latest) latest = d;
      }
    }

    const rangeStart = addMonths(startOfMonth(earliest), -1);
    const rangeEnd = addMonths(startOfMonth(latest), 2);
    const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 1);

    const months: MonthMarker[] = [];
    let cursor = startOfMonth(rangeStart);
    while (cursor < rangeEnd) {
      const offset = daysBetween(rangeStart, cursor) / totalDays;
      if (offset >= 0 && offset <= 1) {
        months.push({ label: formatMonthLabel(cursor), offset });
      }
      cursor = addMonths(cursor, 1);
    }

    return { rangeStart, totalDays, months };
  }, [projects]);

  const todayOffset = useMemo(() => {
    const today = new Date();
    const offset = daysBetween(rangeStart, today) / totalDays;
    return Math.max(0, Math.min(1, offset));
  }, [rangeStart, totalDays]);

  function getBarPosition(project: ProjectCard) {
    const MIN_SPAN_DAYS = 30;
    const todayStr = new Date().toISOString().slice(0, 10);

    let startStr = project.startDate;
    let endStr = project.targetDate;

    if (startStr && !endStr) {
      const d = new Date(startStr + "T00:00:00");
      d.setDate(d.getDate() + MIN_SPAN_DAYS);
      endStr = d.toISOString().slice(0, 10);
    } else if (!startStr && endStr) {
      const d = new Date(endStr + "T00:00:00");
      d.setDate(d.getDate() - MIN_SPAN_DAYS);
      startStr = d.toISOString().slice(0, 10);
    } else if (!startStr && !endStr) {
      startStr = todayStr;
      endStr = todayStr;
    }

    const start = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");

    const leftPct = daysBetween(rangeStart, start) / totalDays;
    const widthPct = Math.max(daysBetween(start, end) / totalDays, 0.005);

    return {
      left: `${Math.max(0, leftPct * 100)}%`,
      width: `${Math.min(widthPct * 100, 100 - Math.max(0, leftPct * 100))}%`,
    };
  }

  function getBarColor(project: ProjectCard): string {
    if (project.color) return project.color;
    return STATUS_COLORS[project.state.toLowerCase()] ?? "#6b7280";
  }

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <div className="timeline-label-col">Project</div>
        <div className="timeline-chart-col">
          {months.map((m) => (
            <div
              key={m.label}
              className="timeline-month-marker"
              style={{ left: `${m.offset * 100}%` }}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>

      <div className="timeline-body">
        <div
          className="timeline-today-line"
          style={{ left: `calc(200px + (100% - 200px) * ${todayOffset})` }}
        />

        {projects.length === 0 ? (
          <div className="empty-state">No projects match the current filters</div>
        ) : (
          projects.map((project) => {
            const pos = getBarPosition(project);
            const color = getBarColor(project);
            const progressPct = Math.round(project.progress * 100);
            const hasNoDates = !project.startDate && !project.targetDate;
            const hasSingleDate = (!project.startDate) !== (!project.targetDate);
            const isPartial = hasNoDates || hasSingleDate;

            return (
              <div key={project.id} className="timeline-row">
                <div className="timeline-row-label">
                  {project.color && (
                    <span
                      className="project-color-dot"
                      style={{ background: project.color }}
                    />
                  )}
                  <span className="timeline-row-name">{project.name}</span>
                </div>
                <div className="timeline-row-chart">
                  {hasNoDates ? (
                    <div
                      className="timeline-bar timeline-bar-no-dates"
                      style={{
                        left: `${todayOffset * 100}%`,
                        width: "2%",
                        background: `color-mix(in srgb, ${color} 30%, transparent)`,
                        borderLeft: `2px dashed ${color}`,
                      }}
                      onMouseEnter={(e) =>
                        setTooltip({ project, x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e) =>
                        setTooltip({ project, x: e.clientX, y: e.clientY })
                      }
                      onMouseLeave={() => setTooltip(null)}
                    />
                  ) : (
                    <div
                      className={`timeline-bar ${isPartial ? "timeline-bar-no-dates" : ""}`}
                      style={{
                        left: pos.left,
                        width: pos.width,
                        background: `color-mix(in srgb, ${color} ${isPartial ? 15 : 20}%, transparent)`,
                        borderLeft: isPartial ? `2px dashed ${color}` : undefined,
                      }}
                      onMouseEnter={(e) =>
                        setTooltip({ project, x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e) =>
                        setTooltip({ project, x: e.clientX, y: e.clientY })
                      }
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div
                        className="timeline-bar-fill"
                        style={{
                          width: `${progressPct}%`,
                          background: color,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {tooltip && (
        <div
          className="timeline-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="timeline-tooltip-name">{tooltip.project.name}</div>
          <div className="timeline-tooltip-meta">
            Status: {tooltip.project.state}
          </div>
          <div className="timeline-tooltip-meta">
            Progress: {Math.round(tooltip.project.progress * 100)}%
          </div>
          {tooltip.project.startDate && (
            <div className="timeline-tooltip-meta">
              Start: {formatDate(tooltip.project.startDate)}
            </div>
          )}
          {tooltip.project.targetDate && (
            <div className="timeline-tooltip-meta">
              Target: {formatDate(tooltip.project.targetDate)}
            </div>
          )}
          {!tooltip.project.startDate && !tooltip.project.targetDate && (
            <div className="timeline-tooltip-meta">No dates set</div>
          )}
        </div>
      )}
    </div>
  );
}
