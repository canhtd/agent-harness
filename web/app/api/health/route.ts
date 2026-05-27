import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

interface Lock {
  pid: number;
  issueId: string;
  identifier: string;
  startedAt: string;
  attempt: number;
  turn?: number;
  exitCode?: number;
  lastExitCode?: number;
  notBefore?: string;
  stateName?: string;
}

export interface SessionInfo {
  identifier: string;
  stateName: string;
  attempt: number;
  turn: number;
  startedAt: string;
  pid: number;
  alive: boolean;
}

export interface HealthData {
  running: number;
  blocked: number;
  successRate: number;
  avgDuration: number;
  maxDuration: number;
  totalCost: number;
  sessions: SessionInfo[];
}

function isAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const locksDir =
    process.env.LOCKS_DIR ||
    join(homedir(), ".agent-harness", "locks");
  const tokensPath =
    process.env.TOKENS_LOG_PATH ||
    join(homedir(), ".agent-harness", "logs", "tokens.jsonl");

  const sessions: SessionInfo[] = [];
  let running = 0;
  let blocked = 0;

  try {
    const files = await readdir(locksDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(locksDir, file), "utf-8");
        const lock: Lock = JSON.parse(raw);
        const alive = isAlive(lock.pid);
        sessions.push({
          identifier: lock.identifier,
          stateName: lock.stateName ?? "unknown",
          attempt: lock.attempt,
          turn: lock.turn ?? 0,
          startedAt: lock.startedAt,
          pid: lock.pid,
          alive,
        });
        if (alive) running++;
        else if (lock.exitCode != null && lock.exitCode !== 0) blocked++;
      } catch {
        // skip malformed lock files
      }
    }
  } catch {
    // locks dir doesn't exist yet
  }

  let successRate = 0;
  let avgDuration = 0;
  let maxDuration = 0;
  let totalCost = 0;

  try {
    const content = await readFile(tokensPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    let completed = 0;
    let totalDuration = 0;
    let count = 0;

    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as {
          status?: string;
          duration_seconds?: number;
          estimated_cost_usd?: number;
        };
        count++;
        if (rec.status === "completed") completed++;
        const dur = rec.duration_seconds ?? 0;
        totalDuration += dur;
        if (dur > maxDuration) maxDuration = dur;
        totalCost += rec.estimated_cost_usd ?? 0;
      } catch {
        // skip malformed lines
      }
    }

    if (count > 0) {
      successRate = Math.round((completed / count) * 100);
      avgDuration = Math.round(totalDuration / count);
    }
  } catch {
    // tokens file doesn't exist yet
  }

  sessions.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const data: HealthData = {
    running,
    blocked,
    successRate,
    avgDuration,
    maxDuration,
    totalCost,
    sessions,
  };

  return NextResponse.json(data);
}
