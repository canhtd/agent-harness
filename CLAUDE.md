# Project Contract

## Build And Test

- Install: `pnpm install`
- Dev: `pnpm dev` (runs orchestrator once, single tick)
- Test: `pnpm test` (vitest)
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

## What This Is

Agent orchestrator — polls Linear for Todo issues, spawns Claude Code CLI sessions in isolated git worktrees to implement each task. Inspired by Creao (Peter Pang) and OpenAI Symphony. Bootstraps itself: the system builds its own features via Linear tickets.

## Architecture Boundaries

- Orchestrator entry lives in `src/index.ts`
- Linear/Sentry clients live in `src/linear.ts`, `src/sentry.ts`
- Agent runner abstraction lives in `src/runner.ts` (interface AgentRunner + CliRunner)
- Workspace management lives in `src/workspace.ts`
- State tracking lives in `src/lockfile.ts`
- Prompt building lives in `src/prompt.ts`
- Config lives in `src/config.ts`
- Do not put orchestration logic in runner or workspace modules
- Each module has a single responsibility — orchestrator coordinates, modules execute

## Coding Conventions

- TypeScript strict mode
- Prefer pure functions, pass dependencies explicitly
- Use `interface` for abstractions that may have multiple implementations (e.g., AgentRunner)
- Structured logging with pino — always include `issueId` and `issueIdentifier` in log context
- No classes unless state encapsulation is genuinely needed

## Key Patterns

- **Poll-based**: orchestrator runs on interval (cron or setTimeout), each tick is stateless
- **Lockfile state**: `~/.agent-harness/locks/{ISSUE_ID}.json` tracks PID, attempt count, timestamps — no database
- **Git worktree isolation**: one worktree per issue at `~/.agent-harness/workspaces/{IDENTIFIER}`
- **Dispatch ordering**: priority ascending (1-4, null=last) → created_at oldest → identifier lexicographic
- **Blocked issues**: skip if any blocker is not in terminal state

## Gotchas

Read [GOTCHAS.md](GOTCHAS.md) before starting any task — contains known pitfalls from prior work.
Read [PLANS.md](PLANS.md) for project phases and progress.

## Safety Rails

### NEVER

- Modify `.env`, lockfiles format, or CI config without explicit approval
- Spawn more than 10 concurrent agents
- Merge PRs without CI pass + human review (v1)
- Put secrets in code — Linear API key comes from environment

### ALWAYS

- Show diff before committing
- Run `pnpm typecheck` before marking work complete
- Include `issueId` in all log entries
- Clean up worktrees for terminal issues

## Verification

- Logic changes: `pnpm typecheck` + `pnpm lint`
- Orchestrator changes: run single tick against Linear, confirm correct dispatch
- Runner changes: spawn 1 agent, confirm worktree created + lockfile written + agent exits cleanly

## Compact Instructions

Preserve:

1. Architecture decisions (NEVER summarize)
2. Modified files and key changes
3. Current verification status (pass/fail commands)
4. Open risks, TODOs, rollback notes
