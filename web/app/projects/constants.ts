export const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  started: "Started",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
  backlog: "Backlog",
};

export const STATUS_COLORS: Record<string, string> = {
  planned: "var(--status-todo)",
  started: "var(--status-in-progress)",
  paused: "var(--status-rework)",
  completed: "var(--status-done)",
  canceled: "var(--status-canceled)",
  backlog: "var(--status-todo)",
};
