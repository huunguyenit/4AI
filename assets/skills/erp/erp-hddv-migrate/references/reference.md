# FBO HDDV — Reference

## Hai nhóm entity SQL

| Nhóm | File | Inserting | Inserted | Updated | Deleted | Include SQL |
|------|------|-----------|----------|---------|---------|-------------|
| Chuẩn | APTran, ASTran, GLTran, JPTran, PFTran, PGTran, PSTran, PVTran | `InputInvoiceCheck` | `InputInvoiceInsert` | `InputInvoiceUpdate` | `InputInvoiceDelete` | `InputInvoice.ent` (`h&Tag;$`) |
| Custom | PATran, PXTran | `IICheck` | `IIInsert` | `IIUpdate` | `IIDelete` | `InputInvoice.PATran` / `InputInvoice.PXTran` |

## Mapping List ↔ InputInvoiceScript (chỉ khi không có List)

| List | Thay bằng |
|------|-----------|
| `ListDeclare` | `InputInvoiceScriptDeclare` |
| `ListWarning` | `InputInvoiceScriptWarning` |
| `ListQuery` | `InputInvoiceScriptQuery` |
| `ListCommand` | *(bỏ)* |

**Khi dự án có List:** giữ nguyên List — entity Insert vẫn là `InputInvoiceInsert` hoặc `IIInsert` tùy recipe.

## Bảng master / link HĐ (R2SP222)

| Tran | ma_ct | m$ | h$ |
|------|-------|-----|-----|
| GLTran | PK1 | m11$ | h11$ |
| PXTran | PXD | m26$ | h26$ |
| APTran | PN1 | m31$ | h31$ |
| ASTran | PN2 | m32$ | h32$ |
| JPTran | PN9 | m39$ | h39$ |
| PATran | PNE | m83$ | h83$ |
| PFTran | PNC | m73$ | h73$ |
| PGTran | PNG | m78$ | h78$ |
| PVTran | PNA | m71$ | h71$ |
| PSTran | PXC | m86$ | h86$ |

## Extender kèm theo (không phải List)

| Tran | FlowMulti | DP | Post |
|------|-----------|-----|------|
| APTran | ✓ | ✓ | |
| ASTran | ✓ | | |
| GLTran | ✓ | | ✓ |
| JPTran | ✓ | | |
| PATran | ✓ | | |
| PFTran | ✓ | ✓ | |
| PGTran | ✓ | ✓ | |
| PSTran | ✓ | | ✓ |
| PVTran | ✓ | ✓ | ✓ |
| PXTran | ✓ | | |

## Recipe files

Mỗi file một recipe: [tran-recipes/](tran-recipes/)

- [APTran.md](tran-recipes/APTran.md) — `InputInvoiceInsert`, LOITP, zclkts, DP
- [ASTran.md](tran-recipes/ASTran.md)
- [GLTran.md](tran-recipes/GLTran.md) — lỗi entity trong CDATA
- [JPTran.md](tran-recipes/JPTran.md)
- [PATran.md](tran-recipes/PATran.md) — **IIInsert**
- [PFTran.md](tran-recipes/PFTran.md)
- [PGTran.md](tran-recipes/PGTran.md)
- [PSTran.md](tran-recipes/PSTran.md)
- [PVTran.md](tran-recipes/PVTran.md) — warning tháng trước Script*
- [PXTran.md](tran-recipes/PXTran.md) — **IIInsert**
- [list-vs-script.md](tran-recipes/list-vs-script.md)

## InputInvoiceRefreshGridCommand

Luôn nằm trong `InputInvoiceInsert` / `IIInsert` (cuối entity). Cần `@script` đã declare — qua List **hoặc** InputInvoiceScript*.
