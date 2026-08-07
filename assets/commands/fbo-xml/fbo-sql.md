---
id: fbo-sql
title: /fbo-sql
kind: command
domain: fbo-xml
description: Tra cứu SQL đằng sau màn hình FBO qua query_database — cấu trúc bảng, định nghĩa proc, dữ liệu mẫu có TOP.
argument-hint: <tên object hoặc câu hỏi về dữ liệu> [khách]
mode: agent
requires: [fastbusiness-mcp]
version: 1
---

## Việc cần làm

Tra cứu SQL: **$ARGUMENTS**

1. Xác định program (khách nào) — cần cho `query_database` phân giải kết nối.
2. Theo skill `fbo-sql-object-lookup`:
   - Tên object cụ thể → `query_type: 0` (tự nhận diện table/proc/view).
   - Câu hỏi dữ liệu → viết SELECT có `TOP 20`, chạy `query_type: 1`.
   - Không thấy object → đổi `db_type` giữa `app`/`sys` trước khi kết luận không tồn tại.
3. Trình kết quả: cấu trúc/định nghĩa + vài dòng dữ liệu mẫu nếu có, liên hệ cột với
   field màn hình khi suy ra được.

Ràng buộc: chỉ ĐỌC. Không INSERT/UPDATE/DELETE/DDL. Không bao giờ hiển thị connection
string (rule `fbo-sql-via-mcp`).
