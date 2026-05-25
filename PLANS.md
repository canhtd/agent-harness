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

### Phase 2: Sentry Pipeline ✅
Sentry error → auto-tạo Linear ticket → Orchestrator dispatch → agent fix.

- [x] `src/sentry.ts` — poll Sentry API, dedup, create Linear ticket (ENG-9)
- [x] Config `.env`: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- [x] Test: Sentry error → Linear ticket tự tạo (ENG-13)
- [ ] Triage engine — severity scoring + context điều tra trong ticket
- [ ] Post-fix verify — poll Sentry sau merge, auto-close ticket nếu error hết
- [ ] Verify dedup: cùng Sentry issue không tạo 2 Linear tickets (cần lỗi thật)

### Phase 3: Quality Gates ✅
CI gates trước merge + AI review.

- [x] GitHub Actions CI: typecheck + build + test (vitest)
- [x] Security gate: block PR sửa `.env`
- [x] Auto-merge: CI pass + review approve → squash merge
- [x] Branch protection: require CI pass + 1 approval
- [x] 3x AI code review song song: quality, security, deps (ENG-12)
- [x] Bot account (`duccanh88`) cho review approval
- [x] Agent prompt: mandatory test generation (feature + bug fix)
- [x] Bug fix prompt: reproduce-first approach (label `sentry-auto`/`bug`)
- [ ] Sentry post-deploy watch — error mới sau merge → auto-ticket (cần lỗi thật)
- [ ] Auto-revert khi Sentry spike sau deploy (advanced — defer)

### Phase 3.5: Operational Robustness ⚠️
Hệ thống tự vận hành ổn định.

- [ ] Auto-restart orchestrator sau khi main thay đổi
- [ ] Merge queue (GitHub merge queue) — rebase + re-run CI trước merge
- [ ] Process manager (pm2/launchd) — auto-restart nếu crash
- [x] Full pipeline test: ENG-14 dispatch → code + test → PR → review → merge ✅

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
