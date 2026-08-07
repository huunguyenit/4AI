---
id: pm-new-adr
title: /pm-new-adr
kind: command
domain: project-mgmt
description: Ghi lại một quyết định thành ADR theo template chuẩn — hỏi đủ Bối cảnh/Quyết định/Hệ quả rồi tạo file trong ledger/adr/.
argument-hint: <quyết định cần ghi lại>
mode: agent
version: 1
---

## Việc cần làm

Ghi ADR cho quyết định: **$ARGUMENTS**

1. Nạp skill `pm-adr`. Kiểm tra nhanh: quyết định này có đáng ADR không (khó đảo ngược /
   ảnh hưởng nhiều task / sẽ bị hỏi lại)? Không đáng thì nói thẳng và đề nghị chỉ ghi một
   dòng vào ledger entry liên quan.
2. Xác định số thứ tự tiếp theo trong `ledger/adr/` (4 chữ số, tăng dần, không tái sử dụng).
3. Điền template: Bối cảnh (vấn đề gì buộc quyết định) / Quyết định ("Chúng tôi sẽ …") /
   Hệ quả (được, mất, ràng buộc phát sinh). Thiếu thông tin mục nào thì hỏi gọn một lần.
4. Ghi file `ledger/adr/ADR-<số>-<slug>.md`, trạng thái `Chấp nhận` (hoặc `Đề xuất` nếu
   người dùng nói đang cân nhắc), và nhắc link ADR vào ledger entry liên quan nếu có.

Không secret trong ADR (rule `pm-no-secrets-in-notes`).
