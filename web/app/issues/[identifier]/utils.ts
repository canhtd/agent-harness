import { useEffect } from "react";
import type { AgentMeta } from "../../api/issues/[identifier]/route";

export const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export const PRIORITY_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

export function costColor(cost: number): string {
  if (cost < 20) return "var(--color-cost-green)";
  if (cost < 50) return "var(--color-cost-yellow)";
  return "var(--color-cost-red)";
}

export function statusBadgeClass(meta: AgentMeta): string {
  if (meta.alive) return "status-badge status-completed";
  if (meta.lastStatus === "completed") return "status-badge status-completed";
  if (meta.lastStatus === "failed") return "status-badge status-failed";
  return "status-badge status-unknown";
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, handler]);
}
