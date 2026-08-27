---
id: erp-view-design
title: FBO — View and field layout
kind: skill
domain: erp
description: Layout form FBO trong Dir/Filter — item value (cột px + pattern 1/0/- + token [field]), view@anchor/@split/@height, category. Mở khi sửa views, merge cột, hoặc hỏi vì sao form hiện như vậy.
requires: [4ai-fbo]
see-also: [erp-controller-reference, erp-category-create]
version: 2
---
Form FBO **không** phải canvas tọa độ (x,y). Form render ra web là một **`<table>` cột cố định**:
danh sách px khai cột, mỗi `<item>` là một hàng, mỗi ô là một `<td colspan>`.

```text
view
├── height / anchor / split          ← thuộc tính view
├── item value="w1, w2, …"           ← độ rộng cột (px) — item ĐẦU TIÊN, và chỉ nó
├── item value="pattern: controls"   ← mỗi hàng layout
└── categories/category              ← tab (index>0) + footer (index=-1)
```

Skill này dạy **ngữ nghĩa XML** để đọc/sửa đúng. Không gắn một controller cụ thể làm định nghĩa.

---

## Bước 0 — Neo vào khách, trước mọi thứ khác

Chưa biết **program của khách nào** thì chưa bắt đầu. Tra bằng `list_programs` (thư mục
workspace đang đứng cũng tra được), nhắc lại program path để xác nhận, rồi mở entry trong
`ledger/tasks.md` trạng thái `Mới`.

Hai rule luôn-nạp cầm chỗ này, file này không thay thế chúng: `erp-program-scope`
(thay đổi chỉ nằm trong program của đúng khách đó) và `pm-ledger-discipline` (không có entry
thì việc chưa xong, kể cả khi code đã chạy). Quy trình đầy đủ ở `erp-customization-execute`.

---

## Khi nào dùng

- User hỏi / bảo sửa: `anchor`, `split`, `height`, `item value`, pattern, span cột, merge ô
- Thêm field lên form (Label / Input / Description) đúng vị trí cột
- Chỉnh tab category hoặc footer (`categoryIndex`, `columns`)
- Giải thích vì sao form “phóng to lệch”, “hai bảng”, “ô rộng nhiều cột”, “field khai rồi mà không hiện”

**Không** dùng skill này cho: Grid list columns, proc SQL, JS `onChange` (dùng skill tương ứng).

---

## Từ XML ra form trên web

```text
Dir/Filter XML → parse <fields> + <views> → layout model → HTML <table> → DOM
```

Ba điều rút ra, và cả ba đều đổi cách sửa XML:

1. **Cột là `<th style="width:Npx">` trong một `table-layout:fixed`, bề rộng bảng = tổng list px.**
   Ô chiếm nhiều cột là `colspan`, không phải width riêng. Muốn ô rộng hơn: tăng span (thêm `0`)
   hoặc sửa px của chính những cột nó đè lên — không có chỗ nào khai width cho một ô.
2. **`<field>` quyết định ô hiện cái gì; `<item>` chỉ quyết định ô nằm đâu.** Nhãn lấy từ
   `<header>`, mô tả lấy từ `<footer>` (không có thì rơi về `<header>`), bắt buộc nhập thì nhãn
   thêm class required. Sửa chữ trên form là sửa `<field>`, không phải sửa `<item>`.
3. **Vùng của một hàng suy từ `categoryIndex` của field trong hàng đó**, không suy từ thứ tự
   `<item>`. Đặt nhầm `categoryIndex` là hàng nhảy tab, dù `<item>` nằm đúng chỗ trong file.

Chi tiết pipeline và bảng ánh xạ XML → thẻ HTML: [reference-render-pipeline.md]({REFDIR}/reference-render-pipeline.md).

---

## Bản đồ khái niệm (1 phút)

| Khái niệm | XML | Nghĩa |
|-----------|-----|--------|
| **Columns** | Item đầu, không có `:` — `"120, 30, 80, …"` | Độ rộng từng cột (px). Số phần tử = số cột. `0` là cột hợp lệ (spacer). |
| **Pattern** | Trước `:` trong item hàng: `1100-1` | `1` mở control, `0` nối tiếp (span), `-` trống |
| **Controls** | Sau `:` — `[ma_kh].Label, [ma_kh], …` | Token map lần lượt vào mỗi `1` trong pattern |
| **Height** | `view height="280"` hoặc `"&TabHeightFomula;"` | Chiều cao **tab** (không phải vùng main — main co theo nội dung) |
| **Anchor** | `view anchor="N"` (**1-based**) | Cột `1..N` giữ px khi phóng form; cột sau giãn |
| **Split** | `view split="N"` (**1-based**) | Hai table: cột `1..N` trái, `N+1..end` phải — **không** merge qua biên |

