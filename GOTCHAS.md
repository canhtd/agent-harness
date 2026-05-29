# Gotchas

Known pitfalls from prior work. Read before starting any task.

## Blocked issues are filtered via inverseRelations

`fetchCandidates()` checks `inverseRelations` (type `blocks`) for each issue. If any blocker is not in a terminal state (Done, Canceled, Duplicate), the issue is skipped. Log entry: `issue blocked` with blocker identifiers. Fixed: ENG-3.

## Multiple agents editing the same file = merge conflict

Dispatching multiple issues simultaneously that all modify `src/index.ts` causes worktree merge conflicts. Extract modules first (ENG-8) before parallel dispatch. Rule: do not dispatch multiple issues that modify the same file.

## Linear project ≠ team

Linear project = epic (temporary, has deadline). Team = primary organizational unit. Orchestrator filters by `LINEAR_TEAM_KEY`, not project slug. Project slug is optional scope.

## spawn stdio requires file descriptor, not WriteStream

`child_process.spawn` with `detached: true` does not accept `createWriteStream()` for stdio. Use `openSync()` which returns an fd (number) instead.

## Stale branch when creating worktree

`git worktree add -b "agent/X"` fails if the branch already exists from a previous run. Fix: `git branch -D` before creating a new worktree.

## Agent stops to ask instead of acting

Claude Code in `-p` mode has no TTY — if the agent asks "shall I proceed?" nobody can respond and the task stalls. Prompt must explicitly state: "You are running autonomously — do not ask for confirmation" and list all steps.

## Agent refactor does not inherit local fixes

When an agent extracts modules, it branches from `origin/main` — it cannot see uncommitted local fixes. Fixes must be merged into main BEFORE the agent creates its branch.

## Branch protection blocks direct push to main

All changes must go through a PR + CI pass. Including CI config fixes.

## pnpm approve-builds / --ignore-scripts

CI needs `pnpm install --ignore-scripts` because esbuild postinstall is blocked. Local worktrees need `pnpm approve-builds esbuild`.

## Stall detection and poll interval

Stall detection runs every tick. With poll interval = 30s, max detection latency is 30s after exceeding stall timeout. Default: stall timeout = 600s, poll interval = 30s. Stall timeout does not need to be < poll interval — it just needs to be large enough to avoid false positives. Agent spawn uses `--output-format stream-json` so log file mtime updates continuously — stall detection works correctly on all machines.

## Linear priority 0 = no priority

Linear priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low. Priority 0 is not the highest — it means unset. Dispatch ordering places 0 and null last.

## Branch name containing issue identifier = Linear auto-close mismatch

Linear GitHub integration detects issue identifiers (e.g. `ENG-13`) in branch names. If a PR merges → Linear auto-transitions the issue to Done. Do not include an unrelated issue's identifier in a branch name. Branch `agent/ENG-13-test-framework` caused ENG-13 to be closed when the PR merged.

## PR author and reviewer must be different accounts

`review.ts` uses `GITHUB_BOT_TOKEN` (account `duccanh88`) to post reviews. If the agent also creates the PR as `duccanh88` → GitHub rejects with "Can not approve your own pull request" → review gets stuck in an infinite loop.

Root cause: agent inherits `GITHUB_BOT_TOKEN` from orchestrator env. When `gh` CLI is not authenticated, the agent may use the bot token to create the PR → same account as the reviewer.

Fix: ensure `gh auth login` on the orchestrator machine uses the primary account (`canhtd`), not the bot account. Agent creates PR as `canhtd`, review is posted as `duccanh88`.

## claude -p does not stream stdout

`claude -p` only writes to stdout when the entire task completes. During execution (editing files, installing deps, running commands), stdout = 0 bytes → log file mtime does not update → stall detection false positive.

Fix: use `--output-format stream-json` so Claude CLI streams each message to stdout in realtime. If not applied, increase `STALL_TIMEOUT_MS` to 600s+ to give the agent enough time to finish.

## Ubuntu cold start is slower than Mac

A fresh clone needs to install dependencies and MCP servers (Playwright ~270MB) on first run. Agents take longer than on a Mac with warm cache. Stall timeout must be large enough for cold starts.

## Reset issue must also delete remote branch

When closing a PR and resetting a worktree, the remote branch must also be deleted (`git push origin --delete agent/ENG-XX`). If the remote branch still exists with a closed PR, a new agent will see the closed PR → gets confused → crash loop. The agent needs a clean branch to create a new PR.

## Stale rebase-merge in worktree

