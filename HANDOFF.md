# Handoff

## Current State
Phase 0 chạy được. Orchestrator poll Linear, tạo worktree, spawn agent. ENG-8 (module extraction) agent đã implement, PR #1 đang chờ merge.

## Done
- [x] Phân tích kiến trúc Creao + Symphony
- [x] Chọn stack: TypeScript + Claude Code CLI + lockfile state
- [x] Implement Phase 0: `src/index.ts` — poll → dispatch → spawn
- [x] Tạo GitHub repo: https://github.com/canhtd/agent-harness
- [x] Tạo Linear project "Agent Harness" (team Enginear, key ENG)
- [x] Tạo 9 backlog issues (ENG-1 → ENG-9) với blocked-by dependencies
- [x] Test end-to-end: ENG-8 Todo → orchestrator dispatch → agent tách modules → PR #1
- [x] Viết CLAUDE.md, CONCEPT.md, GOTCHAS.md

## Tried & Failed
- Rust ban đầu → chuyển TypeScript (không có performance bottleneck cần Rust)
- `createWriteStream` cho spawn stdio → dùng `openSync` fd thay thế
- Agent hỏi xác nhận trong `-p` mode → thêm "autonomous, do not ask" vào prompt

## Decisions
- **TypeScript** thay Rust — mục tiêu ship nhanh
- **Claude Code CLI** thay API — flat cost, `interface AgentRunner` để swap sau
- **Lockfile state** thay DB — stateless, tự recover
- **GitHub Actions** lo CI + auto-merge — không human review (giống Creao)
- **Sentry poll** thay webhook — cùng pattern poll-based
- **Team-based Linear filter** (`LINEAR_TEAM_KEY=ENG`) thay project slug
- **ENG-8 trước** — tách modules trước khi dispatch song song (tránh merge conflict)

## Next Steps
- [ ] Review + merge PR #1 (ENG-8: module extraction)
- [ ] Commit fixes vào main: spawn fd fix, stale branch fix, autonomous prompt
- [ ] Setup GitHub Actions CI (typecheck + lint)
- [ ] Setup auto-merge (branch protection: require CI, no review required)
- [ ] Kéo ENG-1→6, ENG-9 sang Todo → orchestrator tự dispatch
- [ ] Sau khi features merge: setup cron hoặc polling loop cho orchestrator

## Backlog (Linear)

| ID | Title | Priority | Status | Blocked by |
|-----|-------|----------|--------|------------|
| ENG-1 | Retry with exponential backoff | High | Backlog | ENG-8 |
| ENG-2 | Stall detection — kill idle agents | High | Backlog | ENG-8 |
| ENG-3 | Blocked issue filtering | Medium | Backlog | ENG-8 |
| ENG-4 | Terminal issue cleanup | Medium | Backlog | ENG-8 |
| ENG-5 | Rework status support | Medium | Backlog | ENG-8 |
| ENG-6 | WORKFLOW.md template rendering | Medium | Backlog | ENG-8 |
| ENG-7 | Workspace hooks | Low | Backlog | ENG-6, ENG-8 |
| ENG-8 | Extract modules | Low | Todo | — |
| ENG-9 | Sentry polling | Low | Backlog | ENG-8 |

## Key Files
- `CLAUDE.md` — project contract cho agent sessions
- `CONCEPT.md` — architecture overview + diagrams
- `GOTCHAS.md` — known pitfalls (8 items)
- `src/index.ts` — Phase 0 entry point (sẽ thành entry-only sau ENG-8 merge)
- `~/.agent-harness/` — locks, logs, workspaces (runtime state)
