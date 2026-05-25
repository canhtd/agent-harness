# Handoff

## Current State
Điều tra xong root cause issue bị "stuck", đã tạo ticket trên Linear, chưa implement.

## Done
- [x] Điều tra tại sao ENG-5, ENG-7 không hoàn thành
- [x] Research cách Symphony (OpenAI) xử lý stuck agents
- [x] Retrigger CI cho PR #14 (ENG-5) và PR #16 (ENG-7) bằng empty commit
- [x] Tạo ENG-10 trên Linear: PR reconciliation loop
- [x] Tạo ENG-11 trên Linear: fix stall detection

## Tried & Failed
- **Wall-clock timeout (kill sau 30 phút)** — sai hướng. Agent không treo, nó exit bình thường sau khi tạo PR. Vấn đề là không ai theo dõi PR outcome.
- **`--max-budget-usd` cap** — cũng sai hướng vì cùng lý do. Claude CLI không có `--max-turns`.

## Decisions

### Agent không stuck — thiếu feedback loop
Agent chạy 1 shot: tạo PR → exit clean. Sau đó không có automation nào sync PR outcome về Linear. PR bị reject → Linear vẫn In Progress mãi → trông như "stuck".

### Reconciliation loop (ENG-10) — giải pháp chính
Mỗi orchestrator tick cần thêm reconciliation step: scan In Progress issues không có running agent → check GitHub PR status → tự chuyển Linear status:
- PR merged → Done
- PR closed/rejected → Rework
- PR open + CI fail → Rework
- PR open + CI pending → skip

Symphony (OpenAI) dùng pattern tương tự, gọi là reconciliation loop.

### Stall detection có bug thật nhưng không phải root cause (ENG-11)
`STALL_TIMEOUT_MS` = `POLL_INTERVAL_MS` = 5 phút → race condition. `process.kill(pid)` chỉ kill shell, không kill child claude process. Priority thấp hơn ENG-10.

## Next Steps
- [ ] Merge PR #14 (ENG-5) và PR #16 (ENG-7) sau khi CI pass
- [ ] Chuyển ENG-10, ENG-11 sang Todo trên Linear để orchestrator tự pick up
- [ ] Sau khi ENG-10 merge: chạy orchestrator, verify reconciliation loop chuyển đúng status

## Key Files
- `src/orchestrator.ts` — tick loop, nơi sẽ gọi reconcile()
- `src/lockfile.ts` — detectStalls() có bug stall timeout race condition
- `src/runner.ts` — spawn agent, không cần sửa
- `GOTCHAS.md` — pitfalls đã biết