When an agent is killed mid-`git rebase`, the worktree retains a `rebase-merge` directory. The `before_run` hook running `git rebase origin/main` keeps failing with "It seems that there is already a rebase-merge directory". Fix: `rm -rf .git/worktrees/{IDENTIFIER}/rebase-merge` or delete and recreate the worktree.

## --output-format stream-json requires --verbose

`claude -p --output-format stream-json` crashes with "requires --verbose". Must always include the `--verbose` flag. ENG-32 merged without this flag → all agents crashed. Smoke test (`runner.smoke.test.ts`) catches this — run `claude -p` with the exact flags before committing.

## pullMainIfChanged must use reset --hard, not --ff-only

`src/index.ts` detects `origin/main` differs from local main → pull → exit → systemd restart. Use `git reset --hard origin/main` instead of `git merge --ff-only` because:
1. If main is not pulled before exit → restart runs old code → detects diff → exits → infinite loop (happened 367 times)
2. `--ff-only` fails when local main has unpushed commits (local hotfix commit + PR squash merge creates different hash → diverge → ff-only rejects)
3. Local main never has local-only commits — agents work in worktrees, all changes go through PRs. `reset --hard` is safe.

## Push thẳng main bị reject → local main diverge → orchestrator chạy code cũ

Khi push thẳng lên main bị branch protection reject, commit vẫn nằm trên local main. Origin/main có squash-merged version từ PR. Local main diverge → `start.sh` chạy `git pull --ff-only` fail silently → orchestrator không pull được code mới. Fix: `git reset --hard origin/main`.

## Review ENOENT khi claude chưa install xong

`review.ts` dùng `spawn('claude', ...)` để chạy AI review. Nếu `claude` binary chưa install (máy mới, đang upgrade, hoặc agent vừa `npm install -g` giữa chừng), review fail `ENOENT` → post "CHANGES_REQUESTED" với lý do vô nghĩa → agent burn hết turns cố fix lỗi không phải của mình. Đã xảy ra với ENG-41: binary install lúc 08:10, review chạy lúc 08:08 → 4 turns wasted.

## Bot không re-review PR sau khi agent push fix

`checkPrStatus()` chỉ trigger `action: 'review'` khi `getReviewState === 'none'` (zero reviews). Sau CHANGES_REQUESTED, review cũ tồn tại mãi → `getReviewState` luôn trả `'changes_requested'` → agent nhận stale feedback loop 5 turn → fresh attempt → PR mới. ENG-17 mất 14 PR vì pattern này. Fix: so sánh commit date vs review date, nếu có commit mới thì re-review. Tracking: ENG-25.

## getReviewState check ALL reviews thay vì latest

`github.ts:108-121` dùng `.reviews | map(.state) | unique` — gộp tất cả review history. CHANGES_REQUESTED check trước APPROVED (line 115-116). Nên kể cả bot approve lần 2, review cũ vẫn block. Fix: dùng `reviewDecision` field hoặc sort by `submittedAt` lấy latest. Tracking: ENG-25.

## KHÔNG hardcode secrets vào launchd plist hoặc bất kỳ file config nào

macOS launchd sandbox block `source .env` từ user directories. Giải pháp SAI: copy secrets vào `EnvironmentVariables` trong plist — secrets plaintext trên disk, leak trong conversation/log. Giải pháp ĐÚNG: dùng `/bin/zsh -l -c "source .env && exec node ..."` trong ProgramArguments để login shell load env từ `.env` file.

## Systemd KillMode=control-group kills detached agents

Systemd default `KillMode=control-group` kills the entire cgroup on restart, including agent processes despite `detached: true` + `child.unref()`. Orchestrator detects main updated → `process.exit(0)` → systemd restart → agents killed mid-task. Fix: `KillMode=process` in the service file — systemd only kills the main process (node), detached agents continue running.

## Do not code by hand — create issues for agents to build

Agent harness builds itself (bootstrapping). All features/fixes must go through Linear issue → orchestrator dispatch → agent implements. Do not code by hand and push directly. Only code by hand when the agent cannot do it itself (e.g. fixing a broken orchestrator that cannot dispatch).

## Design system uses hardcoded dark default (temporary)

`web/app/layout.tsx` sets `data-theme="dark"` on `<html>` and `globals.css` uses `:root, [data-theme="dark"]` for dark tokens. System `prefers-color-scheme` is NOT consulted — dark is always the default when localStorage is empty. This is intentional (ENG-86 decision) — ENG-80b will add system preference detection. Do not "fix" this to use `@media (prefers-color-scheme)` until ENG-80b is picked up.
