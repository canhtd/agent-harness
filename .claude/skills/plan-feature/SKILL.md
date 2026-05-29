---
name: plan-feature
description: "Architect mô tả feature → Claude hỏi lại → thống nhất → tạo Linear issues cho agent dispatch. Dùng khi cần tách feature thành tasks có thể dispatch autonomous."
when_to_use: "tạo feature, plan feature, tách task, tạo issue, lên kế hoạch"
---

# Plan Feature

Architect (người) mô tả feature → Claude hỏi lại → thống nhất → tạo Linear issues.

Prefix dòng đầu bằng 🏗️ inline.

## Before Reading Any Code

- Confirm working path: `pwd` hoặc `git rev-parse --show-toplevel`
- Đọc CLAUDE.md, .claude/rules/, GOTCHAS.md của project target
- Scan file tree để hiểu architecture hiện tại
- Nếu project có prior decisions (ADRs, PLANS.md), skim trước khi hỏi

## Bước 1: Thu thập context

Khi user mô tả feature, đọc codebase trước. Sau đó hỏi lại những gì chưa rõ. Hỏi gọn, batch thành 1 message.

### Checklist bắt buộc (hỏi nếu user chưa cung cấp)

- **User / use case**: ai dùng, khi nào, tại sao?
- **Outcome mong muốn**: user thấy gì / hệ thống làm gì khi xong?
- **Điều kiện pass**: làm sao biết feature đúng? (cụ thể, có thể verify bằng code/command)
- **Ràng buộc kỹ thuật**: giới hạn tech stack, performance, security?
- **Design reference**: có Figma/sketch/screenshot không? Nếu UI thì bắt buộc hỏi.
- **Scope boundary**: cái gì KHÔNG nằm trong feature này?

### Không hỏi nếu đã suy ra được

- Files cần sửa → đọc codebase tự xác định
- Tech stack → đọc CLAUDE.md / package.json
- Convention → đọc CLAUDE.md / .claude/rules/

### Blocking ambiguities

Nếu requirements có conflict (2 nguồn mâu thuẫn, 2 cách hiểu khác cost), nêu conflict cụ thể trong 1 câu và hỏi cái nào ưu tiên. Không tự chọn.

## Bước 2: Phân tách issues

Khi đủ context, tách thành issues. Mỗi issue phải:

- **Tự đủ**: agent đọc issue description là làm được, không cần hỏi thêm
- **Nhỏ gọn**: 1 issue = 1 PR, không quá 5 files thay đổi
- **Có dependency rõ**: issue nào blocked-by issue nào
- **Testable**: acceptance criteria có thể verify bằng code/command

### Fragile assumption check

Cho mỗi issue, xác định assumption dễ sai nhất. Ghi rõ: "Issue này giả định X. Nếu X sai, Y xảy ra." Nếu assumption load-bearing và fragile, sửa thiết kế để survive.

### Format mỗi issue

```
Title: [ngắn, rõ action — dưới 70 ký tự]

## Context
[Tại sao cần, nằm trong feature gì lớn hơn]

## Task
[Cụ thể cần làm gì]
[Files ảnh hưởng — đường dẫn cụ thể]
[Architecture decision nếu agent cần biết]

## Design Reference
[Link Figma/sketch nếu có, hoặc mô tả UI expected]
[Bỏ section này nếu không có UI]

## Acceptance Criteria
- [ ] [điều kiện verify được — không mơ hồ]
- [ ] [mỗi criteria là 1 checkbox]
- [ ] Tests cover happy path + edge cases
- [ ] `pnpm typecheck` pass (hoặc verify command của project)
- [ ] `pnpm test` pass
```

### Validation trước khi trình bày

- Quá 5 issues? Cảnh báo user, đề xuất chia phase.
- Issue nào sửa quá 5 files? Tách nhỏ hơn.
- Có cycle trong dependency graph? Sửa lại ordering.
- Có 2 issues sửa cùng file? Cảnh báo — dispatch song song sẽ conflict.
- Mỗi acceptance criterion có verify được bằng command không? Nếu không, viết lại.
- User flow coverage: cho mỗi page/feature, liệt kê 3 user flows chính (happy path, edge case, adjacent use case). Nếu issue description chỉ cover 1 flow, mở rộng scope hoặc tạo follow-up issue.

## Bước 3: Review với user

Trình bày danh sách issues dạng bảng:

| # | Title | Depends on | Files | Effort |
|---|-------|------------|-------|--------|

Kèm theo full description mỗi issue để user review.

Chờ user duyệt / chỉnh sửa. KHÔNG tạo trên Linear cho đến khi user nói "ok", "tạo đi", hoặc tương đương.

Nếu user reject, hỏi cụ thể chỗ nào chưa đúng. Không restart từ đầu.

## Bước 4: Tạo trên Linear

Dùng Linear MCP tools (`save_issue`). Set:
- **team**: đọc từ LINEAR_TEAM_KEY trong .env hoặc hỏi user
- **state**: Todo
- **priority**: theo user hoặc default 3 (Medium)
- **blockedBy**: theo dependency đã xác định
- **labels**: nếu có

Tạo issues theo dependency order — issue không depend vào gì tạo trước, để có ID cho blockedBy.

Sau khi tạo xong, list lại với Linear URLs để user confirm.

## Rules

- KHÔNG tự nghĩ ra feature — user là architect
- KHÔNG tạo issue mơ hồ — agent chạy autonomous, không hỏi lại được
- KHÔNG dùng placeholder trong issue (TBD, TODO, "details later")
- Hỏi gọn, batch câu hỏi, không serial interrogation
- Nếu feature quá lớn (>5 issues), cảnh báo user và đề xuất chia phase
- Conflict với CLAUDE.md rules? Nêu rõ trước khi tạo issue

## Gotchas

| Situation | Rule |
|-----------|------|
| 2 issues sửa cùng file | Cảnh báo merge conflict risk, đề xuất sequential hoặc tách khác |
| User nói "ok" | Tạo trên Linear. Không hỏi lại. |
| Feature cần API key/secret mới | List ra trước khi tạo issues — không để agent discover mid-implementation |
| UI feature không có design ref | Hỏi bắt buộc — agent không tự design UI |
| Issue description dài quá 500 từ | Tách thành 2 issues |
