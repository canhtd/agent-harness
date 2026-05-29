"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ReviewDetail, FileChange } from "../../api/reviews/[prNumber]/route";
import DiffViewer from "../diff-viewer";

function reviewLabel(decision: ReviewDetail["reviewDecision"]): {
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

function statusLabel(status: string): string {
  switch (status) {
    case "added":
      return "Added";
    case "removed":
      return "Deleted";
    case "renamed":
      return "Renamed";
    default:
      return "Modified";
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "added":
      return "review-detail-file-status-added";
    case "removed":
      return "review-detail-file-status-deleted";
    default:
      return "review-detail-file-status-modified";
  }
}

export default function PRDetailPage() {
  const params = useParams<{ prNumber: string }>();
  const prNumber = params.prNumber;

  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/reviews/${prNumber}`)
      .then(async (res) => {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setReview(data.review);
          setFiles(data.files);
        }
      })
      .catch(() => setError("Failed to fetch PR details"))
      .finally(() => setLoading(false));
  }, [prNumber]);

  const toggleFile = (filename: string) => {
    setCollapsed((prev) => ({ ...prev, [filename]: !prev[filename] }));
  };

  if (loading) {
    return (
      <main className="page">
        <Link href="/reviews" className="detail-back">
          &larr; Back to Reviews
        </Link>
        <div className="review-detail-header-skeleton">
          <div className="skeleton-line" style={{ width: "60%", height: "1.5rem", marginBottom: "0.5rem" }} />
          <div className="skeleton-line" style={{ width: "40%", height: "1rem", marginBottom: "1rem" }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="review-detail-file" style={{ marginBottom: "1rem" }}>
            <div className="review-detail-file-header">
              <span className="skeleton-line" style={{ width: "50%" }} />
            </div>
            <div style={{ padding: "1rem" }}>
              <div className="skeleton-line skeleton-long" style={{ marginBottom: "0.5rem" }} />
              <div className="skeleton-line skeleton-long" style={{ marginBottom: "0.5rem" }} />
              <div className="skeleton-line" style={{ width: "40%" }} />
            </div>
          </div>
        ))}
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <Link href="/reviews" className="detail-back">
          &larr; Back to Reviews
        </Link>
        <div className="review-error">{error}</div>
      </main>
    );
  }

  if (!review) return null;

  const badge = reviewLabel(review.reviewDecision);

  return (
    <main className="page">
      <Link href="/reviews" className="detail-back">
        &larr; Back to Reviews
      </Link>

      <div className="review-detail-header">
        <h1 className="review-detail-title">
          {review.title}
          <span className="review-detail-number"> #{review.number}</span>
        </h1>
        <div className="review-detail-meta">
          <span className="review-detail-branch-info">
            <code className="review-detail-branch-name">{review.headRefName}</code>
            <span className="review-detail-arrow">&rarr;</span>
            <code className="review-detail-branch-name">{review.baseRefName}</code>
          </span>
          <span className="review-detail-author">{review.author}</span>
          <span className={badge.className}>{badge.text}</span>
        </div>
      </div>

      {review.state === "MERGED" && (
        <div className="review-merged-banner">
          <span className="review-state-badge review-state-badge-merged">Merged</span>
          <span>
            This PR was merged
            {review.mergedAt && (
              <> on {new Date(review.mergedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
            )}
          </span>
        </div>
      )}

      {review.state === "CLOSED" && (
        <div className="review-closed-banner">
          <span className="review-state-badge review-state-badge-closed">Closed</span>
          <span>
            This PR was closed
            {review.closedAt && (
              <> on {new Date(review.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
            )}
          </span>
        </div>
      )}

      <div className="review-detail-files">
        <div className="review-detail-files-summary">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
          <span className="review-additions"> +{review.additions}</span>
          <span className="review-deletions"> -{review.deletions}</span>
        </div>

        {files.map((file) => {
          const isCollapsed = collapsed[file.filename] ?? false;
          return (
            <div key={file.filename} className="review-detail-file">
              <button
                className="review-detail-file-header"
                onClick={() => toggleFile(file.filename)}
                type="button"
              >
                <span className={`review-detail-file-chevron ${isCollapsed ? "review-detail-file-chevron-collapsed" : ""}`}>
                  &#9660;
                </span>
                <span className="review-detail-file-name">{file.filename}</span>
                <span className={`review-detail-file-status ${statusClass(file.status)}`}>
                  {statusLabel(file.status)}
                </span>
                <span className="review-detail-file-stat">
                  <span className="review-additions">+{file.additions}</span>
                  <span className="review-deletions"> -{file.deletions}</span>
                </span>
              </button>
              {!isCollapsed && (
                <div className="review-detail-file-diff">
                  <DiffViewer patch={file.patch} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
