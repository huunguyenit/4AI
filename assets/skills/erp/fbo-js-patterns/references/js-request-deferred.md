# Request trước — làm sau (ResponseComplete)

Pattern chung khi **cần gọi DB** (check, validate, load) **trước** khi thực hiện hành động UI tiếp theo. Dùng cho mọi case: check quyền, check trạng thái, load dữ liệu rồi mở form, v.v.

## Khi nào dùng

| Tình huống | Ví dụ |
|------------|-------|
| Validate / check trước khi ghi | Check trạng thái HĐ → mới tạo chứng từ |
| Check quyền realtime | Check danh mục phân quyền → mới Confirm |
| Load data rồi mới xử lý | Load JSON → fill grid / showForm |
| Dữ liệu thay đổi ngoài session | **Không** cache lúc `Loading` — gọi request mỗi lần bấm nút / onChange |

## Luồng chung (3 bước)

```
1. Sự kiện UI (onChange / ExecuteCommand / do$Action)
     → gom tham số vào biến tạm g._$... / f._$...
     → g._$pendingContext = 'TênBướcSau'   // nhớ việc sẽ làm khi OK
     → g.request / f.request('ActionPhụ', ...)

2. <response><action id="ActionPhụ"> SQL/proc → result

3. on$...$ResponseComplete case 'ActionPhụ'
     → đọc result[0].Value (hoặc JSON, nhiều cột)
     → FAIL: $message.show + return
     → OK: thực hiện bước 2 theo _$pendingContext
           (g.request action chính / showForm / fill grid / gọi handler menu)
```

**Quy tắc:** hàm bước 1 **không** gọi thẳng action cuối — luôn chờ ResponseComplete.

## Cú pháp request

### Dir (form)

```javascript
f.request(actionId, context, ['field1', 'field2'], sender);
// field name → @field1, @field2 trong SQL
```

### Grid (toolbar / tick dòng)

```javascript
g.request(g, actionId, context, [
  ['param1', 'String', value1],
  ['param2', 'String', value2]
]);
// param name → @param1, @param2 trong SQL
```

## Biến tạm trên grid/form

| Biến | Mục đích |
|------|----------|
| `_$pendingContext` | Route bước 2 trong ResponseComplete (tên tùy dự án: `_$pqNextContext`, `_$nextAction`...) |
| `_$sttRec`, `_$maDvcs`, ... | Tham số đã gom từ `_$k` / active row — dùng lại sau khi check OK |
| `_$executeMenuValue` | Lưu `e.type.Value` khi menu chờ async |
| `_$executeCancelEvent` | Lưu `e.type.cancelEvent` trước `g.request` |

Menu/toolbar: set `e.type.cancelEvent = true` khi chờ response — tránh chạy handler đồng bộ song song.

## ResponseComplete — route bước 2

```javascript
case 'ActionPhụ':
  if (result[0].Value != 1) {  // hoặc parse JSON / switch mã lỗi
    $message.show(...);
    return;
  }
  if (g._$pendingContext == 'BuocA') {
    g.request(g, 'ActionChinh', 'ActionChinh', [...]);
  } else if (g._$pendingContext == 'BuocB') {
    on$Handler$Menu(g, g.get_id(), g._$executeMenuValue, g._$executeCancelEvent);
  }
  break;
```

Có thể chain nhiều tầng: `ActionPhụ1` OK → `ActionPhụ2` → action chính (vd. `CheckStatus...` → `GetInvoiceData`).

## XML — action phụ trả gì

| Kiểu trả | SQL | JS đọc |
|----------|-----|--------|
| Pass/fail | `select 1 as value` / `select 0 as value` | `result[0].Value` |
| Mã lỗi | `select 1 as value` (invalid status), `select 2 as value` (...) | `switch (result[0].Value)` |
| JSON | `select @json as json` | `JSON.parse(result[0].Value)` |
| Nhiều cột | `select a as col1, b as col2` | `result[0].Value`, `result[1].Value` |

Chi tiết khai action: [xml-request.md](xml-request.md).

## Ví dụ 1 — Check quyền → Confirm (InputInvoice)

**Bước 1** — `do$Confirm`: gom `_$k`, `_$maDvcs` → request check:

```javascript
g._$pendingContext = 'Confirm';
g.request(g, 'CheckPqDvumh', 'CheckPqDvumh', [
  ['ma_dvcs', 'String', g._$maDvcs],
  ['pqRight', 'String', 'xac_nhan_yn']
]);
```

**Bước 2** — ResponseComplete OK → request ghi:

```javascript
g.request(g, 'Confirm', 'Confirm', [
  ['sttRec', 'String', g._$sttRec],
  ['xacnhan_yn', 'String', g._$xacnhan_yn]
]);
```

SQL `CheckPqDvumh`: `@@admin` bypass; `vsysuserinfo.id` → `name`; `fsd_StringToTable(@ma_dvcs)`; so khớp danh mục phân quyền. Danh mục: skill [fbo-create-category](../fbo-create-category/SKILL.md).

## Ví dụ 2 — Check trạng thái → load data (InputInvoice / CreateVoucher)

**Bước 1** — `do$CreateVoucher` gom `_$sttRec`, `_$ngayCt`:

```javascript
g.request(g, 'CheckStatusExtractedAndStatusBatch', 'CheckStatusExtractedAndStatusBatch', [
  ['sttRec', 'String', g._$sttRec],
  ['ngay_ct', 'String', g._$ngayCt]
]);
```

**Bước 2** — ResponseComplete: `value==0` → `GetInvoiceData`; `1`/`2` → báo lỗi trạng thái.

Cùng pattern deferred — khác mục đích SQL.

## Ví dụ 3 — onChange master → fill grid (Dir, 1 tầng)

```javascript
f.request('LoadVVDetail', 'LoadVVDetail', ['ma_vv_m', 'stt_rec', 'ma_dvcs'], o);
// ResponseComplete → JSON.parse → append row grid
```

Một request nhưng cơ chế giống: **UI không tự fill** — chờ response.

## Không làm

- Cache dữ liệu DB trong `command Loading` khi cần realtime
- Khai báo biến JS (`_$userName`, `_$pqAdmin`...) không dùng ở ResponseComplete
- Gọi thẳng action cuối trong `ExecuteCommand` / `onChange` khi đã có bước check DB

## Checklist

```
- [ ] <action id="ActionPhụ"> trong <response> — SQL trả value/json đủ cho nhánh OK/FAIL
- [ ] Bước 1: gom tham số + set _$pendingContext → request ActionPhụ (không gọi action chính)
- [ ] ResponseComplete case ActionPhụ → FAIL: message + return
- [ ] ResponseComplete → OK: route theo _$pendingContext / chain request tiếp
- [ ] Menu async: cancelEvent + lưu e.type.Value trước request
- [ ] Dir: if (f._action === 'View') return trước request
```
