# Handoff

## Current State
Pipeline end-to-end hoạt động: Linear issue → agent dispatch → code + test → PR → 3x review → bot approve → auto-merge. Đã verify với ENG-14.

## Done
- [x] Phase 1: Orchestrator (ENG-1 → ENG-11) — poll, dispatch, reconcile, retry, stall, hooks, multi-turn
- [x] Phase 2: Sentry config — poll API, tạo Linear ticket tự động
- [x] Phase 3: Quality gates — CI (typecheck + test), 3x AI review, bot approval, auto-merge
- [x] Vitest setup + mandatory test generation trong agent prompts
- [x] Bug fix prompt: reproduce-first approach (label `sentry-auto`/`bug`)
- [x] Bot account `duccanh88` cho PR review approval
- [x] Auto-restart orchestrator khi main thay đổi (`start.sh`)
- [x] Skill: `plan-feature` — interactive planning → Linear issues
- [x] Full pipeline test: ENG-14 dispatch → code + test → PR → review → merge ✅

## Decisions
- **CLI không API**: Claude Code CLI (flat cost Max plan), không dùng Anthropic API
- **Bot account thay GitHub App**: `duccanh88` classic token, đơn giản hơn App setup
- **Review local không GitHub Action**: tiết kiệm cost, dùng CLI có sẵn
- **1 project / thời điểm**: REPO_PATH trỏ vào project nào thì build project đó

## Next Steps
- [ ] Tạo web product repo, trỏ harness vào
- [ ] Dùng `/plan-feature` để tạo issues cho web product
- [ ] Triage engine (khi Sentry có lỗi thật)
- [ ] Post-fix verify + auto-close (khi Sentry có lỗi thật)
- [ ] Merge queue (khi nhiều agent merge cùng lúc)

## Key Files
- `src/orchestrator.ts` — tick loop, dispatch, reconcile, review trigger
- `src/review.ts` — 3x Claude review song song, bot token approval
- `src/prompt.ts` — feature/bug fix/rework/continuation prompts
- `src/sentry.ts` — poll Sentry API, dedup, create Linear ticket
- `start.sh` — wrapper auto-restart khi main thay đổi
- `.claude/skills/plan-feature/SKILL.md` — interactive feature planning
- `PLANS.md` — 4-phase roadmap
- `GOTCHAS.md` — known pitfalls
