---
id: erp-einvoice-package-migrate
title: FBO — Update e-invoice runtime package
kind: skill
domain: erp
description: Nâng cấp gói HDDT/EInvoice runtime FBO — so sánh với program phiên bản mới hơn rồi sao chép dll, ashx/asmx/aspx, command/wcommand, js/css. Mở khi UR Update gói HDDT, nâng cấp version HDDT.
requires: [4ai-fbo]
see-also: [erp-einvoice-customize, erp-history-search, pm-ledger-maintain, pm-handover-author]
disable-model-invocation: true
version: 4
---
Skill cho UR **nâng cấp gói HDDT** trên chương trình đã chạy lâu / customize nhiều:
đối chiếu nguồn phiên bản mới hơn → lập bảng diff → sao chép có kiểm soát.

**Không dùng** khi:

| UR thật sự là… | Skill đúng |
|----------------|------------|
| Vá payload / form / `dmhddtbs` / Customize | `erp-einvoice-customize` |
| Spec pháp lý (NĐ70, NĐ252…) | skill spec tương ứng + `erp-rollout-execute` |
| Migrate HDDV / ImportXml | `erp-hddv-migrate` |
| Chỉ hỏi “PH lỗi” / cấu hình proxy portal | không dùng skill này |

> Tính năng **hiếm** — chỉ mở khi user gọi rõ *Update gói HDDT* / *nâng cấp version HDDT* / tên skill này.

---

## Khi nào dùng

- User: `Update HDDT`, `Update gói HDDT`, `nâng cấp phiên bản HDDT`, `update dll HDDT`
- UR ghi nhận chương trình **đã chỉnh sửa nhiều** — không được copy đè mù controller XML
- Cần so sánh / sao chép: **dll, file, wcommand, command, .asmx, .aspx, .ashx, js, css**

---

## Pattern chính — So sánh rồi chép (diff-then-copy)

Luôn làm theo thứ tự: **chốt nguồn → inventory → diff → phân loại → chép → verify**.
Không chép cả cây program. Không overwrite nhóm “giữ customize” trừ khi user duyệt từng file.

Chi tiết nhóm file: [reference-inventory.md]({REFDIR}/reference-inventory.md)
Quy tắc diff/copy: [reference-diff-copy.md]({REFDIR}/reference-diff-copy.md)

---

## Workflow

```
- [ ] 1. Neo khách: list_programs → program path + ma_pbsp; mở ledger entry (Mới)
- [ ] 2. Chốt nguồn tham chiếu (thứ tự ưu tiên bên dưới) — nhắc lại path cho user xác nhận
- [ ] 3. Chốt DIỆN: query wcommand 11.12.20–11.12.64 hai phía, trừ ba dòng EIRelease…
- [ ] 4. Inventory hai phía theo nhóm trong reference-inventory
- [ ] 5. Diff: thiếu / mới hơn / khác size-date / chỉ có ở nguồn / chỉ có ở đích (kèm menu)
- [ ] 6. Phân loại từng file: SAFE_COPY | MERGE_REVIEW | DO_NOT_TOUCH | ASK_USER
- [ ] 7. Trình bảng diff + đề xuất; chờ user duyệt trước khi chép hàng loạt
- [ ] 8. Controller cần sửa: lấy .xml gốc SourceCollection theo version ĐÍCH rồi mới merge
- [ ] 9. Sao chép theo lô đã duyệt (backup path đích trước khi ghi đè) + INSERT dòng wcommand
- [ ] 10. resolve_entities trên TỪNG file đã chép → chép nốt Include còn thiếu, lặp tới khi đóng
- [ ] 11. Verify tồn tại + size/date; ghi ledger + checklist bàn giao (PH thử, menu HDDT)
```

### Chọn nguồn tham chiếu (ưu tiên)

1. **Path user chỉ rõ** trong UR / chat — thắng mọi heuristic
2. **SourceCollection theo version** — `\\172.168.5.14\SourceCollection\FBO-FBI\<version>` — nguồn `.xml` gốc, dùng cho mọi controller phải sửa
3. **Program CHUAN cùng dòng SP** gần nhất mà khách đích có thể nhận (vd `FBOSP2422CHUAN`) — chỉ khi user đồng ý vượt SP
4. **Khách cùng `ma_pbsp` (hoặc cùng major SP) đã Update gói HDDT gần đây** — `search_qlyc` (MCP `fastbusiness_mcp`) query `Update gói HDDT`. Khách này để **đọc cách làm**; file vẫn lấy từ SourceCollection
5. **Không đoán** path ngoài các lựa chọn trên — hỏi lại

> Khách SP cũ (vd R2 SP223) **không** mặc định lấy nguyên runtime từ SP24xx. Nguồn phải **cùng họ / cùng mức tương thích** hoặc user chấp nhận rủi ro vượt bản.

---

## Phân loại hành động

