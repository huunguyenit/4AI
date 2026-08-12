---
id: pm-no-secrets-in-notes
title: No secrets in notes
kind: rule
domain: project-mgmt
description: Ledger, ADR, changelog, handover không bao giờ chứa connection string, credential hay dữ liệu cá nhân khách — tham chiếu bằng program path và mã dự án (nbdmda.ma_da).
severity: hard
always: true
version: 1
---

## Vì sao

Ghi chú được commit, chia sẻ, backup — mỗi bản sao là một chỗ rò. `check` của hub grep
shape connection string trong `assets/**`, `ledger/**`, `data/**` và fail khi thấy; rule
này là mặt con-người của cùng cơ chế đó.

## Quy tắc

- **KHÔNG ĐƯỢC** ghi vào bất kỳ ghi chú nào: connection string, user/password, serial
  number, network key, API key, hay dữ liệu cá nhân của người dùng cuối.
- Cần tham chiếu database: dùng **mã dự án** (`nbdmda.ma_da`, ví dụ `ACME` — tra qua
  `list_programs`), không dùng chuỗi kết nối.
- Cần tham chiếu program: dùng program path — path không phải secret, credential mới là.
- Lỡ ghi rồi: xoá ngay và coi credential đó là đã lộ — báo người quản lý để đổi.

## Ví dụ

Sai: `DB: Data Source=...;Uid=...;Pwd=...` → Đúng: `DB: ACME (list_programs)`. <!-- 4ai:allow-secret-pattern: ví dụ minh hoạ pattern bị cấm -->

## Bẫy

- Paste nguyên văn output lỗi của tool — stack trace và message lỗi kết nối thường chứa
  sẵn chuỗi kết nối. Cắt trước khi dán.
