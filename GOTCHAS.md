# Gotchas

Lỗi đã gặp trong quá trình build. Đọc trước khi làm bất kỳ task nào.

## Blocked issues được filter qua inverseRelations

`fetchCandidates()` check `inverseRelations` (type `blocks`) cho mỗi issue. Nếu bất kỳ blocker nào chưa ở terminal state (Done, Canceled, Duplicate), issue bị skip. Log entry: `issue blocked` kèm blocker identifiers. Fixed: ENG-3.

## Nhiều agents sửa cùng file = merge conflict

Nếu dispatch nhiều issues cùng lúc và tất cả sửa `src/index.ts`, worktrees sẽ conflict khi merge. Phải tách modules trước (ENG-8) rồi mới dispatch song song. Rule: không dispatch nhiều issues cùng sửa 1 file.

## Linear project ≠ team

Linear project = epic (tạm thời, có deadline). Team = đơn vị tổ chức chính. Orchestrator filter theo `LINEAR_TEAM_KEY`, không phải project slug. Project slug là optional scope.

## Linear priority 0 = no priority

Linear priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low. Priority 0 không phải cao nhất — nó nghĩa là chưa set. Dispatch ordering xếp 0 và null cuối cùng.
