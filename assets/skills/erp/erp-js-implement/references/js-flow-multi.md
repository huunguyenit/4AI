# JS — FlowMulti: form chọn → Nhận → gán grid / field

Pattern **Chọn từ nguồn** (lookup popup): bấm nút/chức năng → mở form Filter → tick dòng → **Nhận** → đẩy dữ liệu + ref vào grid chi tiết hoặc field master trên phiếu cha.

Mẫu tham chiếu: `FADeviceMultiForm.xml`, `TS2DeviceMultiForm.xml`, `PDMZTMMultiForm.xml`.

## Cấu trúc file

| File | Vai trò |
|------|---------|
| `Filter\{Name}MultiForm.xml` | Form popup (Dir), script transfer, action `GetOtherField` |
| `Grid\{Name}MultiGrid.xml` | Grid inquiry — tick `chon`, cột `sl_ss0` (SL nhận) |
| `Dir\{Parent}Tran.xml` | Phiếu cha — nút gọi `show${Identity}$` |

Entity chuẩn trong `*MultiForm.xml`:

```xml
<!ENTITY Identity "FADeviceMultiForm">
<!ENTITY ParentController "FATran">
<!ENTITY GridController "FADeviceMultiGrid">
<!ENTITY % FlowMultiVoucher SYSTEM "..\Include\FlowMultiVoucher.ent">
%FlowMultiVoucher;
<!ENTITY OtherCopyField "t_tien, t_tien_nt, ma, ...">
```

`OtherCopyField` = danh sách cột SQL trả thêm (ngoài grid tag row) — **đăng ký virtual column** cho `getColumnOrderTagRow`.

## Luồng tổng quát

```
Phiếu cha (FATran)
  → Toolbar/nút → show$FADeviceMultiForm$(grid hoặc form)
  → show$FlowMulti$Form(..., OtherCopyField)
  → User tick dòng + nhập sl_ss0 → Nhận (Checking)
  → Build f._$k = stt_rec + stt_rec0 (chuỗi #tagrow)
  → f.request('GetOtherField', ...)
  → SQL: #tagrow → load thêm field → SELECT trả về
  → on$Identity$Form$ResponseComplete → ghép array a
  → on$Identity$TransferData → grid/field trên document.body._form
  → f.cancelDialog()
```

**Quan trọng:** Form popup lấy phiếu cha qua `document.body._form` (FATran set `document.body._form = f` trong `active$Voucher$`).

## Skeleton MultiForm — script bắt buộc

```javascript
function show$FADeviceMultiForm$(f) {
  var z = f.grid, h = z.get_element().parentForm, queryFilterString = '', c = String.fromCharCode(253);
  queryFilterString = h.getItemValue('ma_dvcs');
  queryFilterString += c + z._filter$Fields[0]; // ... filter từ grid cha
  show$FlowMulti$Form(f, queryFilterString, 'FADeviceMultiFormDataGridPanel',
    'FATran', 'FADeviceMultiGrid', 't_tien, t_tien_nt, ma, ...');
}

function on$FADeviceMultiForm$Form$ResponseComplete(sender, e) {
  var f = e.object, context = e.type.Context, result = e.type.Result;
  switch (context) {
    case 'Checking':
      // build f._$k từ g._$k (dòng đã tick)
      if (f._$k == '') f.grid._formScript = 'show$FlowMulti$RetrieveGrid(this)';
      else {
        f._checked = false;
        f.request('GetOtherField', 'GetOtherField', [['k', 'Infinite', f._$k]]);
      }
      break;
    case 'GetOtherField':
      var g = getGrid$FlowMulti$(f), a = [];
      for (var i = 0; i < result.length; i++) {
        a[i] = g._$k[i].concat(result[i].slice(2)); // bỏ array$, id
      }
      on$FADeviceMultiForm$TransferData(f, g, a);
      break;
  }
}
```

## Action GetOtherField — SQL

```xml
<action id="GetOtherField">
  <text>
    &FlowMultiTagRowRequest;<![CDATA[
-- #tagrow đã có stt_rec, stt_rec0 từ f._$k
select ... into #temp from nguon a
  where exists (select 1 from #tagrow b where a.stt_rec = b.stt_rec)

select '' as array$, row_number() over(order by ...) as id,
  ]]>&OtherCopyField;<![CDATA[
  from ...
return
    ]]>
  </text>
</action>
```

- `&FlowMultiTagRowRequest;` — parse `@k` → `#tagrow` (include chuẩn, **không viết lại**)
- SQL phức tạp / UNION: khai biến default một lần (`@empty_v33`, `@zero_19_4`...) — skill `fbo_style_sql`
- Cột mới cho JS: thêm vào entity `OtherCopyField` **cuối list** (tránh lệch index hardcode)

## TransferData — gán vào grid cha