| Nhãn | Điều kiện | Hành động |
|------|-----------|-----------|
| **SAFE_COPY** | Runtime thuần: `AppHandler\EInvoice*.ashx`, `AppService\FastBusiness.EInvoice*.asmx`, `Main\*hddt.aspx` thiếu ở đích, dll trong gói user cung cấp | Chép sau duyệt lô |
| **MERGE_REVIEW** | `Commands` / `WCommands` / `Include\Command` / js-css có thể đã sửa | Diff nội dung; chỉ chép khi xác nhận không mất customize |
| **DO_NOT_TOUCH** | `Dir\` `Grid\` `Filter\` XML đã customize; `Include\` dùng chung đã vá; `Options\Service.xml` / license | Không overwrite; tách UR customize nếu cần |
| **ASK_USER** | File lạ, dll ngoài inventory, web.config, Proxy host | Hỏi trước |

---

## Quy tắc bắt buộc

1. **Diff trước, chép sau** — không `robocopy` / copy cả folder program.
2. **Chương trình chỉnh sửa nhiều** → mặc định bảo vệ `App_Data\Controllers\Dir|Grid|Filter|Include`.
3. **Backup** file đích (copy `.bak-YYYYMMDD` cạnh file hoặc thư mục backup do user chỉ) trước khi ghi đè.
4. **DLL**: nhiều program không có `bin\*EInvoice*` trong tree — nếu UR yêu cầu dll mà không thấy trong program, hỏi path gói / thư mục deploy, không bịa.
5. **Controller phải sửa thì bắt đầu từ `.xml` gốc SourceCollection theo version của program ĐÍCH**, rồi mới merge nội dung. Không sửa `.f`, không dựng `.xml` từ `.f` — `.f` của khách bị mã hóa. Dự án tham khảo chưa có `.xml` cũng lấy gốc từ SourceCollection theo version của chính nó. **Không tìm thấy `.xml` ở version nào trong share thì mang thẳng file `.f`** từ program nguồn sang, giữ nguyên đuôi `.f`.
6. **Chép file controller chưa phải là xong**: DOCTYPE của nó trỏ sang `..\Include\…` mà dự án cũ thường chưa có. Chạy `resolve_entities` trên từng file đã chép, mang qua mọi entity có `systemPath` mà `exists: false`, rồi **lặp lại** vì `.ent` tự khai SYSTEM tiếp. Entity `systemPath: null` là khai inline — bỏ qua, không phải file thiếu.
7. **`EIReleasedInvoice*` không thuộc gói** — đó là Hóa đơn bán ra, cần UR riêng. Đừng nhầm với `EIReleaseType` (kiểu phát hành, thuộc gói).
8. **Menu `wcommand` là một phần của gói**: dòng 11.12.20–11.12.64 còn thiếu phải INSERT (trừ ba dòng `EIRelease…`), trình câu lệnh cho user duyệt. Ngoài phạm vi đó, **không** deploy SQL / `dmhddtbs` trong skill này — chuyển `erp-einvoice-customize`.
9. **Không** sửa file bằng PowerShell `Set-Content` cho XML/JS cần accept trong IDE — file binary/runtime copy thì dùng lệnh copy sau khi đã duyệt.
10. Ghi ledger theo `pm-ledger-maintain`; bàn giao theo `pm-handover-author` (verify: mở menu HDDT, phát hành thử nếu môi trường cho phép).

---

## Checklist

- [ ] Đúng loại UR (gói runtime), không nhầm customize payload
- [ ] Diện gói chốt từ `wcommand` 11.12.20–11.12.64, đã loại ba dòng `EIRelease…`
- [ ] Nguồn tham chiếu đã xác nhận path + lý do chọn; tên thư mục version đã xác nhận với user
- [ ] Bảng diff đủ nhóm: dll · ashx · asmx · aspx · command/wcommand · js/css · (khác)
- [ ] Mỗi dòng có nhãn SAFE_COPY / MERGE_REVIEW / DO_NOT_TOUCH / ASK_USER
- [ ] User duyệt trước khi chép hàng loạt
- [ ] Đã backup file bị ghi đè
- [ ] Controller đã sửa đều bắt đầu từ `.xml` gốc SourceCollection
- [ ] `resolve_entities` sạch trên mọi file đã chép — không còn Include nào `exists: false`
- [ ] Dòng `wcommand` còn thiếu đã INSERT; menu HDDT mở ra thấy đủ chức năng
- [ ] Verify tồn tại; ledger + mục khách cần thử

---

## Tài liệu

| File | Nội dung |
|------|----------|
| [reference-inventory.md]({REFDIR}/reference-inventory.md) | Nhóm path / pattern tên file gói HDDT |
| [reference-diff-copy.md]({REFDIR}/reference-diff-copy.md) | Cách diff, bảng báo cáo, lệnh copy an toàn |

> Xem thêm: `erp-einvoice-customize`, `erp-history-search`, `pm-ledger-maintain`, `pm-handover-author`
