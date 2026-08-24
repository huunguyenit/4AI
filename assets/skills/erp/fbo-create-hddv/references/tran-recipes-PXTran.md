# PXTran — HDDV Recipe (PXD / m26$) — **Nhóm II***

**File:** `App_Data/Controllers/Dir/PXTran.xml`  
**Include:** `%InputInvoice.Include.PXTran;` → `InputInvoice.PXTran`  
**Bảng link HĐ:** `h26$000000`  
**Detail:** `d26` (không tab thuế `r30` riêng như mua hàng)

## Entity SQL — DÙNG II*

| Event | Entity |
|-------|--------|
| Inserting | `&IICheck;` |
| Inserted | `&IIInsert;` |
| Updated | `&IIUpdate;` |
| Deleted | `&IIDelete;` |

## @script — R2SP222

```xml
&InputInvoiceScriptDeclare;
&InputInvoiceScriptWarning;
&IIInsert;             <!-- KHÔNG InputInvoiceInsert -->
&InputInvoiceScriptQuery; ...
```

Updated: `IIUpdate` + `ScriptQuery` + `CommandShowWarningMessage` (một lần — **không** duplicate).

## Extender kèm theo

- `FlowMultiVoucher` + `FlowMultiScript`
- `ESPostInsert` / `ESPostUpdate` (không nhầm với PostScript List)
- `EndUpdatedVoucherNumber` trước block II trong Updated

## Migrate từ KRAFT/R2SP2255

- **Không** copy `ma_tt`, `ten_tt%l` nếu user không yêu cầu.
- View chỉ `InputInvoiceView` trên dòng `t_tt`.

## Dự án có List

`ListDeclare` + ... + `IIInsert` + `ListQuery` — entity vẫn là **IIInsert**, không đổi.
