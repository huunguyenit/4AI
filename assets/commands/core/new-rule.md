---
id: new-rule
title: /new-rule
kind: command
domain: core
description: Tạo rule mới trong hub 4AI — hỏi 3 điều không suy ra được (severity, always/globs, targets), viết file đúng schema, chạy check.
argument-hint: <domain> <mô tả ngắn>
mode: agent
targets: [claude, cursor]
version: 1
---

## Việc cần làm

Tạo rule mới: **$ARGUMENTS**

1. Nạp skill `4ai-asset-authoring`.
2. Đặt `id` kebab-case có prefix domain (`fbo-`, `pm-`). Xác nhận 3 điều không tự suy
   ra được (gộp một câu hỏi, kèm đề xuất mặc định):
   - `severity`: hard (vi phạm là hỏng thật) hay soft (khuyến nghị)?
   - phạm vi: `always: true` hay `globs` — glob nào?
   - `targets`: đủ cả 4 tool hay hẹp hơn?
3. Viết `assets/rules/<domain>/<id>.md` — body đủ Vì sao / Quy tắc / Ví dụ (path thật) / Bẫy.
4. Chạy `node tools/4ai.mjs check` — phải exit 0; lỗi thì sửa tới xanh.
5. Báo cáo: id, file nguồn, output của `explain <id>`, nhắc chạy `/sync` khi muốn phát hành.
