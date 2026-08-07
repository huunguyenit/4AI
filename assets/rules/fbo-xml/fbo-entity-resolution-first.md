---
id: fbo-entity-resolution-first
title: Resolve DTD entities before editing
kind: rule
domain: fbo-xml
description: Trước khi sửa controller phải phân giải DTD entity bằng get_xml_entities; đụng vào Include phải đếm số controller dùng chung — sửa include là thay đổi toàn hệ thống.
severity: hard
globs: ["**/App_Data/Controllers/**"]
requires: [fastbusiness-mcp]
see-also: [fbo-controller-anatomy, fbo-customization-scope]
version: 1
---

## Vì sao

Controller FBO kéo mảnh dùng chung vào bằng DTD entity (`&XMLWhenVoucherInit;`,
`&CommandCheckLockedDate;`…). Nhìn file mà không phân giải entity là nhìn một nửa sự thật:
đoạn bạn định sửa có thể nằm trong file include được **hàng trăm** controller khác dùng chung.

## Quy tắc

- **BẮT BUỘC** chạy `get_xml_entities` (mode `path` để biết khai báo ở đâu, mode `content`
  khi cần nội dung) trước khi sửa bất kỳ controller nào có `<!DOCTYPE ... [`.
- Trước khi sửa bất cứ file nào dưới `Include\`: **BẮT BUỘC** đếm số controller tham chiếu
  nó (Radar, `edge_type = 'ENTITY_INCLUDE'`) và nêu con số đó trong đề xuất.
- Sửa include dùng chung **không phải customization** — nó là thay đổi toàn hệ thống của
  program. Chỉ làm khi được yêu cầu rõ ràng và người yêu cầu biết phạm vi ảnh hưởng.
- Cần hành vi riêng cho một màn hình: đưa code vào controller đó (hoặc tách include mới),
  **KHÔNG ĐƯỢC** cài điều kiện if-màn-hình vào include chung.

## Ví dụ

Đếm controller dùng một include:

    MATCH (c:XmlFile)-[r:Rel]->(i:XmlFile)
    WHERE i.relative_path CONTAINS 'WhenVoucherInit' AND r.edge_type = 'ENTITY_INCLUDE'
    RETURN count(c)

## Bẫy

- `SHARED_INCLUDE` và `ENTITY_INCLUDE` là hai loại cạnh khác nhau — đếm bằng
  `SHARED_INCLUDE` sẽ ra con số vô nghĩa (xem `fbo-radar-query-discipline`).
- Include có thể lồng include. Phân giải một tầng chưa chắc đã thấy đáy.
