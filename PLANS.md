# Plans

## Phases

### Phase 1: Orchestrator ✅
Poll Linear → dispatch Claude Code CLI agents → isolated workspaces → PR lifecycle.

- [x] Poll Linear cho Todo issues (team-based filter)
- [x] Dispatch ordering: priority → created_at → identifier
- [x] Git worktree isolation per issue
- [x] Spawn `claude -p` với autonomous prompt
- [x] Lockfile-based state tracking
- [x] Retry với exponential backoff (ENG-1)
- [x] Stall detection + kill process group (ENG-2, ENG-11)
- [x] Blocked issue filtering (ENG-3)
- [x] Terminal issue cleanup (ENG-4)
- [x] Rework status support + full reset (ENG-5)
- [x] WORKFLOW.md template rendering (ENG-6)
- [x] Workspace hooks: after_create, before_run, after_run, before_remove (ENG-7)
- [x] Module extraction (ENG-8)
- [x] PR reconciliation loop + multi-turn `--continue` (ENG-10)
- [x] Polling loop (5 min interval, `pnpm start`)
- [x] GitHub Actions CI (typecheck + build + security gate)
- [x] Auto-merge khi CI pass
- [x] Acceptance criteria verification trong prompt
- [x] .claude/rules/ cho agent behavior

### Phase 2: Sentry Pipeline ⚠️ Code done, chưa verify
Sentry error → auto-tạo Linear ticket → Orchestrator dispatch → agent fix.

- [x] `src/sentry.ts` — poll Sentry API, dedup, create Linear ticket (ENG-9)
- [ ] Config `.env`: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- [ ] Test end-to-end: Sentry error → Linear ticket tự tạo → agent fix → PR → merge
- [ ] Verify dedup: cùng Sentry issue không tạo 2 Linear tickets

### Phase 3: Quality Gates + Post-deploy monitoring ⚠️ Partially done
CI gates trước merge + Sentry monitor sau deploy.

- [x] GitHub Actions CI: typecheck + build
- [x] Security gate: block PR sửa `.env`
- [x] Auto-merge: CI pass → squash merge
- [x] Branch protection: require CI pass
- [ ] Sentry post-deploy watch — error mới sau merge → auto-ticket (cần Phase 2 hoạt động)
- [ ] Auto-revert khi Sentry spike sau deploy (advanced — defer nếu chưa cần)
- [ ] AI code review trên PR (Creao dùng 3x Claude review — defer, đắt)

### Phase 4: Grader + Bridge (deferred)
Khi muốn fully autonomous deploy hoặc quality drift detection.

**Grader (tri-judge panel):**
- [ ] 3 model families chấm song song (Anthropic, OpenAI, Google)
- [ ] Structured output: reasoning, category, quality, issues, confidence
- [ ] Consensus bằng mean scoring
- [ ] Sampling: 10% model chính, 100% model thử nghiệm
- [ ] Cần chuyển agent runtime từ CLI sang API (`interface AgentRunner` → `ApiRunner`)

**Bridge (grey rollout):**
- [ ] Merge → 10% traffic sang bản mới
- [ ] Grader chấm đối đầu baseline real-time
- [ ] Statistical test: p < 0.05, min 200 interactions
- [ ] Promotion: 5% → 20% → 50% → 100%
- [ ] Fail: score giảm ≥ 0.15 → abort → revert → ticket

**Trigger để bắt đầu Phase 4:**
- Volume đủ lớn (hàng trăm agent interactions/ngày)
- Muốn bỏ CI gate, deploy hoàn toàn tự động
- Quality drift detection (code style, architecture erosion)

## Bootstrapping Strategy

Hệ thống tự build chính nó:
- Phase 0 (poll + dispatch) viết tay
- Phase 1 features = Linear tickets mà orchestrator dispatch agents
- Agents tự tạo improvement issues (ENG-10, ENG-11 là ví dụ)
- Từ Phase 2+: tạo issue trên Linear → orchestrator tự dispatch

## Known Issues / Gotchas

Xem [GOTCHAS.md](GOTCHAS.md) cho danh sách pitfalls đã gặp.

Key patterns:
- Dispatch nhiều agents cùng lúc sửa cùng file → merge conflict → cần sequential dispatch hoặc reconciliation re-dispatch
- Agent code từ main cũ → conflict khi merge → reconciliation loop auto-detect + re-dispatch
- `claude -p` one-shot nhưng `--continue` cho multi-turn
- Orchestrator code thay đổi cần restart (`pkill + pnpm start`)
