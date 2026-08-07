---
id: fbo-customization-workflow
title: Customization workflow end-to-end
kind: skill
domain: fbo-xml
description: Quy trình customize một màn hình FBO từ đầu tới cuối — xác định program, xác nhận controller, kiểm tra cặp .f/.xml, phân giải entity, sửa tối thiểu, verify, ghi ledger.
requires: [4ai-fbo]
see-also: [fbo-controller-anatomy, fbo-f-vs-xml-pairing, fbo-entity-resolution-first]
version: 1
---

## Vì sao

Các rule FBO (`fbo-customization-scope`, `fbo-f-vs-xml-pairing`, `fbo-entity-resolution-first`,
`fbo-encoding-and-newlines`, `pm-ledger-discipline`) là ràng buộc rời; file này xâu chúng
thành một quy trình duy nhất để không bước nào bị nhảy cóc.

## Quy trình

1. **Xác định program.** Khách nào → `data/customers.json` → program path. Thiếu thì hỏi
   (rule `pm-scope-question-first`). Nói rõ path trong đề xuất.
2. **Mở ledger entry** — `ledger/tasks.md`, trạng thái `Mới`.
3. **Xác nhận controller.** `find_controller` không dấu → mã controller → `describe_controller`
   đối chiếu tên nghiệp vụ với mô tả. Người yêu cầu nói "phiếu chi" mà search ra ba ứng
   viên thì xác nhận lại, không chọn hộ.
4. **Kiểm tra cặp `.f`/`.xml`.** Đã có `.xml` → sửa nó. Chỉ có `.f` → dừng, báo cần lấy
   XML nguồn theo quy trình của Fast — không tự dựng (rule `fbo-never-invent-files`).
5. **Dựng bản đồ ảnh hưởng.** `list_related` (companion · lookup · include) và
   `resolve_entities`. Sửa đổi có chạm file dưới `Include\` thì chạy `list_related` với
   `kind: "used_by"`, nêu `usedBy.total`, và dừng lại xin duyệt riêng.
6. **Sửa tối thiểu.** Đúng encoding/newline gốc (rule `fbo-encoding-and-newlines`).
   Diff chỉ chứa dòng chủ đích.
7. **Verify.** Đối chiếu diff với yêu cầu; kiểm tra XML well-formed (entity đã khai đủ
   trong DOCTYPE); nếu thêm field mới thì soi cột database tương ứng
   (`fbo-sql-object-lookup`).
8. **Chốt ledger.** Trạng thái `Chờ xác nhận`, ghi controller đã đụng; khách xác nhận
   xong → `Xong` + dòng `CHANGELOG.md`.

## Bẫy

- Nhảy từ bước 1 tới bước 6 khi yêu cầu "có vẻ rõ" — bước 4 và 5 chính là nơi phát hiện
  "màn hình này chưa có XML nguồn" và "đoạn này nằm trong include 200 màn hình dùng chung",
  hai phát hiện đảo ngược toàn bộ kế hoạch.
