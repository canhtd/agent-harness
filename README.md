# Agent Harness

Agent orchestrator — polls Linear for Todo issues, spawns Claude Code CLI sessions in isolated git worktrees to implement each task. Bootstraps itself: the system builds its own features via Linear tickets.

Inspired by [Creao](https://x.com/intuitiveml) (Peter Pang) and [Symphony](https://openai.com) (OpenAI).

## How It Works

```
Linear issue (Todo)
  → Orchestrator polls every 5 min
  → Creates git worktree + spawns Claude Code CLI agent
  → Agent reads CLAUDE.md + issue → implements → tests → creates PR
  → CI runs (typecheck + test + e2e)
  → 3x AI review (quality, security, deps) via bot account
  → All pass → auto-merge (squash)
  → Orchestrator cleans up worktree
```

### Detailed Flows

#### 1. Feature / Task

1. Create a Todo issue on Linear (team `ENG`)
2. Orchestrator polls Linear every 5 minutes, picks issues by priority → created_at → identifier
3. Creates git worktree at `~/.agent-harness/workspaces/{IDENTIFIER}`
4. Spawns `claude -p --output-format stream-json --verbose` inside the worktree
5. Agent reads `PROMPT_DEFAULT.md` (Liquid template) + `CLAUDE.md` + `GOTCHAS.md`
6. Agent implements, runs `pnpm typecheck`, commits, pushes branch `agent/{IDENTIFIER}`, creates PR
7. GitHub Actions CI runs: typecheck + vitest + playwright e2e
8. Orchestrator detects open PR → triggers 3 AI reviewers in parallel (quality, security, deps)
9. Reviews use `GITHUB_BOT_TOKEN` (account `duccanh88`) to post approve/request-changes
10. CI pass + review approved → auto-merge workflow squash merges
11. Orchestrator cleans up worktree when issue reaches terminal state (Done/Canceled)

#### 2. Rework (PR rejected)

1. Reviewer requests changes → orchestrator detects
2. Issue transitions to Rework status
3. Orchestrator closes old PR, deletes remote branch, creates fresh worktree from `origin/main`
4. Agent reads `PROMPT_REWORK.md` — reviews feedback before re-implementing
5. Creates new PR → review → merge (same as feature flow)

#### 3. Automated Bug Fix (Sentry)

1. Sentry detects a new error
2. Orchestrator polls Sentry → creates Linear ticket (label `sentry-auto`, includes stack trace)
3. Deduplicates by Sentry issue fingerprint
4. Dispatches agent same as feature flow

#### 4. Hotfix (outside orchestrator)

For direct fixes that bypass the Linear issue flow (broken orchestrator, test fixes, etc.):

1. Create branch `fix/{description}`, commit, push
2. Create PR with `gh pr create`
3. Approve with bot token: `source .env && GH_TOKEN="$GITHUB_BOT_TOKEN" gh pr review <PR#> --approve -b "Hotfix: ..."`
4. Auto-merge workflow merges after CI passes

## Architecture

```
src/
  index.ts        — Orchestrator entry, poll loop
  linear.ts       — Linear API client
  sentry.ts       — Sentry API client
  runner.ts       — Agent runner (interface AgentRunner + CliRunner)
  workspace.ts    — Git worktree management
  lockfile.ts     — State tracking (~/.agent-harness/locks/)
  prompt.ts       — Prompt template rendering (Liquid)
  review.ts       — 3x AI code review (quality, security, deps)
  hooks.ts        — Workspace lifecycle hooks
  config.ts       — Config from env vars
  github.ts       — GitHub API helpers
```

### State

- Lockfile-based, no database: `~/.agent-harness/locks/{ISSUE_ID}.json`
- Tracks PID, attempt count, timestamps, review state
- Stateless per tick — orchestrator recovers from crash by re-reading lockfiles

### Key Design Choices

- **Poll-based** — both Linear and Sentry use polling, no webhooks
- **Git worktree isolation** — one worktree per issue, no conflicts
- **CLI over API** — Claude Code CLI for free tool layer (file ops, git, bash, MCP)
- **Bootstrapping** — Phase 0 written by hand, everything else built by the system itself via Linear tickets

## Setup

```bash
pnpm install
cp .env.example .env  # fill in LINEAR_API_KEY, GITHUB_BOT_TOKEN, etc.
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run orchestrator once (single tick) |
| `pnpm start` | Run orchestrator in poll loop (5 min) |
| `pnpm test` | Run vitest |
| `pnpm typecheck` | TypeScript type check |
| `pnpm lint` | ESLint |

## CI / Merge Flow

- **CI** (`.github/workflows/ci.yml`): typecheck → vitest → playwright e2e
- **Auto-merge** (`.github/workflows/auto-merge.yml`): enables `--squash --auto` on every PR
- **Branch protection**: requires CI pass + 1 review approval
- **Review account**: `duccanh88` (bot), uses `GITHUB_BOT_TOKEN`
