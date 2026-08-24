---
id: fbo-create-category
title: FBO — Create or edit a category screen
kind: skill
domain: erp
description: Tạo hoặc sửa danh mục FBO — cặp Dir (form) + Grid (list), khai khóa chính, validation trùng và lồng bằng fsd_StringToTable với OldValue, tạo bảng và PK. Mở khi user đưa cặp Dir/Grid.
requires: [4ai-fbo]
see-also: [fbo-controller-anatomy, fbo-design-view-field, fbo-new-table-proposal]
version: 1
---
Danh mục = **cặp file** `Dir/{controller}.xml` (form) + `Grid/{controller}.xml` (list). Bảng dữ liệu thường trùng tên controller; Grid có thể trỏ **view** (`zv...`) join cột hiển thị.

**Nguyên tắc:** chỉ sửa đúng phạm vi user yêu cầu.

---

## Bước 0 — Neo vào khách, trước mọi thứ khác

Chưa biết **program của khách nào** thì chưa bắt đầu. Tra bằng `list_programs` (thư mục
workspace đang đứng cũng tra được), nhắc lại program path để xác nhận, rồi mở entry trong
`ledger/tasks.md` trạng thái `Mới`.

Hai rule luôn-nạp cầm chỗ này, file này không thay thế chúng: `erp-program-scope`
(thay đổi chỉ nằm trong program của đúng khách đó) và `pm-ledger-discipline` (không có entry
thì việc chưa xong, kể cả khi code đã chạy). Quy trình đầy đủ ở `fbo-customization-workflow`.

---

## Workflow

```
- [ ] B1. Khảo sát: Dir + Grid + bảng/view (MCP)
- [ ] B2. XML: code/order + isPrimaryKey ([xml-structure.md]({REFDIR}/xml-structure.md))
- [ ] B3. Validation Dir commands ([check-trung.md]({REFDIR}/check-trung.md))
- [ ] B4. Database: bảng + PK + structure ([database.md]({REFDIR}/database.md))
- [ ] B5. Verify MCP
```

---

## B1 — Khảo sát

- Đọc cặp Dir + Grid.
- MCP `query_sql`: view Grid → biết join; bảng gốc → cột + PK.

```sql
SELECT c.name, t.name AS type, c.max_length,
       CASE WHEN i.is_primary_key = 1 THEN 1 ELSE 0 END AS is_pk
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
LEFT JOIN sys.index_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
LEFT JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND i.is_primary_key = 1
WHERE c.object_id = OBJECT_ID('{table}')
ORDER BY c.column_id
```

View có thể tồn tại khi bảng chưa có → tạo bảng ở B4.

---

## B2 — XML (khóa & field)

[xml-structure.md]({REFDIR}/xml-structure.md)

- `code` / `order` = danh sách cột khóa (đơn hoặc kép).
- Mỗi cột khóa: `isPrimaryKey="true"` (Dir + Grid).
- Field Lookup chọn nhiều → lưu CSV → ảnh hưởng pattern validation (B3).

---

## B3 — Validation khi lưu (Dir commands)

[check-trung.md]({REFDIR}/check-trung.md)

Bốn command chuẩn: `Declare` · `Inserting` · `Updating` · `Updated`.

**Chọn pattern** theo nghiệp vụ (không gắn một danh mục cụ thể):

| Pattern | Khi nào |
|---------|---------|
| A — Khóa đơn | Một mã duy nhất toàn bảng |
| B — Khóa kép | Identity dòng = tổ hợp nhiều cột (chuỗi PK chính xác) |
| C — Giao CSV | Một cột chứa danh sách `A,B,C`; cấm trùng phần tử trong cùng phạm vi |

Quy tắc chung:
- So sánh bằng `=`, không `LIKE` (trừ nghiệp vụ hierarchy riêng user yêu cầu).
- Sửa: `$col.OldValue` định vị dòng cũ; `@col` là giá trị mới.
- `Updated`: `WHERE` theo OldValue của **tất cả** cột khóa.

---

## B4 — Database

[database.md]({REFDIR}/database.md)

- PK đơn/kép khớp XML `code`.
- `generate_sql_for_fields` cho cột thường; PK composite → `CREATE TABLE` / `ALTER TABLE`.
- File `Structure/App/{table}.xml`.

---

## B5 — Verify

- Query lại cấu trúc + PK.
- `SELECT TOP 1 * FROM {view}` không lỗi.

---

## Quy tắc sửa file

- `.xml`/`.sql`: **StrReplace** từng khối; không rewrite cả file.
- Không format on save; không dòng trắng trong CDATA.
- `fsd_StringToTable`: `rtrim()` hai phía.

---

## Tài liệu

| File | Nội dung |
|------|----------|
| [xml-structure.md]({REFDIR}/xml-structure.md) | Dir/Grid, khóa, field types |
| [check-trung.md]({REFDIR}/check-trung.md) | 3 pattern validation + template SQL |
| [database.md]({REFDIR}/database.md) | Tạo bảng, PK, MCP |

Ràng buộc nút Grid theo danh mục (realtime): skill `fbo-js-patterns` -> `js-request-deferred.md`.
