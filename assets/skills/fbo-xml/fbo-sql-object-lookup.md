---
id: fbo-sql-object-lookup
title: SQL object lookup
kind: skill
domain: fbo-xml
description: Tìm và đọc table/proc/view đứng sau một màn hình FBO qua query_database — query_type 0 cho object, 1 cho SQL shaped, liên hệ field màn hình với cột database.
requires: [fastbusiness-mcp]
see-also: [fbo-radar-navigation]
version: 1
---

## Vì sao

Field trên màn hình cuối cùng đều đổ về cột trong SQL Server. Trả lời "dữ liệu này lấy
từ đâu" cần đi được đường: field màn hình → controller → query/command → object database.

## Quy trình

1. **Từ màn hình xuống:** `query_node_details` cho controller → xem `sql_text` (Radar)
   hoặc phần `Query`/`Command` trong XML → tên table/proc xuất hiện ở đó.
2. **Soi object:** `query_database` `query_type: 0`, `query: "<tên object>"` —
   server tự nhận diện table (trả cấu trúc cột) / proc / view (trả định nghĩa).
3. **Chạy thử SQL shaped:** `query_type: 1` với câu SELECT có `TOP` — xem dữ liệu thật
   để đối chiếu field ↔ cột.
4. **`db_type`:** nghiệp vụ (chứng từ, danh mục) bên `app`; cấu hình hệ thống, phân quyền
   bên `sys`. Không thấy object thì đổi bên trước khi kết luận không tồn tại.

## Quy ước đặt tên hay gặp

- Bảng chứng từ thường trùng mã controller: màn hình `CPTran` ↔ bảng `CPTran`.
- Cột tiếng Việt không dấu, trùng tên field màn hình: `dien_giai`, `ten_vt`, `gia2`,
  `gia_nt2` (`_nt` = nguyên tệ).

## Bẫy

- Câu SELECT không `TOP`/`WHERE` trên bảng chứng từ của khách có thể trả hàng triệu dòng.
  Luôn `SELECT TOP 20` khi thăm dò.
- Đây là database **thật**: tuyệt đối không thử INSERT/UPDATE "xem sao"
  (rule `fbo-sql-via-mcp`).
