# Architecture

See [CONCEPT.md](../../CONCEPT.md) for full architecture overview, diagrams, flows, and technical decisions.

## Module Map

```
src/
├── index.ts           # Entry point — calls tick()
├── config.ts          # Env vars, constants, logger
├── linear.ts          # Linear SDK wrapper — fetch, filter, sort issues
├── sentry.ts          # (planned) Sentry API — poll errors, create tickets
├── orchestrator.ts    # Tick logic — dispatch, reconcile, concurrency
├── workspace.ts       # Git worktree — create, reuse, cleanup, hooks
├── runner.ts          # interface AgentRunner + CliRunner (spawn claude -p)
├── lockfile.ts        # Lock read/write/remove, cleanup dead locks
└── prompt.ts          # Build prompt from issue + template
```

## Data Flow

```
Linear API ──► orchestrator.tick()
                  │
                  ├── linear.fetchCandidates()     → filter + sort
                  ├── lockfile.countRunning()       → concurrency check
                  ├── workspace.ensureWorktree()    → git worktree
                  ├── prompt.buildPrompt()          → render template
                  ├── runner.spawnAgent()            → claude -p
                  └── lockfile.writeLock()           → track PID
```

## Runtime State

```
~/.agent-harness/
├── locks/{ISSUE_ID}.json      # { pid, issueId, identifier, startedAt, attempt }
├── logs/{IDENTIFIER}.log      # Agent stdout/stderr
└── workspaces/{IDENTIFIER}/   # Git worktree per issue
```
