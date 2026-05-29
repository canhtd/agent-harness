"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ReviewCard } from "../api/reviews/route";

type StateFilter = "open" | "merged" | "all";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function reviewLabel(decision: ReviewCard["reviewDecision"]): {
  text: string;
  className: string;
} {
  switch (decision) {
    case "APPROVED":
      return { text: "Approved", className: "review-badge review-badge-approved" };
    case "CHANGES_REQUESTED":
      return { text: "Changes Requested", className: "review-badge review-badge-changes" };
    default:
      return { text: "Pending", className: "review-badge review-badge-pending" };
  }
}

function stateBadge(status: string): { text: string; className: string } {
  const s = status.toUpperCase();
  if (s === "MERGED")
    return { text: "Merged", className: "pr-state-badge pr-state-badge-merged" };
  if (s === "CLOSED")
    return { text: "Closed", className: "pr-state-badge pr-state-badge-closed" };
  return { text: "Open", className: "pr-state-badge pr-state-badge-open" };
}

const EMPTY_MESSAGES: Record<StateFilter, string> = {
  open: "No open pull requests",
  merged: "No merged pull requests",
  all: "No pull requests",
};

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StateFilter>("open");
  const router = useRouter();

  const fetchReviews = useCallback((state: StateFilter) => {
    setLoading(true);
    setError(null);
    fetch(`/api/reviews?state=${state}`)
      .then(async (res) => {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setReviews(data.reviews);
        }
      })
      .catch(() => setError("Failed to fetch reviews"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchReviews(activeTab);
  }, [activeTab, fetchReviews]);

  const handleTabClick = (tab: StateFilter) => {
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  };

  const tabs: { key: StateFilter; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "merged", label: "Merged" },
    { key: "all", label: "All" },
  ];

  return (
    <main className="page">
      <h1 className="review-page-title">Reviews</h1>

      <div className="review-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`review-tab${activeTab === tab.key ? " review-tab-active" : ""}`}
            onClick={() => handleTabClick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="review-list">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="review-row review-row-skeleton">
              <span className="skeleton-line skeleton-short" />
              <span className="skeleton-line skeleton-long" />
              <span className="skeleton-line" style={{ width: "5rem" }} />
              <span className="skeleton-line" style={{ width: "4rem" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="review-error">{error}</div>
      ) : reviews.length === 0 ? (
        <div className="empty-state">{EMPTY_MESSAGES[activeTab]}</div>
      ) : (
        <div className="review-list">
          {reviews.map((pr) => {
            const badge = reviewLabel(pr.reviewDecision);
            const state = stateBadge(pr.status);
            return (
              <button
                key={pr.number}
                className="review-row"
                onClick={() => router.push(`/reviews/${pr.number}`)}
                type="button"
              >
                <span className="review-number">#{pr.number}</span>
                <span className={state.className}>{state.text}</span>
                <span className="review-title">{pr.title}</span>
                <span className="review-branch">{pr.branch}</span>
                <span className={badge.className}>{badge.text}</span>
                <span className="review-author">{pr.author}</span>
                <span className="review-stat">
                  <span className="review-additions">+{pr.additions}</span>
                  <span className="review-deletions">-{pr.deletions}</span>
                </span>
                <span className="review-time">{relativeTime(pr.createdAt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
