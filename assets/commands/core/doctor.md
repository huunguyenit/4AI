---
id: doctor
title: /doctor
kind: command
domain: core
description: Chạy 4AI check và giải thích từng lỗi theo hướng phải sửa gì ở đâu, không chỉ lặp lại message.
mode: ask
targets: [claude, cursor]
version: 1
---

## Việc cần làm

Khám sức khoẻ hub.

1. `node tools/4ai.mjs check` và `node tools/4ai.mjs targets`.
2. Với **mỗi** ERROR/WARN: nói rõ (a) nghĩa là gì, (b) sửa ở file nào dòng nào,
   (c) sửa xong thì chạy gì để xác nhận. Lỗi frontmatter thì mở file xem ngữ cảnh
   thật thay vì đoán từ message.
3. Kiểm tra MCP server của hub: `node mcp/fbo/selftest.mjs` — nó bắt tay JSON-RPC thật
   với `mcp/fbo/server.mjs` và đối chiếu danh sách tool với `mcp/servers.json`. Lệch
   nhau nghĩa là registry và server đã trôi — sửa registry, rồi `sync` lại.
4. Hub xanh hoàn toàn: báo tóm tắt số asset theo kind/domain và lần sync cuối của
   từng target — không bịa việc để có việc.
