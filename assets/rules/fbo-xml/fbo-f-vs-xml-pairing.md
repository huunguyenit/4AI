---
id: fbo-f-vs-xml-pairing
title: .f vs .xml pairing
kind: rule
domain: fbo-xml
description: .f là bản chuẩn, .xml cùng tên cạnh nó là bản customize được runtime ưu tiên — kiểm tra cặp bằng describe_controller (pair.customized) trước khi sửa hay tạo.
severity: hard
globs: ["**/App_Data/Controllers/**"]
requires: [4ai-fbo]
see-also: [fbo-never-invent-files, fbo-customization-scope]
version: 1
---

## Vì sao

Trong `Controllers\`, `.f` là controller chuẩn (đã compile/mã hoá), `.xml` cùng tên là
bản customize. Số liệu kiểm chứng trên corpus `FBISP24\App_Data\Controllers\Dir`:
**629 file `.f`, 17 file `.xml`, và cả 17 `.xml` đều có `.f` song sinh.** "Có `.xml`" đồng
nghĩa "màn hình này đã được chỉnh cho khách" — đây là bất biến kiểm tra được, không phải
truyền miệng.

## Quy tắc

- Trước khi sửa một màn hình: **BẮT BUỘC** xác định trạng thái cặp bằng
  `describe_controller` → `pair.customized` (có cả `.f` lẫn `.xml`) và `pair.files`.
- Màn hình chỉ có `.f`: muốn customize phải lấy được XML nguồn theo quy trình của Fast
  (giải nén/xin từ hãng) — **KHÔNG ĐƯỢC** tự dựng một `.xml` trắng rồi đắp nội dung đoán.
- Đã có `.xml`: mọi sửa đổi vào `.xml`, **không bao giờ** đụng `.f`.
- Diff trước/sau khi sửa `.xml` phải được lưu lại (ledger entry — xem `pm-ledger-discipline`).

## Ví dụ

Đếm màn hình đã customize trong một program: `index_program` trả về `customizedDir` —
số controller trong `Dir\` có cả `.f` lẫn `.xml`. Trên corpus FBISP24 con số đó là **17**,
khớp đúng số `.xml` đếm bằng tay.

Kiểm tra một màn hình cụ thể:

    describe_controller { program: "ACME", path: "Dir\\CDTran.f" }
    → pair.customized: false
      pair.note: "Chỉ có .f, chưa có XML nguồn. Muốn customize phải lấy XML nguồn
                  theo quy trình của Fast — KHÔNG tự dựng file mới."

## Bẫy

- Thấy `.xml` mà tưởng là "file nguồn ai cũng có" rồi sửa thoải mái — không: nó là
  customize của khách, sửa nó là sửa hành vi màn hình đang chạy.
- Copy `.xml` từ program khách này sang khách khác là trộn customize giữa hai hợp đồng.
