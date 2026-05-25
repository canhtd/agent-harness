# Gotchas

Lỗi đã gặp trong quá trình build. Đọc trước khi làm bất kỳ task nào.

## Blocked issues được filter qua inverseRelations

`fetchCandidates()` check `inverseRelations` (type `blocks`) cho mỗi issue. Nếu bất kỳ blocker nào chưa ở terminal state (Done, Canceled, Duplicate), issue bị skip. Log entry: `issue blocked` kèm blocker identifiers. Fixed: ENG-3.

## Nhiều agents sửa cùng file = merge conflict

Nếu dispatch nhiều issues cùng lúc và tất cả sửa `src/index.ts`, worktrees sẽ conflict khi merge. Phải tách modules trước (ENG-8) rồi mới dispatch song song. Rule: không dispatch nhiều issues cùng sửa 1 file.

## Linear project ≠ team

Linear project = epic (tạm thời, có deadline). Team = đơn vị tổ chức chính. Orchestrator filter theo `LINEAR_TEAM_KEY`, không phải project slug. Project slug là optional scope.

## spawn stdio cần file descriptor, không phải WriteStream

`child_process.spawn` với `detached: true` không chấp nhận `createWriteStream()` làm stdio. Dùng `openSync()` trả về fd (number) thay thế.

## Stale branch khi tạo worktree

`git worktree add -b "agent/X"` fail nếu branch đã tồn tại từ lần chạy trước. Fix: `git branch -D` trước khi tạo worktree mới.

## Agent dừng lại hỏi thay vì tự làm

Claude Code ở `-p` mode không có TTY → nếu agent hỏi "shall I proceed?" sẽ không ai trả lời và task dừng. Prompt phải nói rõ: "You are running autonomously — do not ask for confirmation" và liệt kê đầy đủ steps.

## Agent refactor không kế thừa local fixes

Khi agent tách modules, nó dựa trên `origin/main` — không thấy fixes chưa commit trên local. Fixes phải merge vào main TRƯỚC khi agent tạo branch.

## Branch protection chặn push trực tiếp lên main

Mọi thay đổi phải qua PR + CI pass. Kể cả CI config fixes.

## pnpm approve-builds / --ignore-scripts

CI cần `pnpm install --ignore-scripts` vì esbuild postinstall bị block. Local worktree cần `pnpm approve-builds esbuild`.

## STALL_TIMEOUT_MS phải < POLL_INTERVAL_MS

Nếu stall timeout ≥ poll interval, stall detection có thể miss 1 tick — agent stall không bị kill cho đến tick sau. Default: stall timeout = 180s, poll interval = 300s.

## Linear priority 0 = no priority

Linear priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low. Priority 0 không phải cao nhất — nó nghĩa là chưa set. Dispatch ordering xếp 0 và null cuối cùng.

## Branch name chứa issue identifier = Linear auto-close nhầm

Linear GitHub integration detect issue identifier (ví dụ `ENG-13`) trong branch name. Nếu PR merge → Linear tự chuyển issue sang Done. Không đặt branch name chứa identifier của issue không liên quan. Branch `agent/ENG-13-test-framework` khiến ENG-13 bị close nhầm khi PR merge.

