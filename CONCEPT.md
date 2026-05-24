# Agent Harness

## Concept

Hệ thống tự động hoá engineering — agent tự build tính năng mới và tự fix lỗi. Internal team tool.

Lấy cảm hứng từ Creao (Peter Pang, @intuitiveml) và Symphony (OpenAI). Tự thiết kế, tự bootstrapping.

## Architecture

### Orchestrator (core)

Poll Linear → dispatch Claude Code CLI agent cho mỗi task Todo/Rework.

- Poll Linear + Sentry mỗi tick
- Filter: bỏ blocked issues, check concurrency limits
- Sort: priority → created_at → identifier
- Tạo git worktree per issue
- Spawn `claude -p` trong worktree
- Track state qua lockfile (PID, attempt, timestamps)
- Retry với exponential backoff khi agent crash
- Stall detection: kill agent idle > 5 phút
- Reconcile: cleanup khi issue chuyển terminal

### Sentry Pipeline

Sentry alert → auto-tạo Linear ticket (stack trace + context, label `sentry-auto`) → Orchestrator pick up → agent fix.

Dedup bằng Sentry issue fingerprint.

### Quality Gates (thay Grader cho v1)

- CI must pass (GitHub Actions)
- Human review trước merge (v1)
- Sentry monitor post-deploy — error mới → auto-ticket
- GitHub branch protection + auto-merge

### Agent Self-Improvement

Agent phát hiện pattern lặp → tạo sub-issue (label `agent-suggested`, `tool-building`) → Orchestrator dispatch → agent build skill/script/MCP server → PR → human review.

## Flow

### Tính năng mới

```
Human tạo issue Todo trên Linear
  → Orchestrator poll → dispatch agent
  → Agent: đọc CLAUDE.md + issue → explore codebase → implement → test → PR
  → GitHub Actions CI
  → Human review → merge (auto-merge)
  → Deploy
```

### Bug fix tự động

```
Sentry detect error
  → Orchestrator poll Sentry → tạo Linear ticket
  → Orchestrator dispatch agent
  → Agent: đọc Sentry error → trace code → fix → PR
  → CI → human review → merge → deploy
  → Sentry: error hết → done / còn → ticket mới
```

### Bootstrapping

Hệ thống tự build chính nó. Phase 0 (poll + dispatch) viết tay, phần còn lại là Linear tickets mà agent-harness tự pick up.

## Technical Decisions

- **TypeScript** — ship nhanh cho internal team, ecosystem giàu (@linear/sdk, execa), JSON native
- **Claude Code CLI** — flat cost, tool layer miễn phí (file ops, git, bash, MCP). `interface AgentRunner` sẵn để swap API sau
- **Lockfile state** — không DB, stateless mỗi tick, tự recover
- **GitHub Actions** — CI/merge/deploy, không build lại trong Orchestrator
- **Sentry poll** — không webhook, cùng pattern poll-based với Linear
- **Phase 0 bootstrapping** — viết cái nhỏ nhất chạy được, rồi dùng chính nó build phần còn lại

## Nguyên tắc

- **Chấm kết quả, không chấm quá trình** — agent đi đường phi tuyến nhưng kết quả đúng thì không phạt
- **Monorepo để AI thấy mọi thứ** — codebase phân mảnh thì vô hình với agent
- **CLAUDE.md = harness** — agent chỉ tốt khi context tốt, đầu tư vào CLAUDE.md
- **Agent tự cải thiện** — build tool/skill khi gặp pattern lặp, không fix từng case