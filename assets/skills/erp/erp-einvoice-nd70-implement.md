---
id: erp-einvoice-nd70-implement
title: ND70 — Trade discount on e-invoice
kind: skill
domain: erp
description: NĐ70 phần chiết khấu kỳ trên HĐĐT — so_bk, ngay_bk, tính chất dòng 3, VoucherType 9, Proxy ListNumber/ListDate. Patch thẳng Dir/{Tran} + dmhddtbs + Customize. Không dùng cho phần CCCD.
requires: [4ai-fbo]
see-also: [erp-einvoice-customize]
version: 1
---
> **NĐ70 có 2 phần:** skill này = **chiết khấu kỳ**. CCCD / hộ chiếu / tab Định danh →
> `fbo-einvoice-nd70-identity`.

> ⚠ `fbo-einvoice-nd70-identity` **chưa có trong hub** — nó mang theo 25 file nguồn FBO
> (`.ent`/`.txt`/`.xml`/`.sql`) mà cơ chế reference của hub chưa chở được. Bản dùng được
> hiện nằm ngoài hub; hỏi người phụ trách thay vì tự dựng lại.


Skill vá **hóa đơn chiết khấu thương mại** (hóa đơn không lấy dữ liệu hóa đơn gốc): form bảng kê + payload phát hành / điều chỉnh / thay thế. Động cơ A/B/C lấy từ `erp-einvoice-customize`.

**Không dùng** khi: UR chỉ CCCD/hộ chiếu; HDDV đầu vào; cài proxy / “sao PH lỗi”.

---

## Quy tắc nghiệp vụ (user)

1. Trên hóa đơn giảm giá hàng hóa - dịch vụ thêm trường:
- Số bảng kê (`so_bk`): loại text, người dùng tự nhập
- Ngày bảng kê (`ngay_bk`): loại date, người dùng tự nhập
- Bắt buộc nhập nếu là hóa đơn chiết khấu thương mại (hóa đơn không lấy dữ liệu hóa đơn gốc)

2. Xử lý khi phát hành, điều chỉnh, thay thế:
- Chi tiết được truyền lên tính chất = 3 - Chiết khấu (đã chốt với KH), giá trị dương khi nhập số dương
- Truyền thêm biến "Số bảng kê", "Ngày bảng kê"

3. Proxy thêm thẻ `ListNumber`, `ListDate`, thẻ `VoucherType` = 9

---

## Cách triển khai (khác identity)

**Patch trực tiếp** vào chứng từ giảm giá + SQL + Structure — giống ND252, **không** nhét vào `Include/ND70`.

> [!CAUTION]
> **Cấm** tạo `Include/ND70Discount/`, không `%ND70Discount`, không `&ND70DiscountFields;`, không nhét `so_bk` / `ngay_bk` vào `EIFields.txt` dùng chung.
> `Include/ND70` là **identity** — đừng trộn chiết khấu vào đó.

| Identity (`fbo-einvoice-nd70-identity`) | Discount (skill này) |
|-----------------------------------------|----------------------|
| `Include/ND70/` + INCLUDE/IGNORE | Field/view/JS chèn thẳng `Dir/{Tran}.xml` |
| Mọi CT HDDT có `&EIFields;` | Chỉ CT giảm giá / CKTM (thường HD4) |
| Proxy `IDCardNo` / `PassportNo` | Proxy `ListNumber` / `ListDate` / `VoucherType` |

---

## Chọn lớp + pattern

CKTM luôn **hai lớp** (master bảng kê + detail tính chất). Pattern A/B/C theo `erp-einvoice-customize`:

| Việc | Lớp | Pattern |
|------|-----|---------|
| NSD nhập `so_bk`, `ngay_bk`; bắt buộc khi không lấy HĐ gốc | Master form | **C** trên `Dir/{Tran}.xml` — không `EIFields` |
| Gửi số/ngày bảng kê khi PH / ĐC / TT | Master payload | **A** nếu tag đã có; **B** nếu Structure chưa có `ListNumber` / `ListDate` |
| `VoucherType` = 9 khi CKTM | Master payload | **A** nếu `<VoucherType>` đã map (thường `tinh_chat`); Customize gán `9` |
| Dòng hàng tính chất = 3; số dương khi nhập dương | Detail payload | **A** nếu tag tính chất dòng đã có; **B** nếu Structure `<detail>` chưa có thẻ Nature / tương đương |

Tag **đã có** → không thêm trùng trên Proxy. Đọc Structure hiện có trước khi vá.

Nhận diện CKTM trên form/grid: **không lấy hóa đơn gốc** — mọi dòng detail khóa HĐ gốc trống (`stt_rec_hd` / `hd_so`). Không bịa cờ khác nếu controller chưa có.

Chi tiết payload: [reference-payload.md]({REFDIR}/reference-payload.md). Ví dụ HD4: [examples-ur.md]({REFDIR}/examples-ur.md).

---

## Workflow

```
- [ ] 1. Xác định CT giảm giá (hddtfields / dmct9 / wcommand) — thường HD4 / SPTran
- [ ] 2. describe_controller: phải có .xml cạnh .f. Chỉ .f → dừng, xin XML nguồn
- [ ] 3. MCP: cột so_bk/ngay_bk trên m** + work table; dmhddtbs; body Customize; Structure folder đang dùng
- [ ] 4. Form C: field + view + Checking bắt buộc khi không có HĐ gốc; EIEditCheckTable{Tran}
- [ ] 5. ALTER cột (mọi partition m**$ + wrk*) — script giao NSD
- [ ] 6. dmhddtbs merge so_bk, ngay_bk (master). Customize: VoucherType 9 + detail tính chất 3 + số dương
- [ ] 7. Proxy Invoices + Adjust + Replace: ListNumber, ListDate, VoucherType — chỉ thêm nếu thiếu
- [ ] 8. Giao file .sql — không EXEC
```

---

## Quy tắc

1. Field / biến local: `so_bk`, `ngay_bk` — **snake_case**, khớp cột.
2. Form chỉ trên CT giảm giá (`Dir/{Tran}.xml`). Không vá `EIFields` / `EIGridFields`.
3. `dmhddtbs`: prepend / merge. Cấm `DELETE` rồi `INSERT` nếu dự án đã customize.
4. Customize: đọc body hiện có → chèn khối CKTM → `ALTER PROC` một body. Cấm wrapper `_Base`.
5. Số dương: khi NSD nhập dương, payload detail không đổi dấu thành âm.
6. SQL: giao script; **không** deploy cho đến khi NSD yêu cầu.
7. Sửa XML bằng StrReplace; giữ encoding/BOM/CRLF gốc.

---

## Checklist

- [ ] Đúng skill chiết khấu — không đụng `Include/ND70` identity
- [ ] Có XML nguồn `Dir/{Tran}.xml` (không tự dựng từ `.f`)
- [ ] `so_bk` / `ngay_bk` trên form; bắt buộc khi không lấy HĐ gốc
- [ ] Cột DB đủ partition + work table
- [ ] `dmhddtbs` master có `so_bk`, `ngay_bk`
- [ ] Customize: `#master` VoucherType 9 khi CKTM; `#detail` tính chất 3; số dương
- [ ] Proxy PH/ĐC/TT: `ListNumber`, `ListDate`, `VoucherType` — không nhân đôi tag đã có
- [ ] File SQL giao NSD — chưa EXEC