Chi tiết: [reference-item-value.md]({REFDIR}/reference-item-value.md), [reference-view-attrs.md]({REFDIR}/reference-view-attrs.md).

---

## Triết lý Slot

```text
Hàng = pattern + danh sách control
Ô (Slot) = một lần gặp '1' (+ các '0' liền sau = ColumnSpan)
Control ≠ “kéo thả pixel” — chỉ chiếm Slot
```

**Merge cột** = đổi pattern: hai ô liền kề → `1` + thêm `0` (tăng span), giữ nguyên token field.
**Tách ô** = bỏ `0`, phần còn lại thường thành `-` (trống).

Bất biến thật sự phải giữ là **số `1` = số token**, và mọi `1` phải rơi trong số cột đã khai.
Độ dài pattern thì lỏng: ngắn hơn số cột được pad `-`, dài hơn bị **cắt cụt** — và cắt cụt là chỗ
mất token âm thầm nếu phần bị cắt có chứa `1`.

---

## Workflow chỉnh layout

```
- [ ] 1. Xác định vùng: Main | Tab categoryIndex>0 | Footer categoryIndex=-1
- [ ] 2. Đếm cột đúng vùng đó: main/tab-không-khai = item widths đầu view; tab/footer có @columns = list của nó
- [ ] 3. Sửa pattern + token cùng lúc — số '1' = số token control
- [ ] 4. Tôn trọng split: không để một span (1+0…) vượt biên split
- [ ] 5. Field phải tồn tại trong <fields>; categoryIndex của field quyết định hàng thuộc vùng nào
- [ ] 6. Nếu item còn &Entity; — không thay cả value bằng ClearText; sửa đúng phần ownership (literal vs entity)
```

### Thêm một field lên 1 hàng (mẫu)

1. Có `<field name="{ten}">` (và `categoryIndex` nếu tab/footer).
2. Chọn cột trống (`-`) hoặc chèn bằng cách dời pattern.
3. Đặt `1` (và `0…` nếu span) + thêm token tương ứng:
   - Label: `[{ten}].Label`
   - Input: `[{ten}]`
   - Mô tả (đọc `<footer>` của field): `[{ten}].Description`

Thứ tự token = thứ tự các `1` từ trái sang phải. Tên trong `[]` phải **khớp nguyên văn**
`<field name="…">`, kể cả hậu tố `%l` (`[ten_tk%l]`) và kể cả khi tên là entity (`[&k;]`).

---

## Field khai rồi mà không hiện trên form

| Triệu chứng | Nguyên nhân thật | Chỗ sửa |
|---|---|---|
| Cả hàng biến mất | Mọi control trong hàng đều là field `hidden="true"` → hàng không được render | `<field hidden>` |
| Ô trống nhưng cột vẫn chừa | Một field trong hàng hỗn hợp là `hidden` → giữ cột, bỏ control | `<field hidden>` |
| Field nhảy sang tab khác | `categoryIndex` của field, không phải vị trí `<item>` | `<field categoryIndex>` |
| Token cuối hàng mất tác dụng | Pattern dài hơn số cột → bị cắt, `1` cuối rơi ra ngoài | pattern hoặc list px |
| Ô hiện nhưng không có chữ | `.Description` mà field không có `<footer>` → rơi về `<header>`; `<header>` rỗng thì ô rỗng | `<field><footer>` |
| Ô phình thành cả một lưới | `field@itemsStyle="Grid"` — ô nhúng nguyên một Grid Detail, cao theo `field@rows` | `<items controller>` / `rows` |

---

## Checklist nhanh

- [ ] Số `1` trong pattern = số token sau `:`
- [ ] Mọi `1` nằm trong phạm vi số cột (pattern dài hơn bị cắt, không báo lỗi)
- [ ] `0` chỉ đứng ngay sau `1` (continuation) — không “mồ côi”
- [ ] `anchor` / `split` trong `1..ColumnCount`; `0`/bỏ attr = tắt
- [ ] Không merge span qua `split`; view có `@split` thì **không xoá hàng một bên** (hai nửa căn theo nhau)
- [ ] Đổi width: sửa list px — **tổng** đổi theo, vì bề rộng bảng chính là tổng
- [ ] Item đầu tiên của view mà có `:` thì view **không có** list cột nào cả — kiểm tra trước khi đếm

---

## Tài liệu

| File | Nội dung |
|------|----------|
| [reference-item-value.md]({REFDIR}/reference-item-value.md) | Item columns vs pattern; token; merge/span; entity; `<items>` bẫy trùng tên |
| [reference-view-attrs.md]({REFDIR}/reference-view-attrs.md) | height (và `&TabHeightFomula;`), anchor, split, categories, categoryIndex |
| [reference-render-pipeline.md]({REFDIR}/reference-render-pipeline.md) | XML → HTML: thẻ nào ra thẻ nào, cái gì bị bỏ khi render |
