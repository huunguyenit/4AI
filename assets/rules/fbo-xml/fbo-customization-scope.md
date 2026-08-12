---
id: fbo-customization-scope
title: Customization stays in one program
kind: rule
domain: fbo-xml
description: Thay đổi của một khách chỉ nằm trong program của khách đó — xác định và nói rõ program path trước lần sửa đầu tiên, không đụng sản phẩm chuẩn.
severity: hard
always: true
see-also: [fbo-f-vs-xml-pairing]
version: 1
---

## Vì sao

Mỗi khách chạy một program riêng (bản copy FBO/FBI đầy đủ). Sửa nhầm vào sản phẩm chuẩn
hoặc vào program của khách khác là lỗi lan sang hợp đồng khác — chi phí sửa sai lớn hơn
nhiều lần chi phí hỏi lại một câu.

## Quy tắc

- **BẮT BUỘC** xác định program path trước lần sửa đầu tiên và **nói rõ** nó trong đề xuất:
  "Thay đổi này áp vào `\\10.0.0.1\CustomerPro\FBO\ACME\SP229`". Chưa rõ khách
  nào / SP nào thì hỏi (xem `pm-scope-question-first`).
- **KHÔNG ĐƯỢC** sửa sản phẩm chuẩn / bản gốc SP để chiều yêu cầu của một khách.
- **KHÔNG ĐƯỢC** copy customize (`.xml`) từ program khách này sang khách khác khi chưa
  được yêu cầu — hai khách là hai hợp đồng.
- Tra cứu program path qua tool `list_programs` (bảng `nbdmda`); không có thì hỏi, không đoán.

## Ví dụ

Yêu cầu "thêm field ghi chú vào phiếu chi cho ACME" → xác nhận program
`\\10.0.0.1\CustomerPro\FBO\ACME\SP229`, kiểm tra `Dir\CDTran.xml` đã tồn tại
cạnh `.f` chưa, rồi mới bàn cách sửa.

## Bẫy

- Đang mở sẵn corpus test (`FBISP24`) rồi sửa luôn ở đó "cho tiện" — corpus không phải
  program của khách; thay đổi ở đó không tới tay ai và tạo ảo giác đã xong việc.
