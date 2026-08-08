---
id: fbo-doctrine
title: FBO domain doctrine
kind: doctrine
domain: fbo-xml
description: FBO là gì — màn hình là XML controller, hai dòng sản phẩm FBO/FBI đánh số SP, bản đồ thư mục Controllers, mô hình .f/.xml.
requires: [4ai-fbo]
version: 1
---

## FBO là gì

**Fast Business Online** — ERP của Fast Software. Màn hình KHÔNG phải code: mỗi màn hình
là một **XML controller** trong `App_Data\Controllers\` của chương trình. Runtime là
ASP.NET WebForms (.NET Framework 4.7.2) + SQL Server, nhưng khi customize ta gần như
chỉ đụng XML, JavaScript nhúng và SQL nhúng.

Hai dòng sản phẩm: **FBO** và **FBI**, đánh phiên bản theo service pack `SP<nnn>`
(SP225, SP226, SP229, FBISP24…). Mỗi khách hàng chạy một **program** riêng — một bản
copy đầy đủ, thường nằm trên share `\\10.0.0.1\CustomerPro\`. Danh sách trong
`data/customers.json` của hub 4AI.

## Bản đồ `App_Data\Controllers\`

| Thư mục | Vai trò |
|---|---|
| `Dir` | Màn hình nhập liệu (voucher / danh mục) — điểm vào chính |
| `Grid` | Lưới, gồm cả detail grid của chứng từ |
| `Filter` | Màn hình điều kiện lọc |
| `Report` | Báo cáo (đi kèm `.rpt` Crystal Reports) |
| `Lookup` | Tra cứu / chọn dữ liệu |
| `Include` | **Mảnh dùng chung** — `XML\`, `Command\`, `Javascript\` — sửa là ảnh hưởng toàn hệ thống |
| `Query` `View` `Post` `Flow` `List` `Structure` `Options`… | Các loại phụ trợ |

Include hoạt động bằng **DTD entity**:

    <!DOCTYPE dir [
      <!ENTITY XMLWhenVoucherInit SYSTEM "..\Include\XML\WhenVoucherInit.xml">
      <!ENTITY ScriptVoucherInit SYSTEM "..\Include\Javascript\VoucherInit.txt">
    ]>

và tham chiếu trong thân là `&XMLWhenVoucherInit;`.

## Mô hình `.f` / `.xml`

`.f` là controller chuẩn (đã compile/mã hoá). `.xml` cùng tên đặt cạnh là **bản customize**
— có `.xml` nghĩa là màn hình đó đã được chỉnh cho khách. Chi tiết và số liệu kiểm chứng:
rule `fbo-f-vs-xml-pairing`.

## Mã chứng từ và sysid là hai thứ khác nhau

| Ví dụ | Là gì | Sống ở đâu |
|---|---|---|
| `HDA`, `HD1` | **mã chứng từ** — khái niệm nghiệp vụ người dùng nói | `wcommand.syscode` (db `sys`), `dmct9.ma_ct` (db `app`) |
| `SVTran`, `CPTran` | **sysid** — controller và bảng vật lý | `wcommand.sysid`, và chính là tên file trong `Controllers\` |

Chỉ mục controller là file-based nên nó **không biết** mã chứng từ: `find_controller { query: "HDA" }`
trả rỗng, vì không file nào tên HDA. Đường đi đúng là `resolve_vouchercode` — nó tra `wcommand`
lấy sysid rồi mới tra chỉ mục. `HDA` → `SVTran` → `Dir\SVTran.xml`.

## Tool

Mọi điều tra đi qua MCP server **`4ai-fbo`** — server riêng của hub này, nguồn ở `mcp/fbo/`:

| Tool | Việc |
|---|---|
| `list_programs` | Chương trình nào đã đăng ký, đã index chưa |
| `index_program` | Quét cây Controllers vào chỉ mục cục bộ (chạy một lần cho mỗi program) |
| `find_controller` | Tên nghiệp vụ → mã controller. Không dấu hay có dấu đều được |
| `resolve_vouchercode` | Mã chứng từ (HDA) ↔ sysid (SVTran) ↔ controller |
| `describe_controller` | Field, nhãn Việt/Anh, bảng SQL, cặp `.f`/`.xml`, entity |
| `list_related` | companion · lookup · include · **used_by** (phạm vi ảnh hưởng) |
| `resolve_entities` | Entity → file thật, có tồn tại không, bao nhiêu controller dùng chung |
| `search_content` | Controller nào gọi hàm JS này / đụng bảng này |
| `read_source` | Đọc file kèm charset/BOM/newline gốc |
| `query_sql` | SQL qua Web.config — không bao giờ trả connection string |

Chỉ mục tách theo từng program và nằm trong hub 4AI, **không bao giờ** ghi vào thư mục
chương trình khách. Luôn xác định **program** trước khi hỏi bất cứ điều gì.
