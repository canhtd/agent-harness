import type { HealthData } from "../../app/api/health/route";
import type { IssueCard } from "../../app/api/issues/route";
import type { IssueDetail } from "../../app/api/issues/[identifier]/route";

export const mockHealth: HealthData = {
  running: 2,
  blocked: 0,
  successRate: 85,
  avgDuration: 320,
  maxDuration: 600,
  totalCost: 45.5,
  sessions: [
    {
      identifier: "ENG-55",
      stateName: "Todo",
      attempt: 1,
      turn: 0,
      startedAt: new Date().toISOString(),
      pid: 1234,
      alive: true,
    },
  ],
};

export const mockIssues: IssueCard[] = [
  {
    id: "1",
    identifier: "ENG-55",
    title: "Test issue todo",
    priority: 2,
    url: "https://linear.app/team/issue/ENG-55",
    status: "Todo",
    stateType: "unstarted",
    stateColor: "#8a8f98",
    column: "todo",
    assignee: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    identifier: "ENG-56",
    title: "Test issue working",
    priority: 1,
    url: "https://linear.app/team/issue/ENG-56",
    status: "In Progress",
    stateType: "started",
    stateColor: "#f2c94c",
    column: "working",
    assignee: { displayName: "Ada Lovelace", avatarUrl: null },
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "3",
    identifier: "ENG-57",
    title: "Test issue done",
    priority: 3,
    url: "https://linear.app/team/issue/ENG-57",
    status: "Done",
    stateType: "completed",
    stateColor: "#5e6ad2",
    column: "done",
    assignee: null,
    createdAt: "2026-01-03T00:00:00.000Z",
  },
];

export const mockIssueDetail: { issue: IssueDetail } = {
  issue: {
    id: "issue-1",
    identifier: "ENG-55",
    title: "Add Playwright E2E smoke tests",
    description: "Implement E2E smoke tests for all dashboard pages.",
    priority: 2,
    url: "https://linear.app/team/issue/ENG-55",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    state: { id: "state-1", name: "Todo", type: "unstarted", color: "#e2e2e2" },
    labels: [{ id: "label-1", name: "feature", color: "#0ea5e9" }],
    assignee: null,
    comments: [],
    history: [],
  },
};
