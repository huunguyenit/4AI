# GLTran — HDDV Recipe (PK1 / m11$)

**File:** `App_Data/Controllers/Dir/GLTran.xml`  
**Include:** `%InputInvoice.Include.GLTran;`  
**Bảng link HĐ:** `h11$`  
**Detail/Tax:** `d11`, `r30`

## Entity SQL (nhóm chuẩn)

| Event | Entity |
|-------|--------|
| Inserting | `&InputInvoiceCheck;` |
| Inserted | `&InputInvoiceInsert;` **only** |
| Updated | `&InputInvoiceUpdate;` |
| Deleted | `&InputInvoiceDelete;` |

## @script — R2SP222

Inserted và Updated: `InputInvoiceScriptDeclare` → `Warning` → Insert/Update → `ScriptQuery`.

Inserted kết thúc bằng `CommandShowWarningMessage` + `return`.

## Đặc biệt

- Inserted có `zclkts` / `zclkcc` từ `d11` — giữ nguyên.
- **Lỗi migrate:** không đặt entity trong CDATA; **không** gọi `InputInvoiceUpdate` trong Inserted.
- Script có `ScriptQueryData`, `PostScript`, `FlowMultiScript`.
- `saveForm` / `cancelForm` — logic gốc, không xóa.

## Extender

`FlowMultiVoucher` + `PostScript` (Post ≠ List).
