---
id: fbo-einvoice-customize
title: FBO — Customize e-invoice output
kind: skill
domain: erp
description: Customize HĐĐT đầu ra — form EIFields, Grid dòng hàng, dmhddtbs (struct_*/detail_*), FastBusiness$EInvoice$Customize, Proxy Structure. Chỉ sửa XML và SQL. Mở khi UR về EInvoice, HD1/HDA.
requires: [4ai-fbo]
see-also: [fbo-einvoice-nd70-discount, fbo-nd252-ty-gia-hq, fbo-glossary-reference]
version: 1
---
Skill vá **payload / form / mẫu XML** hóa đơn điện tử đầu ra — **cả master và dòng hàng (detail)**. Không cài kết nối, không chẩn đoán portal/khóa/`urlEInvoice`.

**Không dùng** khi: HDDV / ImportXml (`fbo-create-hddv`); cài proxy; UR chỉ hỏi “sao PH lỗi”.

**Spec NĐ70** (đọc skill đó trước, skill này là động cơ A/B/C): identity / CCCD →
`fbo-einvoice-nd70-identity`; chiết khấu kỳ → `fbo-einvoice-nd70-discount`.

> ⚠ `fbo-einvoice-nd70-identity` **chưa có trong hub** — nó mang theo 25 file nguồn FBO
> (`.ent`/`.txt`/`.xml`/`.sql`) mà cơ chế reference của hub chưa chở được. Bản dùng được
> hiện nằm ngoài hub; hỏi người phụ trách thay vì tự dựng lại.


---

## Bước 0 — Neo vào khách, trước mọi thứ khác

Chưa biết **program của khách nào** thì chưa bắt đầu. Tra bằng `list_programs` (thư mục
workspace đang đứng cũng tra được), nhắc lại program path để xác nhận, rồi mở entry trong
`ledger/tasks.md` trạng thái `Mới`.

Hai rule luôn-nạp cầm chỗ này, file này không thay thế chúng: `erp-program-scope`
(thay đổi chỉ nằm trong program của đúng khách đó) và `pm-ledger-discipline` (không có entry
thì việc chưa xong, kể cả khi code đã chạy). Quy trình đầy đủ ở `fbo-customization-workflow`.

---

## Chỗ vá (chỉ XML / SQL)

| Chỗ | Master | Detail (dòng hàng) | Loại |
|-----|--------|-------------------|------|
| Form | `EIFields.txt`, `EIViews.xml`, `Dir/{Tran}.xml` | `Grid/{Detail}.xml` (controller grid trên Dir) | XML |
| Cột gửi PH | `dmhddtbs.struct_*` / `query_*` / `result_fields` | `dmhddtbs.detail_struct_*` / `detail_query_*` / `detail_result_fields` | SQL |
| Đổi giá trị trước gửi | Customize `update #master` | Customize `update #detail` | SQL |
| Tag XML NCC | Structure `<master>` | Structure `<detail>` (cùng Invoices/Adjust/Replace) | XML |

`EIGridFields` = cột HDDT trên **danh sách chứng từ** (`Grid/{Tran}.xml`) — không phải dòng hàng.

Chi tiết: [reference-customize.md]({REFDIR}/reference-customize.md)

---

## Chọn pattern

Trước hết xác định **lớp**: master (header HĐ) hay detail (dòng hàng) — cùng pattern A/B/C.

| Pattern | Điều kiện | Master | Detail |
|---------|-----------|--------|--------|
| **A — Remap** | Tag XML **đã có**; đổi nguồn giá trị | `dmhddtbs` + Customize `#master` | `dmhddtbs.detail_*` + Customize `#detail` |
| **B — Tag mới** | Mẫu in / NCC cần **thẻ mới** | Cột + `dmhddtbs` + Structure `<master>` | Cột + `dmhddtbs.detail_*` + Structure `<detail>` |
| **C — Form** | NSD nhập / nhìn trên CT | `EIFields` / `EIViews` / `EIEditCheckTable*` | `Grid/{Detail}.xml` |

Tag đã có → **A, không đổi tag Proxy**. Tag mới → B. Cần nhập liệu → thêm C. UR có cả header và dòng → vá **đủ hai lớp**.

---

## Workflow

```
- [ ] 1. UR → lớp master / detail → A / B / C (có thể kết hợp)
- [ ] 2. MCP: dmhddtbs theo ma_ct; body EInvoice$Customize; Dir/{Tran}; Structure Proxy
- [ ] 3. Vá XML (StrReplace) / SQL (script giao NSD)
- [ ] 4. Proc: ALTER một body — không wrapper _Base
- [ ] 5. Giao file .sql — không EXEC
```

---

## Quy tắc

1. `dmhddtbs`: **prepend / merge** dòng `ma_ct` đang có. Cấm `DELETE` rồi `INSERT` nếu dự án đã customize.
2. Customize: đọc body hiện có → chèn khối → `ALTER PROC` đầy đủ. Cấm `Customize_Base` + proc bọc.
3. Unicode: giữ comment + `N'...'` tiếng Việt toàn body.
4. Field / biến local: **snake_case**, khớp tên cột.
5. Sửa XML bằng StrReplace. View form: `fbo-design-view-field`.
6. SQL: giao script; **không** deploy cho đến khi NSD yêu cầu.

---

## Checklist

- [ ] Đúng lớp master / detail + pattern A/B/C — không sửa Proxy khi A đủ
- [ ] `dmhddtbs` merge đúng cột `struct_*` hoặc `detail_*`
- [ ] Customize: `#master` và/hoặc `#detail`; một body; Unicode đủ
- [ ] Pattern B: Invoices + Adjust + Replace; đúng `<master>` / `<detail>`
- [ ] Pattern C master: `&EIFields;`. Pattern C detail: `Grid/{Detail}.xml` — không nhầm `EIGridFields`
- [ ] File SQL giao NSD — chưa EXEC

Ví dụ UR: [examples-ur.md]({REFDIR}/examples-ur.md)
