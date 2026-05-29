# WorkOS Design System

Ngôn ngữ thiết kế cho workspace WorkOS, trích từ app sống của Linear (`linear.app`) ngày 2026-05-29. Màu gốc ở LCH, resolve sang sRGB. Mọi giá trị dưới đây lấy từ 393 CSS variables thật, không phỏng đoán.

---

## 1. Theme

Linear là dark-first nhưng workspace mặc định có thể light. Hai theme dùng chung một bộ token ngữ nghĩa, chỉ đổi giá trị nền/chữ. Brand và status color giữ nguyên qua cả hai.

| Token | Dark | Light |
|---|---|---|
| `--bg-primary` | `#0f0f11` | `#fcfcfd` |
| `--bg-secondary` | `#1a1a1c` | `lch(96.94% 0.5 282)` |
| `--bg-tertiary` | `#232326` | `lch(93.44% 0.5 282)` |
| `--bg-elevated` (menu/card) | `#1c1c1d` | `#ffffff` |
| `--bg-sidebar` | `#090909` | `#f5f5f5` |
| `--border-primary` | `#1c1e21` | `lch(96.24% 0 282)` |
| `--border-secondary` | `#26282c` | `#e0e0e0` |
| `--text-primary` | `#ffffff` | `lch(9.894% 0 282)` |
| `--text-secondary` | `#d0d2d6` | `lch(19.788% 1.25 282)` |
| `--text-tertiary` | `#b0b5c0` | `lch(39.576% 1.25 282)` |
| `--text-quaternary` | `#6b6f76` | `lch(65.3% 1.25 282)` |

Hue 282° (xanh tím nhạt) nhuộm đều cả thang xám. Giao diện cố tình giữ gần đơn sắc để màu status mang toàn bộ tín hiệu.

---

## 2. Palette

### Brand

| Vai trò | Giá trị |
|---|---|
| Accent / primary / Done | `#5E6AD2` (`lch(53 52.26 286.91)`) |
| Accent hover | `#6872E0` |
| Focus ring | `#6D78D5`, width `1px` |

### Status

| Status | Màu | Hình |
|---|---|---|
| Backlog | `#8A8F98` | circle dashed |
| Todo | `#8A8F98` | circle viền |
| In Progress | `#F2C94C` | pie ~20% |
| In Review | `#4CB782` | pie ~65% |
| Rework | `#E8900C` | pie ~80% |
| Blocked | `#EB5757` | pie ~90% |
| Done | `#5E6AD2` | circle đầy + check |
| Canceled | `#95A2B3` | circle đầy + x |
| Duplicate | `#95A2B3` | circle đầy + slash |
| Triage | `#F2994A` | circle đầy + mũi tên gộp |

### Priority

| Priority | Màu | Hình |
|---|---|---|
| No priority | `#8A8F98` | 3 vạch ngang mờ |
| Low | `#6B6F76` | 1 cột đậm + 2 cột `opacity .4` |
| Medium | `#6B6F76` | 2 cột đậm + 1 mờ |
| High | `#6B6F76` | 3 cột đậm |
| Urgent | `#FC7840` | ô vuông bo tròn + `!` |

---

## 3. Typography

Font stack: `"Inter Variable", "SF Pro Display", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif`. Root `16px`.

Dấu ấn riêng của Linear là dùng weight trung gian của Inter Variable (`450 / 510 / 550`) chứ không chỉ 400/500/600, và siết letter-spacing âm ở size lớn.

| Vai trò | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Title | `24px` | 600 | 32px | `-0.16px` |
| Heading | `19px` | 600 | 28px | `+0.05px` |
| Body / editor | `15px` | 450 | 24px | `-0.1px` |
| UI label | `13px` | 500 | normal | normal |
| **UI text (base)** | `12px` | 400 | 20px | normal |
| Overline | `11px` | 510 | uppercase | `+0.05em` |

`12px` là size dùng nhiều nhất (list, menu, metadata). Editor letter-spacing `-0.00667em`, line-height `1.6`.

---

## 4. Components

Mọi control cao **28px**, font `13px`, weight `500`, gap nội dung `6px`. Transition chỉ chạy trên `background`, `border-color`, `box-shadow`, `transform` (`120ms`), không bao giờ `transition: all`. Press dùng `transform: scale(0.96)` để có thể ngắt giữa chừng. Mọi state đều tôn trọng `prefers-reduced-motion`.

### Button

Mỗi loại có 5 state. Disabled: `opacity .5`, `cursor: not-allowed`, bỏ hover/press. Focus-visible: `box-shadow 0 0 0 1px #6D78D5` (kèm offset `1px` để vòng không dính nền).

