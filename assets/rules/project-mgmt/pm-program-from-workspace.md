---
id: pm-program-from-workspace
title: Resolve program from workspace path
kind: rule
domain: project-mgmt
severity: hard
always: true
description: Thư mục làm việc đang đứng đã cho biết khách nào — tra nó qua tool list_programs (bảng nbdmda) trước, chỉ hỏi khi không khớp. Không suy mã dự án từ tên thư mục.
see-also: [pm-customer-program-registry, pm-scope-question-first]
version: 2
---

## Vì sao

Mở thẳng thư mục chương trình khách rồi hỏi "khách nào?" là hỏi thừa — câu trả lời nằm
ngay trong đường dẫn workspace. Nhưng đoán mã dự án bằng cách cắt tên thư mục thì sai ở
đúng những khách có tên thư mục lệch chuẩn, và sửa nhầm program là hỏng phần mềm đang chạy
của người khác.

## Quy tắc

- **BẮT BUỘC** trước khi hỏi phạm vi: lấy thư mục làm việc hiện tại, gọi
  `list_programs { query: "<một đoạn đường dẫn workspace, ví dụ tên khách + SP>" }` — tool
  khớp `query` vào cả `nbdmda.dir_pro_web` và `dir_pro_app`. Đúng một kết quả và `programPath`
  của nó là tiền tố (hoặc trùng khít, chuẩn hoá `/` với `\`, không phân biệt hoa thường) của
  workspace thì coi như đã biết `ma_da`, SP và dòng sản phẩm — đi thẳng vào việc.
- **KHÔNG ĐƯỢC** suy `ma_da` từ tên thư mục. Tên thư mục và `ma_da` lệch nhau ở nhiều dự án
  đang có thật (xem Bẫy) — chỉ kết quả `list_programs` mới là căn cước.
- `query` ra nhiều dòng (một khách nhiều program: Web + app, hai chi nhánh, dự án cũ còn
  chung tên) → liệt kê `ma_da` cho người dùng chọn, không tự chọn hộ.
- Không khớp dòng nào → **KHÔNG ĐƯỢC** tự đoán `ma_da`, cũng không tự thêm gì vào `nbdmda`
  (đó là DB QLDA nội bộ dùng chung, không thuộc quyền ghi của hub này). Báo rõ "workspace
  này không khớp dự án nào trong nbdmda" rồi hỏi theo `pm-scope-question-first`, kèm sẵn
  đường dẫn để người dùng xác nhận.
- Khớp rồi thì nói ra một dòng ngắn trước khi làm: `ma_da` · dòng sản phẩm · SP ·
  program path. Người dùng phát hiện sai ngay ở dòng đó, không phải sau khi đã sửa file.

## Ví dụ

Workspace `\\<share>\CustomerPro\FBI\<MA_DA>\FBISP2422` → `list_programs { query:
"<MA_DA>\\FBISP2422" }` trả đúng một dòng `ma_da=<MA_DA>`, `programPath` trùng khít → đúng
khách đó, FBI, SP FBISP2422. Không hỏi gì thêm, `index_program` rồi làm.

Workspace `\\<share>\CustomerPro\FBO\<TenThuMuc>-SP225\SP225\App_Data\Controllers` →
`query: "<TenThuMuc>-SP225"` trả về một `ma_da` **khác** tên thư mục, `programPath` là tiền
tố của workspace → vẫn khớp, dùng `ma_da` mà tool trả về chứ không phải tên thư mục.

## Bẫy

- Cắt tên thư mục ra mã dự án sai ở nhiều dự án đang có thật: mã trực giác suy từ tên thư
  mục (bỏ hậu tố SP, cắt ngắn tên công ty) thường KHÔNG tồn tại trong `nbdmda`; và có
  trường hợp mã trực giác lại trúng một dự án **cũ, khác hẳn** — bản mới của cùng khách
  mang mã có hậu tố (dạng `<MA>_FBO`). Luôn tra `list_programs`, không suy theo cảm tính.
- Một khách có thể có NHIỀU dòng `nbdmda` (nhiều sản phẩm/chi nhánh/dự án cũ còn treo) —
  `query` theo tên công ty có thể ra nhiều `ma_da` không liên quan tới workspace đang đứng.
  Luôn đối chiếu `programPath` trả về với workspace thật, đừng chọn dòng đầu tiên.
- Thư mục cuối thường là SP (`FBISP2422`, `SP229`) chứ không phải mã dự án — mã nằm ở cấp
  trên. Nhưng đừng dựa vào quy luật đó, dựa vào `programPath` trả về từ `list_programs`.
- Đứng ở hub 4AI (`D:\Fast Source\4AI`) thì không có khách nào cả — đừng khớp bừa vào
  corpus thử nghiệm cục bộ (`FBISP24`), đó không phải khách và không có dòng `nbdmda` tương ứng.
