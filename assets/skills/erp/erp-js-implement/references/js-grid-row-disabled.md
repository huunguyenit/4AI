# JS — Khóa cột grid theo dòng (`item.disabled`)

Pattern **khóa/mở ô theo từng dòng** khi điều kiện phụ thuộc dữ liệu trên chính dòng đó (vd. `ma_lct` chứa mã đặc biệt, `stt_rec_hddv` đã có sau khi lấy HDDV).

## Khi nào dùng

- Mỗi dòng grid có điều kiện khóa **khác nhau** (không khóa cả cột)
- Sau **FlowMulti / Nhận** form lọc → gán xuống 1 dòng cha → khóa dòng đó
- `onchange` field trên dòng → cập nhật trạng thái khóa ngay
- Mở phiếu (`Scatter`) → quét lại tất cả dòng

## Chọn cách khóa

| Cách | Phạm vi | Ghi chú |
|------|---------|---------|
| `g._getItem(row, col).disabled = true/false` | **Theo dòng** | Ưu tiên khi chỉ toggle khóa |
| `setItemGridBehavior(..., readOnlyFlag)` | Theo dòng | Khi **vừa gán value vừa khóa** từ SQL/response |
| `g._setColumnReadOnly(col, bool)` | **Cả cột** | Tránh — dòng A khóa làm dòng B cũng khóa |
| `g._fields[i].ReadOnly = true` | Metadata cột | Tránh cho per-row — ảnh hưởng toàn grid |

## Metadata cột — `g._fields`

`g._fields` là mảng metadata cột (Name, ReadOnly, External, Hidden, …). Dùng để tra cứu theo **Name**, không hardcode index `g._fields[4]`.

```javascript
function get$Grid$Field(g, field_name) {
  for (var i = 0; i < g._fields.length; i++) {
    if (g._fields[i].Name === field_name) return g._fields[i];
  }
  return null;
}
```

**Khi mở khóa** (`disabled = false`): bỏ qua cột `External === true` — tránh “unreadonly” cột external/load từ nguồn khác.

**Khi khóa** (`disabled = true`): áp theo điều kiện nghiệp vụ, không xét trạng thái khóa trước đó.

## Pattern — hàm A (1 dòng) + hàm B (quét)

### Hàm A — `setDisabled$Grid$Row(g, row)`

```javascript
function setDisabled$Grid$Row(g, row) {
  if (!g || row < 1) return;

  // Điều kiện đọc từ dòng row
  var col_key1 = g._getColumnOrder('{field_dieu_kien_1}');
  var col_key2 = g._getColumnOrder('{field_dieu_kien_2}');
  if (col_key1 < 1 || col_key2 < 1) return;

  var val_key1 = g._getItemValue(row, col_key1);
  var val_key2 = $func.trim(g._getItemValue(row, col_key2));
  var match_cond1 = /* logic nghiệp vụ trên val_key1 */;
  var match_cond2 = (val_key2 != '');

  var arr_fields = '{danh_sach_cot_khoa_cond1}'.split(',');
  var arr_fields_extra = '{cot_chi_khoa_khi_cond2}'; // thường là subset hoặc thêm 1 cột

  for (var i = 0; i < arr_fields.length; i++) {
    var field_name = $func.trim(arr_fields[i]);
    var col = g._getColumnOrder(field_name);
    if (col < 1) continue;

    var item = g._getItem(row, col);
    if (!item) continue;

    var should_disable = false;
    if (field_name === '{cot_chi_cond2}')
      should_disable = match_cond2;
    else
      should_disable = match_cond2 || match_cond1;

    if (should_disable) {
      item.disabled = true;
    } else {
      var field_meta = get$Grid$Field(g, field_name);
      if (field_meta && field_meta.External) continue;
      item.disabled = false;
    }
  }
}
```

### Hàm B — quét tất cả dòng

```javascript
function scanDisabled$Grid$AllRows(g) {
  if (!g) return;
  for (var i = 1; i <= g._rowCount; i++)
    setDisabled$Grid$Row(g, i);
}
```

## Nơi gọi hàm A / B

| Sự kiện | Gọi |
|---------|-----|
| `onchange` field điều kiện | `setDisabled$Grid$Row(g, o.row \|\| g._activeRow)` — trước hoặc sau `g.request` tùy chỉ cần value client |
| `on$Grid...$Enter` / chuyển dòng | `setDisabled$Grid$Row(g, g._activeRow)` |
| `Scatter$Grid...$` (mở phiếu) | `scanDisabled$Grid$AllRows(g)` |
| `ResponseComplete` sau load dòng | `setDisabled$Grid$Row(g, o.row)` |
| `insert$...$Retrieve$Data` (FlowMulti) | `setDisabled$Grid$Row(z, zRow)` sau khi `_setItemValue` |

FlowMulti: hàm transfer chạy trong context phiếu cha — gọi trực tiếp `setDisabled$Grid$Row(z, zRow)`, không cần truyền `o.grid` riêng.

## Checklist

```
- [ ] Khóa theo dòng → dùng g._getItem(row, col).disabled, không _setColumnReadOnly
- [ ] Tra metadata → loop g._fields theo Name, không g._fields[index] cố định
- [ ] Mở khóa → skip field External === true
- [ ] Hàm A nhận (g, row); hàm B loop _rowCount gọi hàm A
- [ ] onChange: row = o.row ? o.row : g._activeRow
- [ ] Scatter/load: scanDisabled$Grid$AllRows
- [ ] FlowMulti Nhận: setDisabled sau khi gán dữ liệu xuống dòng đích
- [ ] col < 1 → continue (cột không tồn tại trên grid)
```

## Anti-pattern

```
❌  g._setColumnReadOnly — khóa cả cột, dòng khác bị ảnh hưởng
❌  setItemGridBehavior chỉ để toggle readOnly khi không gán value (dùng disabled gọn hơn)
❌  applyReadOnly truyền (g, o) khi o.grid undefined (Scatter/_getItem)
❌  Hardcode g._fields[4] — thứ tự cột thay đổi theo view/XML
```

## Ví dụ tham chiếu

| File | Nghiệp vụ |
|------|-----------|
| `Grid/DCDetail.xml` | `setReadOnly$GridVoucherDetail$Row`, `scanReadOnly$GridVoucherDetail$AllRows` — `ma_lct` GTGT/HDBH; `stt_rec_hddv` sau HDDV |
| `Filter/DCHDDVForm.xml` | `insert$DCHDDVForm$Retrieve$Data` → `setReadOnly$GridVoucherDetail$Row(z, zRow)` |
