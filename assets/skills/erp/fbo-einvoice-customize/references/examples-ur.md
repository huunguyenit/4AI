# Ví dụ UR — không dùng làm định nghĩa pattern

## ND252 — Tỷ giá hq (pattern A + C, **master**)

- Form: field `ty_gia_hq` trên `Dir/ARTran.xml`, `Dir/SVTran.xml` (luôn hiện, dưới `ty_gia`).
- `dmhddtbs` HD1/HDA: `struct_fields = ty_gia_hq`, `struct_from = m21$ / m81$`, `script` gọi Customize.
- Customize: `update #master set ty_gia = ty_gia_hq ...` — **giữ** Proxy `<ExchangeRate>ty_gia</ExchangeRate>`.
- Skill chi tiết: `fbo-nd252`.

## ND70 — CCCD / hộ chiếu (pattern B + C, **master**)

- Form: tab Định danh qua `Include/ND70` + `&ND70Fields;` cuối `EIFields.txt`.
- `dmhddtbs`: prepend `so_cmnd`, `so_hc`, `ma_dv_mua` join `dmkh`.
- Proxy 008: `<IDCardNo>so_cmnd</IDCardNo>`, `<PassportNo>so_hc</PassportNo>` trên Invoices / Adjust / Replace (`<master>`).
- `EIEditCheckTable{Tran}`: `&ND70EditFields;` trước `into #editmaster`.
- Skill chi tiết: `fbo-einvoice-nd70-identity`.

## ND70 — Chiết khấu kỳ (pattern A/B + C, **master + detail**)

- Form: `so_bk`, `ngay_bk` trên `Dir/{Tran}.xml` của CT giảm giá (thường HD4 / SPTran) — **không** `EIFields`.
- Bắt buộc khi không lấy HĐ gốc (`stt_rec_hd` trống).
- Customize: `#master` VoucherType 9; `#detail` tính chất 3; số dương khi nhập dương.
- Proxy: `ListNumber` ← `so_bk`, `ListDate` ← `ngay_bk`, `VoucherType` ← `tinh_chat` (= 9 khi CKTM).
- Skill chi tiết: `fbo-einvoice-nd70-discount`.

## Dòng hàng — cùng A/B/C trên **detail**

UR thêm cột dòng (vd ghi chú dòng, mã phụ) → không copy ND70/ND252:

- Form: `Grid/ARDetail.xml` / `Grid/SVDetail.xml` (không `EIGridFields`).
- `dmhddtbs`: `detail_struct_fields` / `detail_query_fields` / `detail_result_fields` (+ `detail_struct_from` nếu join `dmvt`…).
- Customize: `update #detail set {tag_col} = {src_col}` khi remap.
- Structure: thẻ mới trong `<structure><detail>` và `<invoices><detail>`.
