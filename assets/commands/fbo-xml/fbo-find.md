---
id: fbo-find
title: /fbo-find
kind: command
domain: fbo-xml
description: Điều tra một màn hình FBO — dispatch fbo-explorer, trả về bản đồ file, field, quan hệ và trạng thái customize.
argument-hint: <mô tả màn hình hoặc mã controller> [program path]
mode: agent
requires: [4ai-fbo]
version: 1
---

## Việc cần làm

Điều tra màn hình FBO: **$ARGUMENTS**

1. Xác định program path — có trong tham số thì dùng, không thì tra `data/customers.json`
   theo tên khách được nhắc, vẫn không rõ thì hỏi lại một câu.
2. Giao việc cho sub-agent `fbo-explorer` (read-only) với mô tả màn hình và program path.
3. Trình lại báo cáo của explorer đúng cấu trúc: Kết luận / Bản đồ file / Field liên quan /
   Include đáng chú ý / Chưa chắc chắn.

Không sửa file nào trong lệnh này. Người dùng muốn sửa tiếp thì chỉ sang `/fbo-customize`.
