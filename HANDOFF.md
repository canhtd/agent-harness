# Handoff

## Current State
Architecture design xong. Chưa viết code. Sẵn sàng implement Phase 0.

## Done
- [x] Phân tích kiến trúc Creao (Peter Pang) — Grader, Engineering Pipeline, Bridge
- [x] Phân tích Symphony (OpenAI) — orchestrator spec, dispatch, workspace, retry
- [x] So sánh CLI vs API agent runtime → chọn CLI (flat cost, tool layer miễn phí)
- [x] So sánh Rust vs TypeScript → chọn TypeScript (ship nhanh, ecosystem giàu)
- [x] Quyết định không cần Grader v1 — CI + Sentry + human review đủ
- [x] Quyết định không cần Bridge v1 — GitHub Actions auto-merge đủ
- [x] Thiết kế bootstrapping strategy — Phase 0 tự build phần còn lại
- [x] Viết CLAUDE.md

## Tried & Failed
- Rust ban đầu — chuyển TypeScript vì mục tiêu ship nhanh, không có performance bottleneck cần Rust

## Decisions
- **TypeScript** thay Rust — mục tiêu ship nhanh cho internal team
- **Claude Code CLI** thay API — flat cost, swap sau qua `interface AgentRunner`
- **Lockfile state** thay DB — stateless mỗi tick, tự recover
- **GitHub Actions** lo merge/deploy — không build trong Orchestrator
- **Sentry poll** thay webhook — cùng pattern poll-based
- **Phase 0 bootstrapping** — hệ thống tự build chính nó qua Linear tickets
- **Không Grader v1** — CI + Sentry + human review là quality gate
- **Không Bridge v1** — GitHub branch protection + auto-merge

## Next Steps
- [ ] Init TypeScript project (package.json, tsconfig, pnpm)
- [ ] Implement Phase 0: `src/index.ts` (~150 lines) — poll Linear → check lockfile → tạo worktree → spawn `claude -p`
- [ ] Tạo Linear project cho agent-harness
- [ ] Test: 1 issue Todo → agent pick up → PR
- [ ] Tạo backlog trên Linear cho Phase 1-9 (retry, stall, Sentry, hooks, ordering...)
- [ ] Dùng agent-harness build phần còn lại

## Key Files
- `CLAUDE.md` — project contract cho agent sessions
- `CONCEPT.md` — architecture overview
- `src/index.ts` — (sẽ tạo) Phase 0 entry point
- `~/Documents/creao-architecture.html` — diagram Creao
- `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/deep-learning/ai-agent/symphony-setup.md` — Symphony setup reference
- `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/deep-learning/ai-agent/official/codex-symphony.md` — Symphony spec gốc
