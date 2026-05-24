# Agent Harness

## Concept

Hệ thống tự động hoá engineering — agent tự build tính năng mới và tự fix lỗi. Internal team tool.

Lấy cảm hứng từ Creao (Peter Pang, @intuitiveml) và Symphony (OpenAI). Tự thiết kế, tự bootstrapping.

## Architecture

```
┌────────────┐  poll   ┌──────────────┐  poll   ┌────────────┐
│   Linear   │◄────────│              │────────►│   Sentry   │
│  (issues)  │         │ Orchestrator │         │  (errors)  │
└────────────┘         │    (Rust)    │         └────────────┘
                       │              │
                       └──────┬───────┘
                              │ spawn
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
               ┌────────┐┌────────┐┌────────┐
               │ Agent  ││ Agent  ││ Agent  │
               │  (CLI) ││  (CLI) ││  (CLI) │
               └───┬────┘└───┬────┘└───┬────┘
                   │         │         │
                   ▼         ▼         ▼
               ┌─────────────────────────────┐
               │     GitHub (PR + Actions)   │
               │  CI → auto-merge → deploy   │
               └─────────────────────────────┘
```

### Orchestrator (core)

Poll Linear → dispatch Claude Code CLI agent cho mỗi task Todo/Rework.

- Poll Linear + Sentry mỗi tick
- Filter: bỏ blocked issues, check concurrency limits
- Sort: priority → created_at → identifier
- Tạo git worktree per issue (isolated workspace, branch riêng)
- Spawn `claude -p` trong worktree
- Track state qua lockfile (PID, attempt, timestamps)
- Retry với exponential backoff khi agent crash
- Stall detection: kill agent idle > 5 phút
- Reconcile: cleanup khi issue chuyển terminal

### Sentry Pipeline

Sentry alert → Orchestrator poll → auto-tạo Linear ticket (stack trace + context, label `sentry-auto`) → Orchestrator dispatch agent → fix.

Dedup bằng Sentry issue fingerprint.

### Quality Gates

- GitHub Actions CI (typecheck, lint) — gate trước merge
- Auto-merge khi CI pass (không human review, giống Creao)
- Sentry monitor post-deploy — error mới → auto-ticket
- Grader (tri-judge panel) defer cho v2 — khi cần fully autonomous deploy

### Agent Self-Improvement

Agent phát hiện pattern lặp → tạo sub-issue (label `agent-suggested`, `tool-building`) → Orchestrator dispatch → agent build skill/script/MCP server → PR → auto-merge.

### Concurrent Agent Strategy

- Mỗi agent chạy trong git worktree riêng (branch riêng, directory riêng)
- `before_run` hook: rebase worktree lên latest main trước mỗi lần dispatch
- PRs merge tuần tự — PR sau auto-rebase lên main mới
- Module extraction giảm xác suất conflict (mỗi agent sửa file khác nhau)

## Flow

### Tính năng mới

```
Human tạo issue Todo trên Linear
  → Orchestrator poll → dispatch agent
  → Agent: đọc CLAUDE.md + issue → explore codebase → implement → typecheck → commit → push → PR
  → GitHub Actions CI
  → CI pass → auto-merge → deploy
```

### Bug fix tự động

```
Sentry detect error
  → Orchestrator poll Sentry → tạo Linear ticket
  → Orchestrator dispatch agent
  → Agent: đọc Sentry error → trace code → fix → PR
  → CI → auto-merge → deploy
  → Sentry: error hết → done / còn → ticket mới
```

### Bootstrapping

Hệ thống tự build chính nó. Phase 0 (poll + dispatch) viết tay, phần còn lại là Linear tickets mà agent-harness tự pick up.

## Technical Decisions

- **TypeScript** — ship nhanh cho internal team, ecosystem giàu (@linear/sdk), JSON native
- **Claude Code CLI** (`claude -p`) — flat cost, tool layer miễn phí (file ops, git, bash, MCP). `interface AgentRunner` sẵn để swap API sau
- **Lockfile state** — không DB, stateless mỗi tick, tự recover
- **GitHub Actions** — CI + auto-merge, không build merge logic trong Orchestrator
- **Sentry poll** — không webhook, cùng pattern poll-based với Linear
- **Phase 0 bootstrapping** — viết cái nhỏ nhất chạy được, rồi dùng chính nó build phần còn lại
- **Team-based filtering** — `LINEAR_TEAM_KEY` là filter chính, project slug optional

## Nguyên tắc

- **Chấm kết quả, không chấm quá trình** — agent đi đường phi tuyến nhưng kết quả đúng thì không phạt
- **Monorepo để AI thấy mọi thứ** — codebase phân mảnh thì vô hình với agent
- **CLAUDE.md = harness** — agent chỉ tốt khi context tốt, đầu tư vào CLAUDE.md
- **Agent tự cải thiện** — build tool/skill khi gặp pattern lặp, không fix từng case
- **Autonomous by default** — agent không hỏi, tự làm hết (implement → test → commit → push → PR)

## Linear

- Team: **Enginear** (key: `ENG`)
- Project: **Agent Harness**
- GitHub: https://github.com/canhtd/agent-harness
