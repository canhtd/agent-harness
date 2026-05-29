"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { TeamDetail } from "../../api/teams/[teamId]/route";
import type { TeamCycle } from "../../api/teams/[teamId]/cycles/route";

type CycleFilter = "all" | "current" | "upcoming";

function isCurrent(cycle: TeamCycle): boolean {
  const now = Date.now();
  return new Date(cycle.startsAt).getTime() <= now && now <= new Date(cycle.endsAt).getTime();
}

function isUpcoming(cycle: TeamCycle): boolean {
  return new Date(cycle.startsAt).getTime() > Date.now();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TeamDetailSkeleton() {
  return (
    <main className="page">
      <Link href="/teams" className="detail-back">
        &larr; Teams
      </Link>
      <div className="team-detail-header">
        <span
          className="skeleton-line"
          style={{ width: "2rem", height: "2rem", borderRadius: "0.375rem" }}
        />
        <div style={{ flex: 1 }}>
          <div className="skeleton-line" style={{ width: "40%", height: "1.25rem" }} />
          <div
            className="skeleton-line"
            style={{ width: "20%", height: "0.75rem", marginTop: "0.375rem" }}
          />
        </div>
      </div>
      <div className="team-detail-members">
        <div className="skeleton-line" style={{ width: "6rem", height: "0.75rem" }} />
        <div className="team-detail-members-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="team-detail-member">
              <span
                className="skeleton-line"
                style={{ width: "2rem", height: "2rem", borderRadius: "9999px" }}
              />
              <span className="skeleton-line" style={{ width: "5rem" }} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [cycles, setCycles] = useState<TeamCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"cycles" | "issues">("cycles");
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>("all");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/teams/${teamId}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setTeam(data.team);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to fetch team");
      })
      .finally(() => setLoading(false));

    fetch(`/api/teams/${teamId}/cycles`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!data.error) {
          setCycles(data.cycles ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setCyclesLoading(false));

    return () => controller.abort();
  }, [teamId]);

  const filteredCycles = cycles.filter((c) => {
    if (cycleFilter === "current") return isCurrent(c);
    if (cycleFilter === "upcoming") return isUpcoming(c);
    return true;
  });

  if (loading) return <TeamDetailSkeleton />;

  if (error || !team) {
    return (
      <main className="page">
        <Link href="/teams" className="detail-back">
          &larr; Teams
        </Link>
        <p className="empty-state">{error ?? "Team not found"}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <Link href="/teams" className="detail-back">
        &larr; Teams
      </Link>

      <div className="team-detail-header">
        <div className="team-detail-icon">
          <span
            className="team-color-dot"
            style={{
              background: team.color ?? "var(--color-muted)",
              width: "1rem",
              height: "1rem",
              borderRadius: "0.25rem",
            }}
          />
          {team.icon && <span style={{ fontSize: "1.5rem" }}>{team.icon}</span>}
        </div>
        <div>
          <h1 className="team-detail-name">{team.name}</h1>
          <span className="team-detail-key">{team.key}</span>
          {team.description && (
            <p className="team-detail-desc">{team.description}</p>
          )}
        </div>
      </div>

      <section className="team-detail-members">
        <h2 className="team-detail-section-title">
          Members ({team.members.length})
        </h2>
        <div className="team-detail-members-grid">
          {team.members.map((member) => (
            <div key={member.id} className="team-detail-member">
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.displayName}
                  className="team-detail-member-avatar"
                />
              ) : (
                <span className="team-detail-member-avatar-placeholder">
                  {member.displayName.charAt(0)}
                </span>
              )}
              <span className="team-detail-member-name">
                {member.displayName}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="team-detail-tabs">
        <button
          type="button"
          className={`team-detail-tab${activeTab === "cycles" ? " team-detail-tab-active" : ""}`}
          onClick={() => setActiveTab("cycles")}
        >
          Cycles
        </button>
        <button
          type="button"
          className="team-detail-tab team-detail-tab-disabled"
          disabled
          title="Coming soon"
        >
          Issues
        </button>
      </div>

      {activeTab === "cycles" && (
        <div className="cycle-content">
          <div className="cycle-filter-bar">
            {(["all", "current", "upcoming"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`cycle-filter-btn${cycleFilter === f ? " cycle-filter-btn-active" : ""}`}
                onClick={() => setCycleFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {cyclesLoading ? (
            <div className="cycle-list">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="cycle-row cycle-row-skeleton">
                  <div style={{ flex: 1 }}>
                    <div className="skeleton-line skeleton-long" />
                    <div
                      className="skeleton-line skeleton-short"
                      style={{ marginTop: "0.375rem" }}
                    />
                  </div>
                  <div className="cycle-progress-cell">
                    <div className="skeleton-line" style={{ width: "100%", height: "4px" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCycles.length === 0 ? (
            <div className="empty-state">No cycles found</div>
          ) : (
            <div className="cycle-list">
              {filteredCycles.map((cycle) => {
                const pct = Math.round(cycle.progress * 100);
                return (
                  <button
                    key={cycle.id}
                    type="button"
                    className="cycle-row"
                    onClick={() =>
                      router.push(`/teams/${teamId}/cycles/${cycle.id}`)
                    }
                  >
                    <div className="cycle-row-info">
                      <span className="cycle-row-name">
                        {cycle.name ?? `Cycle ${cycle.number}`}
                      </span>
                      <span className="cycle-row-dates">
                        {formatDate(cycle.startsAt)} &ndash;{" "}
                        {formatDate(cycle.endsAt)}
                      </span>
                    </div>
                    <div className="cycle-progress-cell">
                      <div className="cycle-progress-bar">
                        <div
                          className="cycle-progress-fill"
                          style={{
                            width: `${pct}%`,
                            background: pct === 100 ? "#16a34a" : "var(--color-accent)",
                          }}
                        />
                      </div>
                      <span className="cycle-progress-text">{pct}%</span>
                    </div>
                    <span className="cycle-scope-count">
                      {cycle.completedScopeCount}/{cycle.scopeCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
