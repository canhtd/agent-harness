# Agent Harness Service Specification

Status: Draft v1

Purpose: Define a service that orchestrates Claude Code agents to implement Linear issues autonomously.

Inspired by [OpenAI Symphony](https://github.com/openai/symphony). Adapted for Claude Code CLI,
lockfile-based state, and git worktree isolation.

## Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and
`OPTIONAL` in this document are to be interpreted as described in RFC 2119.

`Implementation-defined` means the behavior is part of the implementation contract, but this
specification does not prescribe one universal policy.

## 1. Problem Statement

Agent Harness is a long-running automation service that continuously reads work from Linear, creates
an isolated git worktree for each issue, and runs a Claude Code CLI session for that issue inside the
worktree.

The service solves four operational problems:

- It turns issue execution into a repeatable daemon workflow instead of manual scripts.
- It isolates agent execution in per-issue git worktrees so agents work on independent branches.
- It keeps the agent contract in-repo (`CLAUDE.md`, `.claude/rules/`) so teams version agent
  behavior with their code.
- It provides structured logging to operate and debug multiple concurrent agent runs.

Important boundary:

- Agent Harness is a scheduler/runner and tracker reader.
- Ticket writes (comments, PR creation) are primarily performed by the coding agent using CLI tools
  (`gh`, `git`) available in the worktree environment.
- The orchestrator writes to Linear in two cases: transitioning merged issues to Done
  (reconciliation loop) and creating Sentry-triggered issues.
- A successful run ends when the agent creates a PR. The reconciliation loop then monitors the PR
  and transitions the issue to Done when merged.

## 2. Goals and Non-Goals

### 2.1 Goals

- Poll Linear on a fixed cadence and dispatch work with bounded concurrency.
- Maintain lockfile-based state for dispatch, retries, and process tracking.
- Create deterministic per-issue git worktrees and reuse them across retries.
- Stop active runs when issue state transitions to terminal.
- Recover from agent crashes with exponential backoff.
- Load prompt templates from repository-owned `WORKFLOW.md` files with Liquid rendering.
- Expose operator-visible observability via structured logs (pino).
- Support filesystem-driven restart recovery without requiring a persistent database.
- Auto-create Linear issues from Sentry errors for closed-loop bug fixing.
- Reconcile PR outcomes back to Linear: auto-transition merged PRs to Done, re-dispatch agents for
  CI failures or merge conflicts.

### 2.2 Non-Goals

- Web UI or multi-tenant control plane.
- General-purpose workflow engine or distributed job scheduler.
- Built-in business logic for how to edit tickets or PRs. (That logic lives in the agent prompt and
  CLAUDE.md.)
- Agent sandboxing beyond what Claude Code and the host OS provide.

## 3. System Overview

### 3.1 Main Components

1. `Entry Point` (`src/index.ts`)
   - Parses `--once` flag for single-tick mode.
   - Sets up polling loop with `setInterval`.
   - Wraps tick in error handler.

2. `Config Layer` (`src/config.ts`)
   - Reads environment variables into typed config object.
   - Defines filesystem paths for locks, workspaces, and logs.
   - Creates pino logger instance.

3. `Issue Tracker Client` (`src/linear.ts`)
   - Fetches candidate issues in active states (`Todo`, `Rework`).
   - Filters blocked issues via `inverseRelations`.
   - Fetches issue state by ID or identifier for reconciliation.

4. `Orchestrator` (`src/orchestrator.ts`)
   - Owns the poll tick.
   - Decides which issues to dispatch based on lockfile state and concurrency limits.
   - Runs stall detection, cleanup, terminal reconciliation, and dispatch in sequence.
   - Executes workspace lifecycle hooks.

5. `Workspace Manager` (`src/workspace.ts`)
   - Maps issue identifiers to git worktree paths.
   - Creates new worktrees from `origin/main` with dedicated branches.
   - Cleans up stale branches before worktree creation.
   - Removes worktrees for terminal issues.

6. `Agent Runner` (`src/runner.ts`)
   - Builds prompt from issue metadata and workflow template.
   - Spawns Claude Code CLI as a detached subprocess (`spawnAgent`).
   - Spawns continuation agents with `--continue` flag (`spawnContinuation`).
   - Writes exit code to lockfile directory for post-mortem pickup.

7. `GitHub Integration` (`src/github.ts`)
   - Checks PR status for a given issue branch via `gh pr list`.
   - Returns structured outcome: `done` (merged), `skip` (CI pending or awaiting review),
     `redispatch` (CI failed, merge conflicts, no PR, or PR closed).
   - Used by the reconciliation loop to decide next action.

8. `Lockfile State` (`src/lockfile.ts`)
   - Tracks agent process state via JSON files on disk.
   - Provides cleanup, stall detection, backoff computation, and running count.
   - Replaces in-memory orchestrator state from Symphony.

9. `Prompt Builder` (`src/prompt.ts`)
   - Renders `WORKFLOW.md` or `WORKFLOW_REWORK.md` templates with Liquid.
   - Falls back to hardcoded prompts when template files are absent.
   - Builds continuation prompts for reconciliation re-dispatches.
   - Passes `issue` and `attempt` as template variables.

10. `Hooks System` (`src/hooks.ts`)
   - Loads hook scripts from `WORKFLOW.md` front matter or environment variables.
   - Executes hooks at workspace lifecycle points with timeout enforcement.

11. `Sentry Integration` (`src/sentry.ts`)
    - Polls Sentry for unresolved issues.
    - Creates Linear issues with `sentry-auto` label for each new Sentry error.
    - Deduplicates via description-based search.

12. `Logging` (pino)
    - Emits structured JSON logs to stdout.
    - All issue-related logs include `issueId` and `issueIdentifier`.

### 3.2 Abstraction Levels

1. `Policy Layer` (repo-defined)
   - `CLAUDE.md` and `.claude/rules/*.md` — agent behavioral contract.
   - `WORKFLOW.md` / `WORKFLOW_REWORK.md` — prompt templates and hook config.

2. `Configuration Layer` (environment + front matter)
   - Environment variables for secrets and runtime settings.
   - `WORKFLOW.md` YAML front matter for hook scripts and timeouts.

3. `Coordination Layer` (orchestrator)
   - Polling loop, issue eligibility, concurrency, retries, reconciliation.

4. `Execution Layer` (workspace + agent subprocess)
   - Git worktree lifecycle, Claude Code CLI spawn, exit code collection.

5. `Integration Layer` (Linear + Sentry adapters)
   - Linear SDK client for issue queries.
   - Sentry REST API for error polling.

6. `Observability Layer` (pino structured logs)
   - Operator visibility into orchestrator and agent behavior.

### 3.3 External Dependencies

- Linear API (`@linear/sdk`) for issue tracking.
- Local filesystem for worktrees, lockfiles, and logs.
- Git CLI for worktree management.
- Claude Code CLI (`claude -p`) for agent execution.
- Sentry API (OPTIONAL) for error-to-ticket automation.
- GitHub CLI (`gh`) used by agents for PR creation AND by the orchestrator for PR status checks
  (reconciliation loop).

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 Issue

Normalized issue record used by orchestration, prompt rendering, and logging.

Fields:

- `id` (string)
  - Stable Linear-internal UUID.
- `identifier` (string)
  - Human-readable ticket key (example: `ENG-123`).
- `title` (string)
- `description` (string or null)
- `priority` (integer or undefined)
  - Linear priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low.
  - Lower non-zero numbers are higher priority in dispatch sorting.
  - 0 and undefined sort last.
- `labels` (list of strings)
- `stateName` (string)
  - Current Linear state name (e.g., `Todo`, `Rework`, `Done`).

#### 4.1.2 Lock

Filesystem-persisted state for one agent run.

Fields:

- `pid` (number)
  - OS process ID of the spawned shell.
- `issueId` (string)
- `identifier` (string)
- `startedAt` (ISO 8601 string)
- `attempt` (number, 1-based)
- `turn` (number or undefined)
  - Current continuation turn within the reconciliation loop. Starts at 1 on initial dispatch,
    incremented on each re-dispatch. Capped by `maxTurns`.
- `exitCode` (number or undefined)
  - Set after agent exits and cleanup runs. Exit code 0 keeps the lock (for reconciliation pickup).
    Non-zero applies backoff.
- `notBefore` (ISO 8601 string or undefined)
  - Earliest time this issue may be re-dispatched (backoff).
- `stateName` (string or undefined)
  - Linear state at dispatch time, used for per-state concurrency.

Storage: `~/.agent-harness/locks/{ISSUE_ID}.json`

#### 4.1.3 Exit Code File

Temporary file written by the agent shell wrapper.

Path: `~/.agent-harness/locks/{ISSUE_ID}.exit`

Content: integer exit code of `claude -p` as a string.

Lifecycle: created by the `sh -c 'claude -p "$1"; echo $? > "$2"'` wrapper, consumed and deleted by
`cleanup()`.

#### 4.1.4 Workspace

Git worktree assigned to one issue identifier.

Fields (logical):

- `path` (absolute filesystem path)
  - `~/.agent-harness/workspaces/{sanitized_identifier}`
- `workspace_key` (sanitized issue identifier)
- `created` (boolean)
  - `true` only if the worktree was created during this call.

Branch naming: `agent/{sanitized_identifier}`

#### 4.1.5 Hooks Config

Workspace lifecycle hook configuration.

Fields:

- `after_create` (shell script string or undefined)
- `before_run` (shell script string)
  - Default: `git fetch origin && git rebase origin/main`
- `after_run` (shell script string or undefined)
- `before_remove` (shell script string or undefined)
- `timeout` (number, seconds)
  - Default: `60`

Source precedence: environment variable > `WORKFLOW.md` front matter > built-in default.

#### 4.1.6 Workflow File

Parsed `WORKFLOW.md` or `WORKFLOW_REWORK.md` payload.

Fields:

- `config` (key-value map from YAML front matter)
- `body` (Liquid template string, trimmed)

### 4.2 Stable Identifiers and Normalization Rules

- `Issue ID`
  - Use for lockfile filenames and Linear API lookups.
- `Issue Identifier`
  - Use for human-readable logs, workspace directory names, and branch names.
- `Workspace Key`
  - Derive from `issue.identifier` by replacing any character not in `[A-Za-z0-9._-]` with `_`.
  - Use the sanitized value for the workspace directory name and git branch suffix.
- `Terminal States`
  - `Done`, `Canceled`, `Cancelled`, `Duplicate`.
  - Compared by exact string match.

## 5. Workflow Specification (Repository Contract)

### 5.1 File Discovery

Prompt template files are resolved relative to `config.repoPath`:

1. For `Rework` state issues: `WORKFLOW_REWORK.md`
2. For all other issues: `WORKFLOW.md`
3. If the template file cannot be read, fall back to a hardcoded default prompt.

### 5.2 File Format

Workflow files are Markdown with OPTIONAL YAML front matter.

Parsing rules:

- If file starts with `---`, parse lines until the next `---` as key-value pairs.
- Remaining lines become the prompt body.
- If front matter is absent, treat the entire file as prompt body.
- Prompt body is rendered with Liquid template engine before use.

### 5.3 Front Matter Schema (Hooks)

Hook fields in `WORKFLOW.md` front matter:

- `hook_after_create` (shell script string, OPTIONAL)
- `hook_before_run` (shell script string, OPTIONAL)
- `hook_after_run` (shell script string, OPTIONAL)
- `hook_before_remove` (shell script string, OPTIONAL)
- `hook_timeout` (integer seconds, OPTIONAL)

Environment variable overrides:

- `HOOK_AFTER_CREATE`, `HOOK_BEFORE_RUN`, `HOOK_AFTER_RUN`, `HOOK_BEFORE_REMOVE`, `HOOK_TIMEOUT`

### 5.4 Prompt Template Contract

The Markdown body of the workflow file is the per-issue prompt template.

Rendering:

- Template engine: Liquid (via `liquidjs`).
- Unknown variables are silently rendered as empty (Liquid default behavior).

Template input variables:

- `issue` (object)
  - `id`, `identifier`, `title`, `description`, `priority`, `labels`, `stateName`
- `attempt` (integer or null)
  - `null` on first attempt.
  - Integer >= 2 on retry.

### 5.5 Fallback Prompts

When no workflow file exists, hardcoded prompts are used.

Default prompt (Todo state):
1. Read CLAUDE.md and GOTCHAS.md
2. Implement the task
3. Verify every acceptance criterion
4. Run `pnpm typecheck`
5. `git add` + commit + push
6. Create PR with `gh pr create`

Rework prompt:
1. Read CLAUDE.md and GOTCHAS.md
2. Find existing PR for this issue
3. Read all review comments
4. Close the old PR
5. Create fresh branch from `origin/main`
6. Re-implement addressing all review feedback
7. Create new PR referencing the old one

Both prompts include: `You are running autonomously — do not ask for confirmation.`

## 6. Configuration Specification

### 6.1 Environment Variables

REQUIRED:

- `LINEAR_API_KEY` — Linear API token. MUST NOT be logged or committed.
- `LINEAR_TEAM_KEY` — Linear team key for issue filtering (e.g., `ENG`).

OPTIONAL:

- `LINEAR_PROJECT_SLUG` — Additional project-level scope. Default: none.
- `REPO_PATH` — Path to the git repository. Default: `process.cwd()`.
- `POLL_INTERVAL_MS` — Polling interval in milliseconds. Default: `300000` (5 minutes).
- `STALL_TIMEOUT_MS` — Agent idle kill threshold in milliseconds. Default: `180000` (3 minutes).
- `MAX_TURNS` — Maximum continuation turns per issue in reconciliation loop. Default: `5`.
- `SENTRY_AUTH_TOKEN` — Sentry API token. Enables Sentry integration when set with org + project.
- `SENTRY_ORG` — Sentry organization slug.
- `SENTRY_PROJECT` — Sentry project slug.

### 6.2 Hardcoded Constants

- `maxConcurrent`: `10` — Global cap on concurrent agents.
- `maxReworkConcurrent`: `2` — Per-state cap for Rework issues.
- `maxTurns`: `5` — Max continuation turns per issue in reconciliation loop.
- `LOCKS`: `~/.agent-harness/locks` — Lockfile directory.
- `WORKSPACES`: `~/.agent-harness/workspaces` — Git worktree root.
- `LOGS`: `~/.agent-harness/logs` — Agent stdout/stderr log directory.

### 6.3 Configuration Validation

At startup:

- `LINEAR_API_KEY` MUST be present and non-empty.
- `LINEAR_TEAM_KEY` MUST be present and non-empty.
- `LOCKS`, `WORKSPACES`, and `LOGS` directories are created with `mkdir -p` semantics.

No dynamic reload: configuration is read once at process startup.

## 7. Orchestration State Machine

### 7.1 Issue States (Internal)

Agent Harness uses lockfile presence and content to determine issue state. There is no explicit
state enum — state is derived:

1. `No Lock` — Issue has never been dispatched or lock was removed after success.
2. `Running` — Lock exists and `isAlive(lock.pid)` returns true.
3. `Crashed (Backoff)` — Lock exists, process is dead, `exitCode` is non-zero, `notBefore` is in
   the future.
4. `Ready for Retry` — Lock exists, process is dead, `exitCode` is non-zero, `notBefore` is in
   the past.
5. `Exited Clean` — Lock exists, process is dead, no `exitCode` field (awaiting cleanup).

### 7.2 State Transitions

```
No Lock ──dispatch──> Running
Running ──exit(0)──> Exited Clean ──cleanup()──> Awaiting Reconcile (lock kept, exitCode=0)
Running ──exit(!0)──> Exited Clean ──cleanup()──> Crashed (Backoff)
Awaiting Reconcile ──reconcile(PR merged)──> No Lock (Done, lock removed, worktree removed)
Awaiting Reconcile ──reconcile(CI fail)──> Running (continuation turn dispatched)
Awaiting Reconcile ──reconcile(max turns)──> Awaiting Reconcile (no action, log warning)
Crashed (Backoff) ──time passes──> Ready for Retry ──dispatch──> Running
Running ──stall detected──> No Lock (lock removed, process group killed)
Running ──terminal reconcile──> No Lock (lock removed, worktree removed)
```

### 7.3 Tick Sequence

Each orchestrator tick runs this sequence:

1. Ensure filesystem directories exist.
2. Load hooks config from `WORKFLOW.md` front matter + environment.
3. Poll Sentry for new errors (create Linear issues if found).
4. Detect and kill stalled agents.
5. Clean up exited agents (read exit codes, apply backoff or keep lock for reconciliation).
6. Run `after_run` hooks for completed agents.
7. Reconcile In Progress issues (check PR status, transition or re-dispatch).
8. Reconcile terminal issues (kill running agents, remove locks + worktrees).
9. Count running agents and compute available slots.
10. Fetch candidate issues from Linear.
11. Filter candidates: skip running, skip in-backoff.
12. Dispatch eligible issues up to available slots.
13. Log tick summary.

### 7.4 Dispatch Eligibility

An issue is dispatch-eligible only if ALL conditions are met:

- Issue state is `Todo` or `Rework`.
- Issue is not blocked (no non-terminal blockers via `inverseRelations`).
- No lockfile exists for this issue, OR lockfile exists but process is dead and backoff has elapsed.
- Global concurrency slots are available (`running < maxConcurrent`).
- Per-state concurrency limit is not exceeded (Rework: `maxReworkConcurrent`).

### 7.5 Dispatch Ordering

Candidates are sorted before dispatch:

1. `priority` ascending (1=Urgent first, 2=High, 3=Medium, 4=Low; 0 and undefined sort as 99).
2. `created_at` oldest first.
3. `identifier` lexicographic tie-breaker.

## 8. Workspace Management

### 8.1 Workspace Layout

Workspace root: `~/.agent-harness/workspaces`

Per-issue workspace path: `<root>/<sanitized_identifier>`

Git branch: `agent/<sanitized_identifier>`

### 8.2 Workspace Creation

Algorithm:

1. Sanitize identifier to workspace key.
2. Check if `<workspace_path>/.git` exists.
3. If exists: return `{ path, created: false }`. (Reuse.)
4. If not exists:
   a. Force-remove any existing worktree at that path (`git worktree remove --force`).
   b. Delete any stale branch (`git branch -D agent/<key>`).
   c. Create new worktree: `git worktree add <path> -b agent/<key> origin/main`.
   d. Return `{ path, created: true }`.

All git commands execute with `cwd` set to `config.repoPath`.

### 8.3 Workspace Hooks

Supported hooks:

- `after_create` — Runs only when a workspace is newly created.
- `before_run` — Runs before each agent spawn. Default: `git fetch origin && git rebase origin/main`.
- `after_run` — Runs after agent exits (success or failure).
- `before_remove` — Runs before workspace deletion during terminal reconciliation.

Execution contract:

- Execute via `execSync(script, { cwd: workspacePath })`.
- Timeout enforced via `timeout` option (default: 60 seconds).
- All hook executions are logged with `issueId` and `issueIdentifier`.

Failure semantics:

- `after_create` failure: throws, aborts dispatch for this issue.
- `before_run` failure: throws, aborts dispatch for this issue.
- `after_run` failure: logged as warning, ignored.
- `before_remove` failure: logged as warning, ignored.

### 8.4 Workspace Cleanup

Workspaces are removed during terminal reconciliation:

1. For each lockfile: fetch issue state from Linear.
2. If terminal: kill process (if alive), remove lock, run `before_remove` hook, remove worktree.
3. For each workspace directory without a corresponding lock: fetch state by identifier.
4. If terminal: run `before_remove` hook, remove worktree.

### 8.5 Safety Invariants

Invariant 1: Agent cwd is the per-issue workspace path.
- `spawnAgent()` sets `cwd: ws` on the subprocess.

Invariant 2: Workspace path stays inside workspace root.
- Path is computed as `path.join(WORKSPACES, sanitize(identifier))`.
- `sanitize()` removes any path-traversal characters.

Invariant 3: Workspace key is sanitized.
- Only `[A-Za-z0-9._-]` allowed.
- All other characters replaced with `_`.

## 9. Agent Runner Protocol

### 9.1 Launch Contract

Two spawn modes:

**Initial dispatch** (`spawnAgent`):

- Command: `sh -c 'claude -p "$1"; echo $? > "$2"'`
- Arguments: `['_', prompt, exitCodeFilePath]`
- Working directory: per-issue workspace path.
- stdio: stdin=`ignore`, stdout/stderr=file descriptor (append mode).
- Process mode: `detached: true`, `child.unref()`.

**Continuation dispatch** (`spawnContinuation`):

- Command: `sh -c 'claude -p "$1" --continue; echo $? > "$2"'`
- Same arguments, stdio, and process mode as initial dispatch.
- The `--continue` flag resumes the previous Claude Code conversation in the workspace, preserving
  context from the prior turn.
- Used by the reconciliation loop when a PR needs fixes.

The shell wrapper:
1. Runs `claude -p <prompt>` (or `claude -p <prompt> --continue`) in prompt mode, no TTY.
2. Captures the exit code.
3. Writes exit code to `~/.agent-harness/locks/{ISSUE_ID}.exit`.

### 9.2 Agent Environment

The spawned agent inherits the parent process environment (`process.env`).

The agent's working directory contains:
- Full git worktree of the repository, branched from `origin/main`.
- `CLAUDE.md` and `.claude/rules/*.md` from the repository.
- `GOTCHAS.md` from the repository.

The agent is expected to:
- Read `CLAUDE.md` and `GOTCHAS.md` for behavioral rules.
- Implement the task described in the Linear issue.
- Run `pnpm typecheck` before committing.
- Create a PR via `gh pr create`.

### 9.3 Prompt Construction

**Initial prompt** — built by `buildPrompt()`:

1. Determine template file: `WORKFLOW_REWORK.md` for Rework issues, `WORKFLOW.md` for others.
2. Try to read the template file from `config.repoPath`.
3. If file exists: parse front matter, render body with Liquid using `{ issue, attempt }`.
4. If file missing: use hardcoded fallback prompt.

**Continuation prompt** — built by `buildContinuationPrompt()`:

- Used when the reconciliation loop re-dispatches an agent.
- Includes the issue identifier, title, and the reason for re-dispatch (e.g., "CI checks failed",
  "PR has merge conflicts").
- Instructs the agent to use `--continue` context and fix the specific problem.
- Steps: understand changes → fix issue → typecheck → commit + push → update/create PR.

### 9.4 Exit Code Semantics

- Exit code `0`: agent completed successfully. Lock is kept by `cleanup()` with `exitCode=0` set.
  The reconciliation loop picks up these locks to check PR status and decide next action.
- Exit code non-zero: agent crashed or failed. Lock is updated with `exitCode` and `notBefore`
  (backoff timestamp). Attempt counter is incremented on next dispatch.
- Exit code file missing (process dead, no `.exit` file): treated as exit code `1`.

### 9.5 Agent Runner Interface

```typescript
interface AgentRunner {
  spawn(issue: IssueInfo, workspacePath: string): number
}
```

Current implementation: `CliRunner` using `child_process.spawn`.
Future: may swap for API-based runner without changing orchestrator logic.

## 10. Issue Tracker Integration (Linear)

### 10.1 Required Operations

1. `fetchCandidates()`
   - Returns issues in `Todo` or `Rework` state for the configured team.
   - Optionally scoped to a project via `LINEAR_PROJECT_SLUG`.
   - Filters out blocked issues.
   - Sorts by dispatch priority.
   - Page size: 50 (single page, no pagination).

2. `fetchInProgressIssues()`
   - Returns issues in `In Progress` state for the configured team.
   - Used by the PR reconciliation loop to find issues needing attention.
   - Page size: 50 (single page).

3. `fetchIssueState(issueId)`
   - Returns `{ stateName, terminal }` for one issue by ID.
   - Used by terminal reconciliation.

4. `fetchIssueStateByIdentifier(identifier)`
   - Returns `{ id, stateName, terminal }` for one issue by parsing identifier into team key +
     number.
   - Used by orphan workspace reconciliation.

5. `transitionToDone(issueId)`
   - Finds the `Done` workflow state for the configured team.
   - Updates the issue state to Done via `linear.updateIssue()`.
   - Used by reconciliation when a PR is merged.

### 10.2 Query Semantics

- Client: `@linear/sdk` (`LinearClient`).
- Authentication: `LINEAR_API_KEY` in constructor.
- Team filter: `team.key == LINEAR_TEAM_KEY`.
- Active states: `Todo`, `Rework`.
- Terminal states: `Done`, `Canceled`, `Cancelled`, `Duplicate`.
- Project filter (optional): `project.slugId == LINEAR_PROJECT_SLUG`.

### 10.3 Blocker Rules

For each candidate issue:

1. Fetch `inverseRelations` from Linear SDK.
2. For each relation with type `blocks`:
   a. Fetch the blocking issue.
   b. Fetch its state.
   c. If state is NOT terminal → issue is blocked.
3. If any non-terminal blocker exists, skip the issue and log `issue blocked` with blocker
   identifiers.

### 10.4 Tracker Writes

The orchestrator writes to Linear in two cases:

1. **Reconciliation**: when a PR is merged, `transitionToDone()` moves the issue to Done state.
2. **Sentry integration**: `pollSentry()` creates new Linear issues via `linear.createIssue()`.

All other ticket mutations are handled by the coding agent:
- PR creation: agent creates PRs via `gh pr create`.
- Comments: agent may comment via `gh`.

## 11. Sentry Integration (OPTIONAL)

### 11.1 Activation

Sentry polling is active when ALL of these environment variables are set:
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

When not configured, `pollSentry()` returns immediately.

### 11.2 Poll Behavior

Each tick:

1. Fetch unresolved issues from Sentry REST API.
2. For each Sentry issue, check if a Linear issue already exists (search by description containing
   `sentry:{SENTRY_ISSUE_ID}`).
3. If no existing Linear issue: create one with priority=High (2) and label `sentry-auto`.
4. The `sentry-auto` label is created automatically if it does not exist.

### 11.3 Linear Issue Format

Created issues include:
- Title: Sentry issue title.
- Description: error type, culprit, occurrence count, first/last seen, permalink.
- Hidden marker: `<!-- sentry:{ID} -->` for deduplication.

## 12. Retry and Backoff

### 12.1 Backoff Formula

```
delay_ms = min(10_000 * 2^(attempt - 1), 300_000)
```

| Attempt | Delay   |
|---------|---------|
| 1       | 10s     |
| 2       | 20s     |
| 3       | 40s     |
| 4       | 80s     |
| 5       | 160s    |
| 6+      | 300s    |

### 12.2 Retry Mechanics

After `cleanup()` detects a non-zero exit code:

1. Set `lock.exitCode` to the exit code.
2. Compute backoff delay from `lock.attempt`.
3. Set `lock.notBefore` to `now + delay`.
4. Write updated lock.

On next tick, if the issue is still a candidate:

1. Read lock.
2. If `notBefore` is in the future → skip (in backoff).
3. If `notBefore` is in the past → dispatch with `attempt + 1`.

### 12.3 Retry Cap

There is no hard retry cap. Agents will retry indefinitely with exponential backoff capped at 5
minutes until the issue is moved to a terminal state. Operators can stop retries by moving the
issue to `Done` or `Canceled` in Linear.

## 13. Stall Detection

### 13.1 Detection Method

For each running agent:

1. Read the agent's log file path: `~/.agent-harness/logs/{sanitized_identifier}.log`.
2. Check `mtime` of the log file.
3. If log file does not exist, use `lock.startedAt` as last activity time.
4. Compute `idleMs = now - mtime`.
5. If `idleMs > STALL_TIMEOUT_MS` → agent is stalled.

### 13.2 Stall Response

1. Send `SIGKILL` to the process group (`process.kill(-pid, 'SIGKILL')`).
   - Uses negative PID to kill the entire process group (shell + child `claude` process).
   - Falls back to killing the individual PID if process group kill fails with a non-ESRCH error.
2. Remove the lockfile.
3. Log warning with `issueId`, `issueIdentifier`, and `idleMs`.

The issue becomes eligible for fresh dispatch on the next tick (no backoff applied for stalls).

### 13.3 Design Notes

- `STALL_TIMEOUT_MS` defaults to 3 minutes (180s), shorter than `POLL_INTERVAL_MS` (5 minutes).
  This ensures stalled agents are detected within one tick of stalling.
- The `detached: true` flag on spawn creates a new process group, making `-pid` kill effective for
  the entire agent tree.

## 14. Terminal Reconciliation

### 14.1 Lock-Based Reconciliation

For each lockfile:

1. Fetch current issue state from Linear by `issueId`.
2. If state is terminal (Done, Canceled, Cancelled, Duplicate):
   a. Kill process if alive (`SIGTERM`).
   b. Remove lockfile.
   c. Run `before_remove` hook.
   d. Remove worktree.

### 14.2 Orphan Workspace Reconciliation

For each workspace directory that has no corresponding lockfile:

1. Parse workspace directory name back to issue identifier.
2. Fetch issue state from Linear by identifier.
3. If terminal:
   a. Run `before_remove` hook.
   b. Remove worktree.

### 14.3 PR Reconciliation Loop

The `reconcile()` function runs each tick after cleanup and before terminal reconciliation. It
monitors In Progress issues and takes action based on PR status.

Algorithm:

1. Fetch all `In Progress` issues from Linear.
2. For each issue:
   a. Skip if agent is still running (lock exists and process alive).
   b. Skip if in backoff (lock has non-zero exit code with future `notBefore`).
   c. Skip if max turns reached (`turn >= maxTurns`). Log warning.
   d. Check PR status via `checkPrStatus(identifier)`.
3. Based on PR outcome:
   - `done` (PR merged): transition issue to Done, remove lock, remove worktree.
   - `skip` (CI pending or awaiting review): no action, log reason.
   - `redispatch` (CI failed / merge conflicts / no PR / PR closed): spawn continuation agent.

Continuation dispatch:

- Uses `spawnContinuation()` which invokes `claude -p <prompt> --continue`.
- Prompt includes the specific reason for re-dispatch.
- Lock is updated with incremented `turn` count and reset `attempt=1`.
- Respects global concurrency limit.

### 14.4 GitHub PR Status Check

`checkPrStatus()` in `src/github.ts` determines PR outcome via `gh` CLI:

```
gh pr list --head "agent/{identifier}" --state all --json number,state,mergeStateStatus,statusCheckRollup
```

Decision tree:

1. `gh` command fails → `redispatch` ("failed to check PR status").
2. No PRs found → `redispatch` ("agent may have failed silently").
3. Any PR merged → `done`.
4. Open PR with `DIRTY` merge state → `redispatch` ("merge conflicts").
5. Open PR with any failing CI check → `redispatch` ("CI checks failed").
6. Open PR with pending CI checks → `skip` ("CI pending").
7. Open PR with all checks passed → `skip` ("awaiting review").

Timeout: 30 seconds for `gh` CLI execution.

## 15. Logging and Observability

### 15.1 Logging Conventions

Logger: pino, named `agent-harness`.

REQUIRED context fields for issue-related logs:

- `issueId`
- `issueIdentifier`

Additional fields by context:

- `pid` — agent process ID (dispatch, spawn).
- `attempt` — retry attempt number (dispatch, backoff).
- `exitCode` — agent exit code (cleanup).
- `notBefore` — backoff expiry (cleanup).
- `idleMs` — idle duration (stall detection).
- `hook` — hook name (hook execution).

### 15.2 Agent Logs

Agent stdout and stderr are written to:
`~/.agent-harness/logs/{sanitized_identifier}.log` (append mode).

These logs are also used for stall detection (mtime check).

### 15.3 Key Log Messages

| Event | Level | Message |
|-------|-------|---------|
| Tick start | info | `tick start` |
| Tick complete | info | `tick complete` |
| Agent dispatched | info | `dispatching` or `dispatching rework` |
| Agent spawned | info | `agent spawned` |
| Agent exited clean | info | `agent exited cleanly` |
| Agent crashed | info | `agent crashed, backoff applied` |
| Agent stalled | warn | `agent stalled` |
| Issue blocked | info | `issue blocked` |
| Backoff skip | info | `skipping: in backoff` |
| No slots | info | `no slots available` |
| Rework slots full | info | `rework slots full` |
| Terminal cleanup | info | `terminal cleanup` |
| PR merged | info | `PR merged, transitioned to Done` |
| Reconcile skip | info | `skipping` (with reason) |
| Reconcile re-dispatch | info | `re-dispatching turn N` |
| Agent re-spawned | info | `agent re-spawned` |
| Max turns reached | warn | `max turns reached` |
| Re-dispatch failed | error | `re-dispatch failed` |
| Dispatch failed | error | `dispatch failed` |
| Hook failed (fatal) | error | `hook failed, aborting` |
| Hook failed (non-fatal) | warn | `hook failed, continuing` |
| Sentry poll failed | error | `sentry poll failed` |
| Sentry issue created | info | `sentry issue created` |

## 16. Security and Operational Safety

### 16.1 Trust Boundary

Agent Harness runs in a trusted environment. The coding agent has full access to:
- The git worktree filesystem.
- The host shell environment.
- GitHub CLI for PR operations.
- Any tools available in `PATH`.

Operators SHOULD restrict the execution environment using OS-level controls if needed.

### 16.2 Secret Handling

- `LINEAR_API_KEY` and `SENTRY_AUTH_TOKEN` come from environment variables.
- Secrets MUST NOT be logged.
- Secrets MUST NOT be committed to the repository.
- `.env` file MUST be in `.gitignore`.

### 16.3 Filesystem Safety

- Workspace paths are sanitized (only `[A-Za-z0-9._-]`).
- Workspaces are confined to `~/.agent-harness/workspaces/`.
- Agent cwd is set to the per-issue workspace path.

### 16.4 Concurrency Safety

- Global limit: 10 concurrent agents.
- Per-state limit: 2 concurrent Rework agents.
- Lockfile-based dispatch prevents duplicate agents for the same issue.

## 17. Reference Algorithms

### 17.1 Poll-and-Dispatch Tick

```text
on_tick():
  ensure_directories(LOCKS, WORKSPACES, LOGS)
  hooks = load_hooks_config(repoPath)

  poll_sentry()
  detect_stalls()
  completed = cleanup()

  for agent in completed:
    run_hook_best_effort("after_run", hooks, agent)

  reconcile()
  reconcile_terminal(hooks)

  running = count_running()
  slots = max_concurrent - running
  if slots <= 0: return

  all_candidates = fetch_candidates()

  candidates = []
  for issue in all_candidates:
    lock = read_lock(issue.id)
    if lock is null: candidates.push(issue); continue
    if is_alive(lock.pid): continue
    if lock.exit_code != 0 and lock.not_before > now: continue
    candidates.push(issue)

  rework_running = count_running_by_state("Rework")

  for issue in candidates[0..slots]:
    if issue.state == "Rework" and rework_running >= max_rework_concurrent:
      continue

    prev_lock = read_lock(issue.id)
    attempt = prev_lock?.exit_code != 0 ? prev_lock.attempt + 1 : 1

    ws = ensure_worktree(issue.identifier)
    if ws.created: run_hook("after_create", hooks, ws)
    run_hook("before_run", hooks, ws)

    pid = spawn_agent(issue, ws.path, attempt)
    write_lock({ pid, issue.id, issue.identifier, now, attempt, issue.state })
```

### 17.2 Cleanup

```text
cleanup():
  completed = []
  for lock_file in readdir(LOCKS, "*.json"):
    lock = read_lock(lock_file)
    if lock is null or is_alive(lock.pid): continue
    if lock.exit_code is defined: continue

    completed.push(lock)

    exit_code = read_exit_code_file(lock.issue_id)
    delete_exit_code_file(lock.issue_id)

    if exit_code == 0:
      lock.exit_code = 0
      write_lock(lock)    # keep lock for reconciliation pickup
    else:
      lock.exit_code = exit_code ?? 1
      lock.not_before = now + compute_backoff(lock.attempt)
      write_lock(lock)

  return completed
```

### 17.3 Stall Detection

```text
detect_stalls():
  for lock_file in readdir(LOCKS, "*.json"):
    lock = read_lock(lock_file)
    if lock is null or not is_alive(lock.pid): continue

    log_path = LOGS / sanitize(lock.identifier) + ".log"
    mtime = stat(log_path).mtime ?? lock.started_at

    idle_ms = now - mtime
    if idle_ms < stall_timeout_ms: continue

    try:
      kill(-lock.pid, SIGKILL)    # kill process group
    catch err:
      if err.code != ESRCH:
        kill(lock.pid, SIGKILL)   # fallback: kill individual process
    remove_lock(lock.issue_id)
```

### 17.4 PR Reconciliation

```text
reconcile():
  in_progress = fetch_in_progress_issues()
  running = count_running()
  slots_used = 0

  for issue in in_progress:
    lock = read_lock(issue.id)

    if lock and is_alive(lock.pid): continue
    if lock?.exit_code != 0 and lock?.not_before > now: continue

    turn = lock ? (lock.turn ?? 1) : 0
    if turn >= max_turns:
      log_warn("max turns reached")
      continue

    outcome = check_pr_status(issue.identifier)

    if outcome.action == "done":
      transition_to_done(issue.id)
      remove_lock(issue.id)
      remove_worktree(issue.identifier)
      continue

    if outcome.action == "skip":
      continue

    if running + slots_used >= max_concurrent: continue

    next_turn = turn + 1
    ws = ensure_worktree(issue.identifier)
    pid = spawn_continuation(issue, ws, outcome.reason)
    write_lock({ pid, issue.id, issue.identifier, now, attempt=1, turn=next_turn, issue.state })
    slots_used++
```

### 17.5 Terminal Reconciliation

```text
reconcile_terminal(hooks):
  locks = list_locks()
  locked_identifiers = set(lock.identifier for lock in locks)

  for lock in locks:
    state = fetch_issue_state(lock.issue_id)
    if state is null or not state.terminal: continue

    if is_alive(lock.pid): kill(lock.pid, SIGTERM)
    remove_lock(lock.issue_id)
    run_hook_best_effort("before_remove", hooks, lock)
    remove_worktree(lock.identifier)

  for ws in list_worktree_identifiers():
    if ws in locked_identifiers: continue
    state = fetch_issue_state_by_identifier(ws)
    if state is null or not state.terminal: continue
    run_hook_best_effort("before_remove", hooks, ws)
    remove_worktree(ws)
```

## 18. Test and Validation Matrix

### 18.1 Core Conformance

- Config loads from environment variables correctly.
- Missing `LINEAR_API_KEY` or `LINEAR_TEAM_KEY` causes startup failure.
- Filesystem directories are created if missing.
- Dispatch sort order: priority ascending (0/null last) → oldest → identifier.
- Blocked issues are filtered out (`inverseRelations` with non-terminal blockers).
- Lockfile CRUD: read, write, remove work correctly.
- `isAlive()` returns false for dead PIDs.
- `computeBackoff()` returns `min(10_000 * 2^(n-1), 300_000)`.
- Cleanup: exit code 0 keeps lock with `exitCode=0` (for reconciliation), non-zero applies backoff.
- Stall detection: kills process group for agents idle beyond threshold.
- Stall detection: falls back to individual PID kill if process group kill fails.
- Terminal reconciliation: removes locks and worktrees for Done/Canceled issues.
- Orphan reconciliation: cleans workspaces without locks for terminal issues.
- Workspace sanitization: only `[A-Za-z0-9._-]` in directory names.
- Concurrency: dispatch stops when `maxConcurrent` reached.
- Per-state concurrency: Rework limited to `maxReworkConcurrent`.
- Prompt rendering: Liquid template with `issue` and `attempt` variables.
- Fallback prompt: used when `WORKFLOW.md` is missing.
- Rework prompt: used when issue state is `Rework`.
- Continuation prompt: includes reason for re-dispatch.
- PR reconciliation: merged PR → Done + lock removed + worktree removed.
- PR reconciliation: CI failure → continuation agent dispatched.
- PR reconciliation: merge conflicts → continuation agent dispatched.
- PR reconciliation: no PR found → continuation agent dispatched.
- PR reconciliation: CI pending → skip (no action).
- PR reconciliation: awaiting review → skip (no action).
- PR reconciliation: max turns reached → log warning, no action.
- PR reconciliation: respects `maxConcurrent` limit.
- `fetchInProgressIssues()` returns issues in `In Progress` state.
- `transitionToDone()` moves issue to Done workflow state.

### 18.2 Hook Conformance

- `after_create` runs only on new workspace creation.
- `before_run` runs before each agent spawn.
- `after_run` runs after agent completion.
- `before_remove` runs before workspace deletion.
- `after_create` / `before_run` failure aborts dispatch.
- `after_run` / `before_remove` failure is logged and ignored.
- Hook timeout is enforced.

### 18.3 Integration Profile (RECOMMENDED)

- Linear API smoke test with valid credentials.
- Agent spawn + exit code collection end-to-end.
- Git worktree create + reuse + remove lifecycle.
- Sentry poll + Linear issue creation (when Sentry configured).

## 19. Implementation Checklist

### 19.1 Implemented

- [x] Polling orchestrator with configurable interval and `--once` mode
- [x] Linear client with team filter, optional project scope, blocker detection
- [x] Git worktree isolation with sanitized identifiers and branch naming
- [x] Claude Code CLI spawn as detached process with exit code capture
- [x] Lockfile-based state tracking (no database)
- [x] Exponential backoff for crashed agents (10s base, 300s cap)
- [x] Stall detection via log file mtime with process group kill (ENG-11)
- [x] Stall timeout reduced to 3 minutes to avoid race with poll interval (ENG-11)
- [x] Terminal reconciliation (lock-based + orphan workspace cleanup)
- [x] PR reconciliation loop: check PR status → Done / re-dispatch continuation (ENG-10)
- [x] Continuation agent spawning with `--continue` flag and turn tracking (ENG-10)
- [x] Max turns cap for reconciliation loop (default 5) (ENG-10)
- [x] GitHub PR status check via `gh` CLI (merged/CI fail/conflicts/pending) (ENG-10)
- [x] Linear `transitionToDone()` for merged PRs (ENG-10)
- [x] Workspace lifecycle hooks (after_create, before_run, after_run, before_remove)
- [x] Liquid prompt templates with WORKFLOW.md / WORKFLOW_REWORK.md
- [x] Hardcoded fallback prompts for Todo, Rework, and Continuation states
- [x] Per-state concurrency limit (Rework: max 2)
- [x] Dispatch ordering (priority → created_at → identifier)
- [x] Structured logging with pino (issueId + issueIdentifier in all entries)
- [x] Sentry integration (poll errors → create Linear issues)
- [x] AgentRunner interface for future runner swaps

### 19.2 Planned

- [ ] Pagination for candidate issues (currently single page of 50)
- [ ] Dynamic config reload (re-read WORKFLOW.md without restart)
- [ ] Pluggable tracker adapters beyond Linear
- [ ] HTTP status surface / dashboard
