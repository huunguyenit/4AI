---
id: fbo-review
title: /fbo-review
kind: command
domain: fbo-xml
description: Soi diff XML hiện tại theo bộ rule FBO — dispatch fbo-change-reviewer, phân loại Blocker / Nên sửa / Góp ý.
argument-hint: "[file hoặc diff cần soi — bỏ trống để soi thay đổi đang mở]"
mode: ask
requires: [fastbusiness-mcp]
version: 1
---

## Việc cần làm

Review thay đổi: **$ARGUMENTS**

1. Thu thập diff — tham số chỉ file/diff nào thì dùng cái đó; bỏ trống thì lấy các file
   `.xml` đang thay đổi trong working tree (hoặc cặp `.bak`/hiện tại nếu không có git).
2. Giao `fbo-change-reviewer` (read-only) soi theo checklist 6 điểm của nó.
3. Trình báo cáo: Kết luận / Blocker / Nên sửa / Góp ý — mỗi phát hiện kèm dòng diff và
   tên rule bị chạm.

Không tự sửa gì trong lệnh này, kể cả Blocker — sửa là quyết định của người làm.
