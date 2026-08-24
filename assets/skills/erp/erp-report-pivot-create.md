---
id: erp-report-pivot-create
title: FBO — Pivot report
kind: skill
domain: erp
description: Setup pivot báo cáo FBO — RS1 xSearch/xPivot/nHeader + dataFields, RS2 #xPivot CROSS JOIN #nPivot, Grid pivot, ẩn cột theo DetailBy. Kế thừa erp-report-create. Mở khi xoay 12 tháng, kế hoạch/thực tế.
requires: [4ai-fbo]
disable-model-invocation: true
see-also: [erp-report-create, erp-sql-style]
version: 1
---
**Kế thừa `erp-report-create`** — đọc skill đó trước (Filter `field@name`, proc param tiếng Anh, sign, format, Key). Skill này chỉ **setup xoay cột**.

Load DATA và bốn vùng của proc báo cáo: `erp-report-create`.

## Bước 0 — Neo vào khách, trước mọi thứ khác

Chưa biết **program của khách nào** thì chưa bắt đầu. Tra bằng `list_programs` (thư mục
workspace đang đứng cũng tra được), nhắc lại program path để xác nhận, rồi mở entry trong
`ledger/tasks.md` trạng thái `Mới`.

Hai rule luôn-nạp cầm chỗ này, file này không thay thế chúng: `erp-program-scope`
(thay đổi chỉ nằm trong program của đúng khách đó) và `pm-ledger-discipline` (không có entry
thì việc chưa xong, kể cả khi code đã chạy). Quy trình đầy đủ ở `erp-customization-execute`.

---

## Khi nào dùng

- Grid `pivot rowField="xSearch" columnField="xPivot" dataFields="..."`
- Xoay kỳ (12 tháng, 6 tháng, cả năm) + nhiều chỉ tiêu
- User nói erp-report-pivot-create sau khi đã có proc nền

## Workflow

```
- [ ] 1. Xong erp-report-create (Filter + proc param + Key + DATA)
- [ ] 2. Gán xSearch / xPivot / nHeader + dataFields vào #report$
- [ ] 3. Fill 12 kỳ + tổng nửa năm / cả năm
- [ ] 4. RS1 SELECT #report$; RS2 #xPivot = DISTINCT từ #report$; #nPivot = dataFields
- [ ] 5. Grid pivot + ẩn cột khi @DetailBy = '0'
```

## Pattern chính

| Điều kiện | Hành động |
|-----------|-----------|
| Xoay kỳ + nhiều chỉ tiêu | RS1 `xSearch`/`xPivot`/`nHeader` + dataFields; RS2 `#xPivot` × `#nPivot` |
| Chi tiết / gom nhóm | `@DetailBy = '1'` dòng chi tiết; `'0'` gom theo kênh/nhóm — Filter ẩn cột theo `ct_theo` |

Chi tiết: [reference-pivot.md]({REFDIR}/reference-pivot.md).

## Pivot output

#xPivot là bảng sẽ lấy dictinct xPivot, nHeader từ #report$ để xoay
#nPivot là bảng sẽ bổ sung xử lý tên cho xPivot, ở đây #report$ đang có 3 cột dữ liệu ke_hoach, thuc_te, ty_le và nHeader đang chứa description general theo xPivot. #nPivot sẽ có 3 dòng ứng với 3 cột dữ liệu để liệt kê chi tiết  tên cột sẽ pivot. Nên về mặt nguyên tắt thì chỉ được pivot những gì có ở #report$, báo cáo sử dụng while để sinh #xPivot là sai logic.

**RS1** — `#report$`: cột cố định (stt, nhóm, tên…) + `xSearch`, `xPivot`, `nHeader` + dataFields (`ke_hoach`, `thuc_te`, `ty_le`…).

**RS2** — sau RS1, CROSS JOIN `#xPivot` × `#nPivot`: `name = nPivot.name + xPivot.id`, `header = nName + ' - ' + nHeader`.

Grid: `rowField="xSearch"` `columnField="xPivot"` `dataFields` khớp `#nPivot` (không `$`).

Grid
<pivot rowField="xSearch" columnField="xPivot" dataFields="ke_hoach, thuc_te, ty_le" indexTable="2" indexColumn="1" indexHeader="2" indexView="3"/>
rowField: Khóa theo dòng
columnField: Khóa theo cột (pivot)
dataFields: các cột sẽ pivot theo columnField
indexTable: trong proc trả dataset, 2 là dataset[2] để hệ thống xử lý pivot
indexColumn: từ dataset[2], lấy cột 1 làm id pivot
indexHeader: là header pivot theo indexColumn
indexView: đếm tại Grid thuộc tính fields@field[3] là cột bắt đầu pivot

Ẩn cột chi tiết khi gom: Filter JS `g._hiddenFields` theo `ct_theo` (field@name), không theo `@DetailBy`.

## Checklist

- [ ] Đã theo `erp-report-create`
- [ ] `#xPivot` DISTINCT từ `#report$` — không WHILE sinh kỳ
- [ ] `#nPivot` đúng số cột dataFields của `#report$`
- [ ] Grid `pivot`: rowField / columnField / dataFields / indexTable=2 / indexColumn / indexHeader / indexView
- [ ] `indexView` = vị trí field bắt đầu dataFields trong `fields`
- [ ] `_hiddenFields` dùng `getItemValue('ct_theo')`

## Anti-pattern

```
❌  Viết lại format/Key/param trong skill này — thuộc erp-report-create
❌  RS2 một chỉ tiêu gia_tri$ khi Grid dataFields nhiều cột
❌  WHILE / cứng 01..12 để sinh #xPivot — phải DISTINCT xPivot, nHeader từ #report$
❌  indexView đếm sai — phải trùng fields@field[n] cột bắt đầu dataFields
❌  indexTable khác 2 khi RS2 là dataset thứ 2 của proc
```

## Tài liệu

| File | Nội dung |
|------|----------|
| `erp-report-create` | Nền proc + Filter |
| [reference-pivot.md]({REFDIR}/reference-pivot.md) | RS1/RS2, Grid, fill kỳ |
| [examples-pivot.md]({REFDIR}/examples-pivot.md) | Ví dụ tham chiếu |
