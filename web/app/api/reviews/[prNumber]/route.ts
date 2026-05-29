import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ReviewDetail {
  number: number;
  title: string;
  body: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "";
  additions: number;
  deletions: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export interface FileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ prNumber: string }> },
) {
  const { prNumber } = await params;

  const num = parseInt(prNumber, 10);
  if (isNaN(num) || num <= 0) {
    return NextResponse.json(
      { error: "Invalid PR number" },
      { status: 400 },
    );
  }

  const repo = process.env.GITHUB_REPO || "canhtd/agent-harness";

  try {
    const [metaResult, filesResult] = await Promise.all([
      execFileAsync("gh", [
        "pr",
        "view",
        String(num),
        "--json",
        "number,title,body,state,headRefName,baseRefName,author,reviewDecision,additions,deletions,createdAt,updatedAt,mergedAt,closedAt",
      ]),
      execFileAsync("gh", [
        "api",
        `repos/${repo}/pulls/${num}/files`,
        "--paginate",
      ]),
    ]);

    const rawMeta = JSON.parse(metaResult.stdout) as {
      number: number;
      title: string;
      body: string;
      state: string;
      headRefName: string;
      baseRefName: string;
      author: { login: string };
      reviewDecision: string;
      additions: number;
      deletions: number;
      createdAt: string;
      updatedAt: string;
      mergedAt: string | null;
      closedAt: string | null;
    };

    const review: ReviewDetail = {
      number: rawMeta.number,
      title: rawMeta.title,
      body: rawMeta.body,
      state: rawMeta.state,
      headRefName: rawMeta.headRefName,
      baseRefName: rawMeta.baseRefName,
      author: rawMeta.author.login,
      reviewDecision: (rawMeta.reviewDecision || "") as ReviewDetail["reviewDecision"],
      additions: rawMeta.additions,
      deletions: rawMeta.deletions,
      createdAt: rawMeta.createdAt,
      updatedAt: rawMeta.updatedAt,
      mergedAt: rawMeta.mergedAt ?? null,
      closedAt: rawMeta.closedAt ?? null,
    };

    const rawFiles = JSON.parse(filesResult.stdout) as Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;

    const files: FileChange[] = rawFiles.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? "",
    }));

    return NextResponse.json({ review, files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch PR #${num}: ${message}` },
      { status: 500 },
    );
  }
}
