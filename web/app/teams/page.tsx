"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamCard } from "../api/teams/route";

function TeamListSkeleton() {
  return (
    <main className="page">
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
        Teams
      </h1>
      <div className="team-list">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="team-row team-row-skeleton">
            <div className="team-row-icon">
              <span
                className="skeleton-line"
                style={{ width: "1.5rem", height: "1.5rem", borderRadius: "0.375rem" }}
              />
            </div>
            <div className="team-row-info" style={{ flex: 1 }}>
              <div className="skeleton-line skeleton-long" />
              <div
                className="skeleton-line skeleton-short"
                style={{ marginTop: "0.375rem" }}
              />
            </div>
            <div className="team-row-members">
              <div className="team-avatars">
                {Array.from({ length: 3 }, (_, j) => (
                  <span
                    key={j}
                    className="skeleton-line"
                    style={{
                      width: "1.5rem",
                      height: "1.5rem",
                      borderRadius: "9999px",
                      marginLeft: j > 0 ? "-0.375rem" : 0,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/teams", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setTeams(data.teams ?? []);
        } else {
          setTeams(data.teams ?? []);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to fetch teams");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading) return <TeamListSkeleton />;

  return (
    <main className="page">
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
        Teams
      </h1>

      {error && <div className="kanban-error">{error}</div>}

      {teams.length === 0 && !error ? (
        <div className="empty-state">No teams found</div>
      ) : (
        <div className="team-list">
          {teams.map((team) => (
            <button
              key={team.id}
              className="team-row"
              type="button"
              onClick={() => router.push(`/teams/${team.id}`)}
            >
              <div className="team-row-icon">
                <span
                  className="team-color-dot"
                  style={{ background: team.color ?? "var(--color-muted)" }}
                />
                {team.icon && <span className="team-icon">{team.icon}</span>}
              </div>

              <div className="team-row-info">
                <span className="team-row-name">{team.name}</span>
                <span className="team-row-key">{team.key}</span>
              </div>

              <div className="team-row-members">
                <div className="team-avatars">
                  {team.members.map((member, i) => (
                    member.avatarUrl ? (
                      <img
                        key={member.id}
                        src={member.avatarUrl}
                        alt={member.displayName}
                        className="team-avatar"
                        style={{ zIndex: team.members.length - i }}
                        title={member.displayName}
                      />
                    ) : (
                      <span
                        key={member.id}
                        className="team-avatar-placeholder"
                        style={{ zIndex: team.members.length - i }}
                        title={member.displayName}
                      >
                        {member.displayName.charAt(0)}
                      </span>
                    )
                  ))}
                </div>
                <span className="team-member-count">
                  {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
