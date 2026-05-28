# Plans

## Phases

### Phase 1: Orchestrator ✅
Poll Linear → dispatch Claude Code CLI agents → isolated workspaces → PR lifecycle.

- [x] Poll Linear for Todo issues (team-based filter)
- [x] Dispatch ordering: priority → created_at → identifier
- [x] Git worktree isolation per issue
- [x] Spawn `claude -p` with autonomous prompt
- [x] Lockfile-based state tracking
- [x] Retry with exponential backoff (ENG-1)
- [x] Stall detection + kill process group (ENG-2, ENG-11)
- [x] Blocked issue filtering (ENG-3)
- [x] Terminal issue cleanup (ENG-4)
- [x] Rework status support + full reset (ENG-5)
- [x] PROMPT_DEFAULT.md template rendering (ENG-6)
- [x] Workspace hooks: after_create, before_run, after_run, before_remove (ENG-7)
- [x] Module extraction (ENG-8)
- [x] PR reconciliation loop + multi-turn `--continue` (ENG-10)
- [x] Polling loop (5 min interval, `pnpm start`)
- [x] GitHub Actions CI (typecheck + build + security gate)
- [x] Auto-merge on CI pass
- [x] Acceptance criteria verification in prompt
- [x] .claude/rules/ for agent behavior

### Phase 2: Sentry Pipeline ✅
Sentry error → auto-create Linear ticket → Orchestrator dispatch → agent fix.

- [x] `src/sentry.ts` — poll Sentry API, dedup, create Linear ticket (ENG-9)
- [x] Config `.env`: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- [x] Test: Sentry error → Linear ticket auto-created (ENG-13)
- [ ] Triage engine — severity scoring + investigation context in ticket
- [ ] Post-fix verify — poll Sentry after merge, auto-close ticket if error resolved
- [ ] Verify dedup: same Sentry issue does not create duplicate Linear tickets (needs real errors)

### Phase 3: Quality Gates ✅
CI gates before merge + AI review.

- [x] GitHub Actions CI: typecheck + build + test (vitest)
- [x] Security gate: block PR modifying `.env`
- [x] Auto-merge: CI pass + review approve → squash merge
- [x] Branch protection: require CI pass + 1 approval
- [x] 3x parallel AI code review: quality, security, deps (ENG-12)
- [x] Bot account (`duccanh88`) for review approval
- [x] Agent prompt: mandatory test generation (feature + bug fix)
- [x] Bug fix prompt: reproduce-first approach (label `sentry-auto`/`bug`)
- [ ] Sentry post-deploy watch — new errors after merge → auto-ticket (needs real errors)
- [ ] Auto-revert on Sentry spike after deploy (advanced — deferred)

### Phase 3.5: Operational Robustness ⚠️
Self-operating system stability.

- [x] Auto-restart orchestrator when main changes (detect main updated → exit → systemd restart)
- [ ] Merge queue (GitHub merge queue) — rebase + re-run CI before merge
- [x] Process manager: launchd on Mac (ENG-27), systemd on Ubuntu (`KillMode=process` required — default `control-group` kills detached agents on restart)
- [x] Full pipeline test: ENG-14 dispatch → code + test → PR → review → merge ✅
- [x] Stall detection fix — stream-json output + 600s timeout (ENG-32)
- [x] gh CLI auth fix for agent env (ENG-33)
- [x] Turn comment label fix (ENG-34)
- [x] Delete remote branch when closing PR for fresh attempt (ENG-35)
- [x] Smoke test for CLI spawn flags (ENG-36)
- [x] Babysit skill — orchestrator spawns recovery agent when stuck (ENG-37)
- [x] Multi-machine support: Mac + Ubuntu running same codebase
- [x] Pull main before restart — reset --hard instead of just detect (hotfix PR #97)
- [x] Transition issue to In Progress when dispatching agent (hotfix PR #97)
- [ ] Token dashboard align Symphony style (ENG-38)
- [ ] Circuit breaker for review retry loop (ENG-39)
- [ ] Auto-recover dirty worktree in before_run hook (ENG-40)
- [ ] Cost guard — pause issue when cost exceeds threshold (ENG-41)

### Phase 4: Grader + Bridge (deferred)
For fully autonomous deploy or quality drift detection.

**Grader (tri-judge panel):**
- [ ] 3 model families scoring in parallel (Anthropic, OpenAI, Google)
- [ ] Structured output: reasoning, category, quality, issues, confidence
- [ ] Consensus via mean scoring
- [ ] Sampling: 10% primary model, 100% experimental model
- [ ] Requires switching agent runtime from CLI to API (`interface AgentRunner` → `ApiRunner`)

**Bridge (grey rollout):**
- [ ] Merge → 10% traffic to new version
- [ ] Grader scores head-to-head against baseline in real-time
- [ ] Statistical test: p < 0.05, min 200 interactions
- [ ] Promotion: 5% → 20% → 50% → 100%
- [ ] Fail: score drops ≥ 0.15 → abort → revert → ticket

**Triggers for starting Phase 4:**
- Sufficient volume (hundreds of agent interactions/day)
- Want to remove CI gate, fully autonomous deploy
- Quality drift detection (code style, architecture erosion)

## Bootstrapping Strategy

The system builds itself:
- Phase 0 (poll + dispatch) written by hand
- Phase 1 features = Linear tickets dispatched by orchestrator to agents
- Agents create improvement issues themselves (ENG-10, ENG-11 are examples)
- From Phase 2+: create issue on Linear → orchestrator auto-dispatches

## Known Issues / Gotchas

See [GOTCHAS.md](GOTCHAS.md) for the full list of pitfalls encountered.

Key patterns:
- Dispatching multiple agents that edit the same file simultaneously → merge conflict → need sequential dispatch or reconciliation re-dispatch
- Agent code based on old main → conflict on merge → reconciliation loop auto-detect + re-dispatch
- `claude -p` is one-shot but `--continue` enables multi-turn
- Orchestrator detects main updated → self-exits → systemd/launchd auto-restarts
- `claude -p --output-format stream-json` requires the `--verbose` flag
