---
id: fbo-entity-resolution-first
title: Resolve DTD entities before editing
kind: rule
domain: fbo-xml
description: Trước khi sửa controller phải phân giải DTD entity bằng resolve_entities; đụng vào Include phải đếm số controller dùng chung — sửa include là thay đổi toàn hệ thống.
severity: hard
globs: ["**/App_Data/Controllers/**"]
requires: [4ai-fbo]
see-also: [fbo-controller-anatomy, fbo-customization-scope]
version: 1
---

## Vì sao

Controller FBO kéo mảnh dùng chung vào bằng DTD entity (`&XMLWhenVoucherInit;`,
`&CommandCheckLockedDate;`…). Nhìn file mà không phân giải entity là nhìn một nửa sự thật:
đoạn bạn định sửa có thể nằm trong file include được **hàng trăm** controller khác dùng chung.

## Quy tắc

- **BẮT BUỘC** chạy `resolve_entities` (thêm `includeContent: true` khi cần nội dung)
  trước khi sửa bất kỳ controller nào có `<!DOCTYPE ... [`.
- Trước khi sửa bất cứ file nào dưới `Include\`: **BẮT BUỘC** chạy `list_related` với
  `kind: "used_by"` và nêu `usedBy.total` trong đề xuất.
- `resolve_entities` trả `exists: false` nghĩa là DOCTYPE khai một include **không có thật**
  trong program. Báo lại đúng như thế — không tạo file để "cho đủ".
- Sửa include dùng chung **không phải customization** — nó là thay đổi toàn hệ thống của
  program. Chỉ làm khi được yêu cầu rõ ràng và người yêu cầu biết phạm vi ảnh hưởng.
- Cần hành vi riêng cho một màn hình: đưa code vào controller đó (hoặc tách include mới),
  **KHÔNG ĐƯỢC** cài điều kiện if-màn-hình vào include chung.

## Ví dụ

    list_related { program: "_CORPUS", path: "Include\\XML\\WhenVoucherInit.xml",
                   kind: "used_by" }
    → usedBy.total: 12
      warning: "File này nằm trong Include\ và đang được 12 controller dùng chung.
                Sửa nó là thay đổi toàn hệ thống của program, KHÔNG phải customize
                một màn hình."

## Bẫy

- Include có thể lồng include. Phân giải một tầng chưa chắc đã thấy đáy — theo `resolved`
  của tầng dưới rồi gọi `resolve_entities` tiếp.
- Entity tham số (`<!ENTITY % X SYSTEM …>` rồi `%X;`) hoạt động khác entity thường: nó
  chèn **khai báo**, không chèn nội dung vào body. `resolve_entities` đánh dấu bằng
  `parameter: true` — đừng nhầm nó với include nội dung.
- `usedInBody: false` nghĩa là entity được khai nhưng không dùng trong file này. Vô hại,
  nhưng đừng dựa vào nó để kết luận file include kia không quan trọng.
