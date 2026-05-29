import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ReviewCard {
  number: number;
  title: string;
  author: string;
  branch: string;
  status: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "";
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
}

export async function GET() {
  try {
    const { stdout } = await execFileAsync("gh", [
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,state,createdAt,updatedAt,headRefName,baseRefName,author,reviewDecision,additions,deletions,changedFiles",
    ]);

    const raw = JSON.parse(stdout) as Array<{
      number: number;
      title: string;
      state: string;
      createdAt: string;
      updatedAt: string;
      headRefName: string;
      baseRefName: string;
      author: { login: string };
      reviewDecision: string;
      additions: number;
      deletions: number;
      changedFiles: number;
    }>;

    const reviews: ReviewCard[] = raw.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author.login,
      branch: pr.headRefName,
      status: pr.state,
      reviewDecision: (pr.reviewDecision || "") as ReviewCard["reviewDecision"],
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      createdAt: pr.createdAt,
    }));

    return NextResponse.json({ reviews });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch PRs: ${message}` },
      { status: 500 },
    );
  }
}
