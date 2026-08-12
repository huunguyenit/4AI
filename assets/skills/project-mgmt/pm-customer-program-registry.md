---
id: pm-customer-program-registry
title: Customer program registry
kind: skill
domain: project-mgmt
description: Tra "khách X nằm ở đâu" ra program path, dòng sản phẩm FBO/FBI, SP version qua tool list_programs — nguồn là bảng nbdmda trong DB QLDA nội bộ, không phải file cục bộ.
version: 2
---

## Vì sao

Program path là căn cước của mọi thay đổi (rule `fbo-customization-scope`). Nguồn sự thật
là bảng `nbdmda` trong DB QLDA nội bộ (`QLDA_APP`) — hệ thống quản lý dự án dùng chung của cả
công ty, không phải file riêng của hub 4AI. Tool `list_programs` tra bảng đó trực tiếp nên
luôn thấy dữ liệu mới nhất; **không có gì để hub này bảo trì hay đồng bộ tay**.

## Cách tra

- `list_programs { query: "<tên khách hoặc mã hoặc đoạn đường dẫn>" }` — khớp vào
  `ma_da`, `ten_da`, `ten_ngan`, và cả `dir_pro_web`/`dir_pro_app` (dùng khi biết workspace
  path nhưng chưa biết mã — xem `pm-program-from-workspace`).
- Bỏ trống `query` → liệt kê dự án đang hoạt động đứng tên bạn trong `nbdmda.ma_lt1/2/3`
  (theo `data/qlda.json` → `review.pm.maNv`) — tiện xem nhanh danh sách quen thuộc, không
  phải danh sách đầy đủ mọi khách trong công ty.
- Kết quả trả `maDa`, `name`/`shortName`, `sp` (= `ma_pbsp`), `programPath` (ưu tiên
  `dir_pro_web`, rớt về `dir_pro_app` cho dòng FF cũ), `reachable`, `indexed`.
- `ma_da` là **mã dự án**, không phải "mã khách thân thiện" — không suy đoán, không rút
  gọn tên khách thành mã. Một khách có thể có nhiều `ma_da` (nhiều sản phẩm/chi nhánh);
  đừng giả định dòng đầu tiên khớp `query` là dòng đúng, đối chiếu `programPath` với
  workspace hoặc SP đang cần.
- `name`/`shortName` có thể mất dấu tiếng Việt do codepage `sqlcmd` — đừng copy nguyên văn
  vào UR, ledger hay tài liệu bàn giao; lấy văn bản chính xác từ tài liệu nguồn khi cần trích dẫn.

## Không có gì để "thêm khách mới"

`nbdmda` do bộ phận triển khai/QLDA ghi khi nhận dự án, không phải qua hub 4AI. Gặp
workspace không khớp dòng `nbdmda` nào: **KHÔNG ĐƯỢC** tự suy đoán hay tạo giả một dòng để
tiếp tục — báo rõ không tìm thấy, hỏi người dùng theo `pm-scope-question-first`. Không có
đường ghi vào `nbdmda` từ hub này (chỉ đọc — xem `fbo-sql-via-mcp`).

## Bẫy

- Mã dự án thật lệch khỏi tên khách rút gọn theo cảm tính rất phổ biến: khách "Acme Two"
  có `ma_da=ACME2` chứ không phải `MESSER`; khách "Acme Three" bản FBI thật có
  `ma_da=ACME3_FBO` — dòng `ma_da=ACME3` là một dự án FF **cũ, khác hẳn**. Luôn tra
  bằng `list_programs`, không đoán mã.
- `query` theo tên công ty ra nhiều dòng không liên quan (nhiều sản phẩm, nhiều chi nhánh,
  dự án cũ còn treo `status='1'`) — đọc `sp`/`programPath` để chọn đúng dòng, đừng chọn
  dòng đầu.
- Bỏ trống `query` chỉ trả dự án đứng tên bạn (`ma_lt1/2/3`) — khách bạn từng hỗ trợ nhưng
  không đứng tên lập trình sẽ KHÔNG xuất hiện trong danh sách mặc định; truyền `query` để
  tìm khách đó.