| Loại | default | hover | active (press) | disabled |
|---|---|---|---|---|
| Primary | nền `#5E6AD2`, chữ `#fff`, radius `8px` | nền `#6872E0` | `scale(0.96)`, nền `#525CC4` | `opacity .5` |
| Primary CTA (empty-state) | như trên, radius pill `9999px`, size `12px`, padding `0 14px` | `#6872E0` | `scale(0.96)` | `opacity .5` |
| Secondary | nền `--bg-tertiary`, viền `--border-secondary`, radius `8px` | nền `--bg-elevated` | `scale(0.96)` | `opacity .5` |
| Ghost | transparent, chữ `--text-secondary` | nền `--bg-tertiary`, chữ primary | `scale(0.96)` | `opacity .5` |
| Icon `28×28` | transparent, chữ `--text-tertiary`, pill | nền `--bg-tertiary`, chữ primary | `scale(0.96)` | `opacity .5` |

Phím tắt đặt inline dưới dạng `<kbd>` (`C`, `Esc`...). Icon-only button bắt buộc `aria-label`.

### Input

Cao `28px`, viền `--border-secondary`, radius `8px`, nền `--bg-input`. Tĩnh, không shadow.

| State | Biểu hiện |
|---|---|
| default | viền `--border-secondary`, placeholder `--text-quaternary` |
| hover | viền đậm hơn một bậc (`--border-secondary` → tone kế) |
| focus | viền `#6D78D5` + `box-shadow 0 0 0 1px #6D78D5` |
| error | viền `#EB5757` + `box-shadow 0 0 0 1px #EB5757`, message ngay dưới field |
| disabled | `opacity .5`, `cursor: not-allowed` |

### Status pill / Label

- Status: icon + text inline, không khung. Không có hover riêng (cả hàng issue mới có hover).
- Label: pill viền (`9999px`), cao `22px`, có dot màu `8px` phía trước. Hover: nền `--bg-tertiary`.

### Menu / Popover

Surface biểu tượng nhất của Linear:
- Nền `--bg-elevated`, radius `12px`, viền `0.5px solid --border-secondary`, shadow 3 chặng (mục 6)
- Header search: placeholder `--text-quaternary` + kbd căn phải
- Hàng (`menu-item`) cao `32px`, radius `6px`, gap `9px`, phím tắt mono `11px` căn phải

| State hàng | Biểu hiện |
|---|---|
| default | chữ `--text-secondary`, icon màu status |
| hover / focus (bàn phím) | nền `--bg-tertiary`, chữ `--text-primary` |
| selected | hiện dấu check căn phải |

### Nav item (sidebar)

Cao `28px`, radius `8px`, gap `8px`, size `13px`.

| State | Biểu hiện |
|---|---|
| default | chữ `--text-tertiary` |
| hover | nền `--bg-tertiary`, chữ `--text-primary` |
| active (trang hiện tại) | nền `--bg-tertiary`, chữ `--text-primary`, weight `500` |

### Issue row

Dày `44px`: `[priority] [ID mono 12px] [status] [title] ... [metadata] [avatar 20px]`.

| State | Biểu hiện |
|---|---|
| default | nền trong suốt, ID dùng `tabular-nums` |
| hover | nền `--bg-tertiary` |
| selected | nền `--bg-tertiary` + thanh accent `2px` `#5E6AD2` bên trái (tùy chọn) |

Avatar gradient tròn `20px`.

---

## 5. Layout

| Token | Giá trị |
|---|---|
| Sidebar width | `244px` |
| Control height | `28px` |
| Nav item height | `28px`, radius `8px` |
| Topbar | sticky, `backdrop-filter: blur(20px) saturate(180%)` |
| Content max-width | ~`940px`, căn giữa |

Sidebar nền tối hơn main 1 bậc (dark) hoặc `#f5f5f5` vs `#fcfcfd` (light), tách bằng background-step chứ không bằng shadow. Nhóm nav có label uppercase `11px/510`.

---

## 6. Depth

Linear gần như không dùng shadow nặng. Quy tắc tách bề mặt:

1. **Bề mặt cạnh nhau**: chênh nền 1 bậc hoặc viền `0.5px–1px`. Không shadow.
2. **Card nghỉ**: shadow rất nhẹ
   `0 3px 6px -2px rgba(0,0,0,.02), 0 1px 1px rgba(0,0,0,.04)` (light).
3. **Floating layer (popover/menu)**: shadow 3 chặng
   `lch(0 0 0/.02) 0 6px 18px, lch(0 0 0/.04) 0 3px 9px, lch(0 0 0/.04) 0 1px 1px`.

### Radius scale

`6px` editor block → `8px` control → `10px` item/card → `12px` menu → `9999px` pill.

---

## 7. Do / Don't

**Do**
- Giữ control ở `28px`, dùng `8px` làm radius mặc định.
- Để màu status/priority gánh tín hiệu, phần còn lại gần đơn sắc.
- Tách bề mặt bằng background-step hoặc viền `0.5px` trước khi nghĩ đến shadow.
- Đặt phím tắt inline cạnh action.
- Dùng weight Inter trung gian (450/510/550) cho hệ phân cấp tinh tế.