```javascript
function on$FADeviceMultiForm$TransferData(f, g, a) {
  var w = document.body._form;                    // phiếu FATran
  var z = w.getItem('zcdmtsttbt')._controlBehavior; // grid đích
  var f1 = 'stt_rec, sl_ss0', f2 = 'stt_rec_tb, so_luong'; // map key nguồn → đích
  var fields = 'ma_tb, ten_tb%l, ma_nt, ty_gia, gia_nt, tien_nt, dvt';
  var l3 = getColumnOrderTagRow(g, 'sl_ss0');   // index trong array a

  for (var r = 0; r < a.length; r++) {
    if (a[r][l3] == 0) continue;                  // SL nhận = 0 → bỏ
    z._appendRow(null, true);                     // hoặc tái dụng dòng trống — xem js-grid-fill.md
    row = z._rowCount;
    insert$RetrieveTagRow$Items(g, a, r, z, row, fields, f1, f2);
    z.executeExpression(o, [z.$a.tien_tg, z.$a.gia]);
  }

  // Gán field master (chỉ khi trống)
  if (w.getItemValue('tk_ts') == '') w.setItemValue('tk_ts', tk_ts);
  w.setReferenceKeyFilter('loai_ts');

  z._focusWhenTabChanged();
  f.cancelDialog();   // đóng popup — luôn cuối luồng
}
```

### insert$RetrieveTagRow$Items

Hàm include FlowMulti (encrypted) — copy cột từ array `a` sang grid đích theo `fields` + map `f1`→`f2`.

| Tham số | Ý nghĩa |
|---------|---------|
| `g` | Grid FlowMulti (nguồn tag row) |
| `a, r` | Mảng kết quả + index dòng |
| `z, row` | Grid đích + số dòng |
| `fields` | Cột copy thẳng tên giống nhau |
| `f1`, `f2` | Cặp cột map khác tên (`stt_rec,sl_ss0` → `stt_rec_tb,so_luong`) |

### getColumnOrderTagRow vs _getColumnOrder

| API | Dùng khi |
|-----|----------|
| `getColumnOrderTagRow(g, 'sl_ss0')` | Cột trên **array `a`** (grid tag + OtherCopyField) |
| `z._getColumnOrder('ma_tb')` | Cột trên **grid đích** `z` |

**Lưu ý:** Một số code cũ dùng `a[r][z._getColumnOrder('ma_tb')]` — chỉ đúng nếu index trùng tình cờ; ưu tiên `getColumnOrderTagRow`.

## Gán nhiều grid / nhiều nguồn — pattern `id_get_data`

Khi **Nhận** cần đẩy **2 loại dòng** (vd. thiết bị + phụ tùng) từ một lần SQL:

1. `OtherCopyField` thêm `id_get_data` (+ cột từng loại)
2. SQL `UNION ALL`: nhánh 1 `id_get_data = 1`, nhánh 2 `= 2`
3. Append `stt_rec` cuối SELECT (ngoài OtherCopyField) để ghép tag row cho dòng con
4. `ResponseComplete`: dòng `=1` concat `g._$k[kIdx++]`; dòng `=2` tìm tag row theo `stt_rec`
5. Tách hàm transfer:
   - `TransferData` — `if (a[r][lId] != 1) continue`
   - `TransferAttached` — `if (a[r][lId] != 2) continue`
6. Gọi `TransferAttached` **trước** `cancelDialog`

Chi tiết mẫu: [examples-flow-multi-fa.md](examples-flow-multi-fa.md).

## Append vs replace

| Mode | Cách làm |
|------|----------|
| **Append** (phổ biến) | Không xóa grid; `blankMemvar` dòng 1 nếu trống rồi `_appendRow` |
| **Replace** | `DeleteData$Detail(w, 'zcdmtsttbt')` đầu `TransferData` |
| **Skip trùng** | Helper `checkExistsDevice(z, ma_tb)` trước append |

## Checking trên MultiForm

Validate trước khi Nhận — trong `<command event="Checking">` của `*MultiForm.xml`:

```javascript
var f = this, g = getGrid$FlowMulti$(f);
// vd. cùng ma_vt, cùng m_so_ct
if (l_ma_vt.length > 1) {
  $message.show(err1);
  f._checked = false;
}
```

Không nhầm với Checking phiếu cha.

## Checklist FlowMulti

```
- [ ] *MultiForm.xml: Identity, ParentController, GridController, OtherCopyField
- [ ] show$Identity$ → show$FlowMulti$Form(..., OtherCopyField)
- [ ] active$/close$ → on$Identity$Form$ResponseComplete
- [ ] Checking → build f._$k → request GetOtherField
- [ ] GetOtherField: &FlowMultiTagRowRequest; + SQL theo #tagrow
- [ ] ResponseComplete: a[i] = tagRow.concat(result[i].slice(2))
- [ ] TransferData: w = document.body._form, getItem grid/field đích
- [ ] insert$RetrieveTagRow$Items hoặc _setItemValue + setItemGridBehavior
- [ ] setItemValue master + setReferenceKeyFilter sau fill
- [ ] validExpression / executeExpression sau gán dòng
- [ ] cancelDialog cuối cùng
- [ ] Nhiều loại dòng: id_get_data + UNION + tách Transfer*
```

## So sánh với f.request thường

| | f.request master → grid | FlowMulti |
|--|-------------------------|-----------|
| Trigger | onChange field | Nút + form popup |
| Chọn nguồn | 1 key (ma_vv_m) | Nhiều dòng tick + sl_ss0 |
| Handler | `on$Voucher$ResponseComplete` | `on$Identity$Form$ResponseComplete` |
| Form đích | `f` (cùng form) | `document.body._form` (phiếu cha) |
| Fill | JSON hoặc setItemGridBehavior | `insert$RetrieveTagRow$Items` |
