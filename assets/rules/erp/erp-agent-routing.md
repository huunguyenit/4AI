---
id: erp-agent-routing
title: Route FBO work to the layer that owns it
kind: rule
domain: erp
description: Việc FBO đi đúng cửa — backend SQL giao fbo-backend, frontend XML/JS giao fbo-frontend, điều tra màn hình giao fbo-explorer, thi hành giao fbo-customizer. Không tự bơi giữa 21 skill.
severity: hard
always: true
see-also: [fbo-backend, fbo-frontend, fbo-explorer, fbo-customizer, fbo-glossary]
version: 1
---

## Vì sao

Tri thức FBO nằm ở 21 skill và hơn 50 file reference. Không có cửa vào, model phải tự đoán nên
nạp cái nào — và khi đoán trượt thì nó trả lời từ trí nhớ, nghe hợp lý mà sai. Lớp lỗi đã trả
giá thật: hỏi *"sổ kho là bảng nào"* nhận về `ct70`, trong khi bản chính thức là `r70$yyyyMM`
và `ct70` rỗng hoàn toàn.

Agent tầng tồn tại để **cầm thứ tự nạp**. Bỏ qua chúng là quay lại đúng chỗ cũ.

## Quy tắc

| Việc thật là gì | Giao cho |
|---|---|
| Proc, function, bảng, sổ, tùy chọn nghiệp vụ, viết hay soi SQL | **`fbo-backend`** |
| Controller XML, bố cục form, lưới, JavaScript, "làm thế nào để làm X" | **`fbo-frontend`** |
| Một màn hình cụ thể nằm đâu, có field gì, quan hệ với ai | `fbo-explorer` |
| Thi hành một thay đổi **đã duyệt** vào file | `fbo-customizer` |
| Soi diff XML theo bộ rule | `fbo-change-reviewer` |
| Một cụm/viết tắt/mã nghĩa là gì | `fbo-glossary` |
| Yêu cầu, UR, báo cáo dự án | xem rule `pm-ur-routing` |

- **Chạm cả hai tầng thì giao cả hai, theo thứ tự.** Ví dụ "thêm field lên form và post vào sổ":
  `fbo-frontend` thiết kế phần XML, `fbo-backend` phần SQL, rồi hợp nhất trước khi trình duyệt.
  **KHÔNG ĐƯỢC** để một agent đoán hộ phần của tầng kia.
- **Xác định program TRƯỚC, rồi truyền cho agent** — mã khách, program path, `ma_da` nếu đã
  biết. Agent không đoán hộ phạm vi (rule `erp-program-scope`).
- Kết quả agent trả về là **draft**. Không tự chốt phạm vi hay đem đi thi hành khi chưa duyệt.
- Câu hỏi vặt một câu, đã biết chính xác file và dòng cần đọc, thì đọc thẳng — đừng dựng agent
  cho việc một dòng.

## Bẫy

- **Nạp skill thay cho gọi agent.** Skill cho bạn *nội dung*; agent cho bạn *thứ tự nạp* và
  *format báo cáo có mục "Đã tra gì"*. Việc backend nhiều bước mà chỉ nạp `erp-sql-style` rồi
  viết là bỏ qua đúng ba bước tra cứu đứng trước nó.
- **Giao nhầm tầng.** "Sao lưới hiện sai định dạng số" nghe như frontend, nhưng mặt nạ có thể
  đến từ bảng `options` — `fbo-backend` cầm phần đó. Không chắc thì hỏi lại một câu, rẻ hơn một
  báo cáo sai tầng.