**Don't**
- Đừng đổ shadow đậm lên surface tĩnh.
- Đừng dùng nhiều primary button trong một view.
- Đừng phình radius (mọi thứ bo tròn) hoặc trộn nhiều radius lạ trong cùng cụm.
- Đừng tăng accent thành nhiều màu loè, chỉ một indigo.
- Đừng để chữ nhảy lên 14-16px cho UI dày, base là `12px`.

---

## 8. Responsive

| Breakpoint | Hành vi |
|---|---|
| `> 880px` | sidebar `244px` cố định + main |
| `≤ 880px` | ẩn sidebar, grid 4 cột → 2 cột, padding nội dung giảm `32px → 20px` |

Control giữ `28px` ở mọi width. Test chuỗi dài và label localized trong button/tab/card hẹp trước khi ship.

---

## 9. Agent prompt guide

### Quick color reference

```
accent/done    #5E6AD2     accent-hover  #6872E0     focus-ring   #6D78D5
canvas (dark)  #0F0F11     sidebar       #090909      elevated     #1C1C1D
canvas (light) #FCFCFD     sidebar       #F5F5F5      elevated     #FFFFFF
text 1/2/3/4   #FFFFFF / #D0D2D6 / #B0B5C0 / #6B6F76   (dark)
border         #1C1E21 (dark)  /  #E0E0E0 (light)
status  todo #8A8F98 · progress #F2C94C · review #4CB782 · rework #E8900C
        blocked/urgent #EB5757 · done #5E6AD2 · canceled #95A2B3 · triage #F2994A
```

### Prompt mẫu (paste thẳng, mọi giá trị đã inline)

1. **Primary button**
   > Tạo button "Create issue" cao `28px`, nền `#5E6AD2`, chữ `#fff` `13px` weight `500`, radius `8px`, padding `0 12px`, gap `6px`. Hover nền `#6872E0`; press `transform: scale(0.96)`; focus-visible `box-shadow 0 0 0 1px #6D78D5`. Kèm `<kbd>C</kbd>` mono `10.5px` căn phải. Chỉ transition `background, transform, box-shadow` trong `120ms`.

2. **Status dropdown (popover)**
   > Tạo popover rộng `240px`, nền `#1C1C1D`, radius `12px`, viền `0.5px solid #26282C`, shadow `0 6px 18px rgba(0,0,0,.18), 0 3px 9px rgba(0,0,0,.22), 0 1px 1px rgba(0,0,0,.22)`, padding `6px`. Header "Change status…" chữ `#6B6F76` + `<kbd>S</kbd>` căn phải. Mỗi hàng cao `32px`, radius `6px`, gap `9px`: icon status `14px` + label `13px` `#D0D2D6` + số phím tắt mono `11px` `#6B6F76` căn phải. Hover hàng nền `#232326`, chữ `#fff`.

3. **Issue list row**
   > Tạo hàng issue cao `44px`, padding `0 14px`, gap `10px`, viền dưới `1px #1C1E21`: icon priority `16px`, ID `ENG-79` mono `12px` `#6B6F76` `tabular-nums` rộng `54px`, icon status `14px`, title `13px` `#fff` truncate, đẩy avatar tròn `20px` gradient về cuối. Hover cả hàng nền `#232326`.

4. **Sidebar nav**
   > Tạo sidebar rộng `244px`, nền `#090909`, viền phải `1px #1C1E21`, padding `16px 12px`. Mỗi nav item cao `28px`, radius `8px`, padding `0 8px`, gap `8px`, chữ `13px` `#B0B5C0`. Hover nền `#232326` chữ `#fff`; item active nền `#232326` chữ `#fff` weight `500`. Group label uppercase `11px` weight `510` `#6B6F76`, letter-spacing `.04em`.

5. **Empty state**
   > Tạo empty state căn giữa: cụm icon status mờ, tiêu đề `15px` weight `500` `#fff`, mô tả `13px` `#B0B5C0` rộng tối đa `360px`. CTA chính "Create new issue" pill `9999px` nền `#5E6AD2` chữ `#fff` `12px` weight `500` padding `0 14px` cao `28px` + `<kbd>C</kbd>`; cạnh đó nút secondary "Documentation" nền `#232326` viền `#26282C`.

Token và icon đầy đủ ở `index.html` (object `ICONS`/`PRIO`) và thư mục `icons/`.

---

## Phụ lục: đối chiếu với preset marketing

`preset/linear-app-preset.DESIGN.md` (chạy `npx getdesign add linear.app`) mô tả **marketing site**, không phải product app:

| | App (bản này) | Marketing preset |
|---|---|---|
| Canvas tối | `#0F0F11` | `#010102` |
| Type | UI dày `12–13px` | hero `40–80px` |
| Accent | `#5E6AD2` | `#5E6AD2` ✓ khớp |
| Gray phụ | `#8A8F98` | `#8A8F98` ✓ khớp |
| Hairline | `#1C1E21` | `#23252A` |
| Hover primary | `#6872E0` | `#828FFF` |

Preset xác nhận accent, gray, negative-tracking và weight 500-700. Khác biệt là do hai surface khác nhau. Bản từ app sống là chuẩn cho design system của sản phẩm.
