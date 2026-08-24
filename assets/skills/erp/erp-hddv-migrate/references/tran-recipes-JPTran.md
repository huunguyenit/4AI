# JPTran — HDDV Recipe (PN9 / m39$)

**File:** `App_Data/Controllers/Dir/JPTran.xml`  
**Include:** `%InputInvoice.Include.JPTran;`  
**Bảng link HĐ:** `h39$`  
**Detail/Tax:** `d39`, `r30`

## Entity SQL (nhóm chuẩn)

| Event | Entity |
|-------|--------|
| Inserting | `&InputInvoiceCheck;` |
| Inserted | `&InputInvoiceInsert;` |
| Updated | `&InputInvoiceUpdate;` |
| Deleted | `&InputInvoiceDelete;` |

## @script — R2SP222

Pattern giống ASTran: `InputInvoiceScript*` + `InputInvoiceInsert/Update/Delete`.

## Extender kèm theo

- `FlowMultiVoucher` + `FlowMultiScript`
- **Không** DP, **không** Post

## View

Thêm `[ticket]` vào dòng view `dien_giai` nếu thiếu.
