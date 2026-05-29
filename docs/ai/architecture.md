# AI Architecture — Agent Harness

## Cấu trúc thư mục

```
agent-harness/
├── CLAUDE.md                          # Entry point — rules, safety rails, bail policy
├── GOTCHAS.md                         # Known pitfalls (agent đọc trước mỗi task)
├── HANDOFF.md                         # Current state cho session mới
├── PLANS.md                           # Roadmap 4 phases
├── WORKFLOW.md                        # Liquid template cho agent prompt
├── .claude/
│   ├── rules/
│   │   ├── core.md                    # Autonomous mode, acceptance criteria, scope control
│   │   └── config.md                  # Secrets from env, no .env modification
│   ├── skills/
│   │   ├── plan-feature/SKILL.md      # Interactive planning → Linear issues
│   │   ├── review-quality/SKILL.md    # Code quality review (severity filter)
│   │   ├── review-security/SKILL.md   # Security review
│   │   └── review-deps/SKILL.md       # Dependency review
│   └── settings.json                  # (chưa có — permissions, hooks config)
├── src/
│   ├── index.ts                       # Entry point — poll loop, mainHasChanged()
│   ├── orchestrator.ts                # Tick: cleanup → reconcile → dispatch
│   ├── config.ts                      # Env vars, paths, defaults
│   ├── linear.ts                      # Linear API client
│   ├── github.ts                      # PR status, review state, merge, re-review
│   ├── runner.ts                      # Spawn agent (claude -p), continuation (--continue)
│   ├── prompt.ts                      # Build prompt from WORKFLOW.md + issue
│   ├── review.ts                      # 3x parallel review pipeline
│   ├── lockfile.ts                    # Lock read/write/cleanup, stall detection
│   ├── workspace.ts                   # Git worktree management
│   ├── handoff.ts                     # Write/read handoff between attempts
│   ├── hooks.ts                       # Workspace lifecycle hooks
│   ├── tokens.ts                      # Token aggregation from session JSONL
│   └── sentry.ts                      # Sentry polling → Linear ticket
├── scripts/
│   ├── start.sh                       # Wrapper: pull + run (launchd/tmux compatible)
│   ├── com.agent-harness.orchestrator.plist  # launchd template
│   ├── install-launchd.sh             # Install launchd agent
│   └── uninstall-launchd.sh           # Uninstall launchd agent
├── web/                               # Next.js dashboard (token usage)
└── docs/
    └── ai/
        └── architecture.md            # ← file này
```

## Flow chính

```
Linear (Todo/Rework)
    ↓ fetchCandidates()
Orchestrator tick
    ↓ dispatch
Agent (claude -p) trong git worktree
    ↓ implement + test + push + create PR
Orchestrator reconcile
    ↓ checkPrStatus()
    ├── PR merged → Done
    ├── CI pending → skip
    ├── CI fail → redispatch
    ├── No review → trigger 3x review
    ├── New commits after review → re-review
    ├── Approved + CI green → auto-merge
    └── Changes requested → redispatch with feedback
        ↓ postComment() lên Linear
Agent continuation (claude -p --continue)
    ↓ fix feedback + push
    ... loop cho đến merge hoặc max turns
```

## Retry model

```
Turn 1-5 (continuation): cùng branch, --continue, review feedback
    ↓ max turns
Fresh attempt 2/3: close PR, xoá worktree, ghi handoff, branch mới
    ↓ max attempts
Escalation: post comment, transition to Blocked
```

## Review pipeline

3 reviewer chạy song song, mỗi reviewer là 1 `claude -p` session riêng:

| Reviewer | Skill | Focus |
|----------|-------|-------|
| quality | review-quality/SKILL.md | Logic, performance, maintainability, acceptance criteria |
| security | review-security/SKILL.md | Injection, auth, secrets, input validation |
| deps | review-deps/SKILL.md | Supply chain, license, version conflicts |

Tất cả approve → bot approve PR → GitHub Actions auto-merge.
Bất kỳ reject → CHANGES_REQUESTED → agent redispatch.

Quality reviewer có severity filter: chỉ block PR cho practical bugs, ignore theoretical edge cases.

## State management

Không database. State nằm ở:
- **Linear**: issue status (Todo/In Progress/In Review/Done/Blocked)
- **Lockfile** (`~/.agent-harness/locks/{ISSUE_ID}.json`): PID, turn, attempt, exitCode
- **Git worktree** (`~/.agent-harness/workspaces/{IDENTIFIER}`): agent working directory
- **Handoff** (`~/.agent-harness/handoffs/{IDENTIFIER}.md`): context cho fresh attempt
- **GitHub PR**: review state, CI status, merge state

## Key decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Runtime | CLI (`claude -p`) not API | Flat cost Max plan, no per-token billing |
| Review | 3x independent, not self-review | Tránh bias, catch more bugs |
| State | Lockfile not DB | Stateless orchestrator, filesystem recovery |
| Polling | 30s interval | Symphony reference, fast feedback loop |
| Retry | 5 turns × 3 attempts | Balance cost vs success rate |
| Auto-start | tmux in .zshrc | launchd blocked bởi macOS sandbox |
| Re-review | Compare commit date vs review date | Fix stuck loop (ENG-25) |

## Secrets

Tất cả từ `.env`, KHÔNG bao giờ hardcode:
- `LINEAR_API_KEY` — Linear API access
- `LINEAR_TEAM_KEY` — Team filter (ENG)
- `SENTRY_AUTH_TOKEN` — Sentry polling
- `SENTRY_ORG` / `SENTRY_PROJECT` — Sentry scope
- `GITHUB_BOT_TOKEN` — Bot account cho PR review approval

## Tham khảo

- [OpenAI Symphony SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md)
- [Harness Engineering blog](https://openai.com/index/harness-engineering/)
