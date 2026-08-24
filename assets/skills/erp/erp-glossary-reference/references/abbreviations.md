# Viết tắt nghiệp vụ ↔ mã Fast ↔ English

Bảng này để **giải mã cách người dùng nói**, rồi bắc cầu sang thứ có thật trong phần mềm.
Khách hàng, BA và lập trình viên gõ tắt theo thói quen kế toán Việt Nam; Fast lại đặt mã và
tên tiếng Anh riêng. Cột "Mã Fast" là cầu nối.

Cột **Nguồn** nói rõ mức tin cậy:
- `dmct` / `dmphanhe` / `wcommand` — đọc thẳng từ database SP2422, chắc chắn.
- `nghiệp vụ` — cách gọi tắt phổ thông trong kế toán/sản xuất Việt Nam, không phải mã Fast.
  Dùng để **hiểu người nói**, không được dùng làm mã trong code.

## Chứng từ hay bị gọi tắt

| Người dùng gõ | Tiếng Việt đầy đủ | English | Mã Fast | sysid | Nguồn |
|---|---|---|---|---|---|
| LSX, lệnh SX, MO | Lệnh sản xuất | Manufacturing Order | `SX1` | `MOTran` | `dmct` |
| BOM, ĐM NVL, định mức | Cấu trúc nguyên vật liệu | Bill of Materials | `DM1` | — | `dmct` |
| WO, YCSX | Yêu cầu sản xuất | Work Order | `SF2` | `S2Tran` | `dmct` |
| PNK, phiếu nhập | Phiếu nhập kho | Receiving Transaction | `PND` | `IRTran` | `dmct` |
| PXK, phiếu xuất | Phiếu xuất kho | Issuing Transaction | `PXA` | `ISTRan` | `dmct` |
| HĐ bán, hóa đơn BH | Hóa đơn bán hàng | Sales Invoice | `HDA` | `SVTran` | `dmct` |
| HĐ dịch vụ | Hóa đơn dịch vụ | Sales Service Invoice | `HD1` | `ARTran` | `dmct` |
| ĐH bán, SO | Đơn hàng bán | Sales Order | `DXA` | `SOTran` | `dmct` |
| ĐH mua, PO | Đơn hàng nhập mua trong nước | Domestic Purchase Order | `PO1` | `BIPOTran` | `dmct` |
| PR, phiếu nhu cầu | Phiếu nhu cầu vật tư | Purchase Requisition | `PR1` | `PRTran` | `dmct` |
| PT, phiếu thu | Phiếu thu tiền mặt | Cash Receipt | `PT1` | `CRTran` | `dmct` |
| PC, phiếu chi | Phiếu chi tiền mặt | Cash Disbursement | `PC1` | `CDTran` | `dmct` |
| GBC / GBN | Giấy báo có / Giấy báo nợ | Bank Credit / Debit Advice | `BC1` / `BN1` | `CBTran` / `CPTran` | `dmct` |
| PKT, phiếu kế toán | Phiếu kế toán tổng hợp | General Voucher | `PK1` | `GLTran` | `dmct` |
| TKHQ | Tờ khai hải quan | Custom Declaration Sheet | `PD3` | `PKTran` | `dmct` |
| ĐNTT, đề nghị TT | Đề nghị chi tiền / thu tiền | Payment Request | `BPC` / `BPT` | `DCTran` / `DTTran` | `dmct` |

## Phân hệ

| Viết tắt | Tiếng Việt | English | Nguồn |
|---|---|---|---|
| GL | Kế toán tổng hợp | General Ledger | `dmphanhe` |
| CA | Kế toán tiền mặt, tiền gửi ngân hàng | Cash Management | `dmphanhe` |
| AR | Kế toán công nợ phải thu | Accounts Receivable | `dmphanhe` |
| AP | Kế toán công nợ phải trả | Accounts Payable | `dmphanhe` |
| SO | Quản lý bán hàng | Sales Management | `dmphanhe` |
| PO | Quản lý mua hàng | Purchasing | `dmphanhe` |
| IN | Quản lý hàng tồn kho | Inventory Management | `dmphanhe` |
| CO | Giá thành sản phẩm | Costing | `dmphanhe` |
| FA | Quản lý tài sản cố định | Fixed Assets Management | `dmphanhe` |
| IM | Quản lý công cụ dụng cụ | Tools & Supplies Management | `dmphanhe` |
| TR | Báo cáo thuế | Tax Reports | `dmphanhe` |
| TX | Thuế thu nhập cá nhân | Personal Income Tax | `dmphanhe` |
| CR | Hoạch định công suất | Capacity Requirements Planning | `dmphanhe` |
| SF | Quản lý phân xưởng sản xuất | Shop Floor Control | `dmphanhe` |
| CF | Hợp nhất báo cáo tài chính | Consolidated Financial Statements | `dmphanhe` |
| MR | HĐSX/NVL (kế hoạch sản xuất & nhu cầu vật tư) | MPS/MRP | `dmphanhe` |
| BK / FM / SM / DN / RP | Lưu trữ / Định dạng / Hệ thống / Công ty / Báo cáo | Backup / Format / System / Company / Report | `dmphanhe` |

`AP` và `AR` là **phải trả** và **phải thu** — đảo hai cái này là sai nghiệp vụ nặng.
Mẹo nhớ: *A**R*** = **R**eceivable = thu về.

## Đối tượng dữ liệu chủ

| Viết tắt | Tiếng Việt | English | Bảng | Nguồn |
|---|---|---|---|---|
| VT | Vật tư, hàng hóa | Item / Material | `dmvt` | `naming.md` |
| KH | Khách hàng | Customer | `dmkh` | `naming.md` |
| NCC | Nhà cung cấp | Supplier / Vendor | `dmkh` (cùng bảng đối tượng) | nghiệp vụ |
| TK | Tài khoản kế toán | Account | `dmtk` | `naming.md` |
| ĐVT | Đơn vị tính | Unit of Measure | `dmdvt` | `naming.md` |
| NT | Ngoại tệ | Foreign Currency | `dmnt` | `naming.md` |
| BP | Bộ phận | Department | `dmbp` | `naming.md` |
| TSCĐ, TS | Tài sản cố định | Fixed Asset | `DMTS` | `dmct` (TS1) |
| CCDC, CC | Công cụ dụng cụ | Tool & Supply | `DMCC` | `dmct` (CC1/CC2) |
| NVL | Nguyên vật liệu | Raw Material | — | nghiệp vụ |
| TP / BTP | Thành phẩm / Bán thành phẩm | Finished / Semi-finished Goods | — | nghiệp vụ |
| VV | Vụ việc (công trình, dự án) | Job / Project | — | `dmct.post_vv` |
| PX | Phân xưởng | Workshop / Shop floor | — | phân hệ SF |

## Khái niệm & báo cáo

| Viết tắt | Tiếng Việt | English | Nguồn |
|---|---|---|---|
| GTGT, VAT | Giá trị gia tăng | Value Added Tax | `dmct` (T02/T03) |
| HĐĐT | Hóa đơn điện tử | E-invoice | nghiệp vụ |
| NXT | Nhập - Xuất - Tồn | Receipt - Issue - Balance | nghiệp vụ |
| TNCN | Thuế thu nhập cá nhân | Personal Income Tax | `dmphanhe` (TX) |
| TNDN | Thuế thu nhập doanh nghiệp | Corporate Income Tax | nghiệp vụ |
| CĐKT | Cân đối kế toán | Balance Sheet | nghiệp vụ |
| KQKD | Kết quả kinh doanh | Income Statement | nghiệp vụ |
| LCTT | Lưu chuyển tiền tệ | Cash Flow Statement | `dmct` (DC2) |
| TSCĐ khấu hao | Bút toán phân bổ khấu hao | Depreciation Posting | `dmct` (PK5) |
| Kết chuyển | Bút toán kết chuyển tự động | Auto-Posting Entry | `dmct` (PK3) |
| Tỷ giá ghi sổ | Chênh lệch tỷ giá ghi sổ | Book Exchange Rate Difference | `dmct` (PK8/JK8/JK9) |

## Khái niệm riêng của Fast (không phải kế toán chung)

| Từ | Nghĩa trong Fast | Nguồn |
|---|---|---|
| **SP** | **"sản phẩm"** — mở đầu phần số hiệu phiên bản. **Không** phải *Service Pack*. Cách đọc số ở mục riêng cuối trang. | `nbdmda.ma_pbsp` |
| **FBO / FBI** | Hai dòng sản phẩm. Program path của khách luôn nằm dưới một trong hai. | `erp-doctrine` |
| **program** | Một bản cài của một khách hàng — thư mục chứa `Controllers\`, `Web.config`. Đơn vị customize. | `erp-doctrine` |
| **controller** | Một màn hình, khai bằng XML. Định danh bằng `sysid`. | `erp-controller-reference` |
| **`.f` / `.xml`** | `.f` là bản chuẩn, `.xml` cùng tên cạnh nó là bản customize được ưu tiên. | `erp-xml-pairing` |
| **entity** | Một đơn vị/công ty trong cùng một program. Program nhiều entity thì mỗi entity một db app. | `query_sql` |
| **syscode** | Mã chứng từ 3 ký tự trong `wcommand`, khớp `dmct.ma_ct`. | `wcommand` |
| **menu_id** | Số hiệu mục menu dạng `04.01.06`. **Neo yếu** — BA gõ tay trên UR, thường không khớp cây menu thật của khách. | `wcommand` |
| **UR** | Yêu cầu của khách hàng, lưu ở `nbphyc` trong DB QLDA nội bộ. | `pm-doctrine` |
| **post_*** | Cờ trong `dmct` cho biết chứng từ có ghi sang sổ nào: `post_vv` vụ việc, `post_sp` sản phẩm, `post_bp` bộ phận, `post_hd` hợp đồng, `post_ku` khế ước, `post_phi` phí, `post_lsx` **lệnh sản xuất**. | `dmct` |
| **ct_nxt** | Cờ trong `dmct`: `0` không đụng kho, `1` nhập kho, `2` xuất kho. | `dmct` |

## Cạm bẫy dịch

- **"Phiếu xuất kho"** có **hai** chứng từ: `PXA` (chứng từ) và `PXH` (**thực tế**). Hỏi lại
  khách đang nói cái nào trước khi sửa.
- **"Quotation"** dịch ngược ra hai chỗ: `SQ1` báo giá **cho khách** (SO) và `PQ2` báo giá
  **của nhà cung cấp** (PO).
- **"Lệnh sản xuất" (`SX1`) ≠ "Yêu cầu sản xuất" (`SF2`)** — khác phân hệ, khác bảng.
- **"Hóa đơn"** trong tiếng Việt gộp cả hóa đơn tài chính (`HDA`, `HD1`) lẫn hóa đơn mua vào
  (`PNA`, `PN1`). Xác định chiều thu/chi trước.
- **`ma_ct` là 3 ký tự `char`** — so sánh trong SQL phải `RTRIM` hoặc dùng đúng độ dài, nếu
  không sẽ trượt.

## Đọc mã phiên bản sản phẩm (`nbdmda.ma_pbsp`)

Mã dạng `FBOR2SP2422` không phải một chuỗi liền — nó gồm **bốn đoạn ghép lại**:

    FBO      R2        SP         2422
    │        │         │          └── số hiệu phiên bản
    │        │         └───────────── "sản phẩm"
    │        └─────────────────────── thiết kế vòng 2 (tuỳ chọn)
    └──────────────────────────────── dòng sản phẩm

| Đoạn | Giá trị gặp thật | Nghĩa |
|---|---|---|
| Dòng sản phẩm | `FBO` · `FBI` | bắt buộc, luôn đứng đầu |
| Phân hệ thêm | `HRM` | tuỳ chọn — `FBOHRMSP228`, `FBIHRMSP2422` |
| Vòng thiết kế | `R2` | tuỳ chọn — *thiết kế vòng 2*. Không có `R2` là bản đời sau |
| `SP` | luôn có | viết tắt của **"sản phẩm"** |
| Số hiệu | 2–5 chữ số, đôi khi có dấu chấm | xem quy tắc dưới |

### Quy tắc số: mỗi chữ số là MỘT thành phần, đệm `0` cho đủ bốn

| Mã | Đọc là |
|---|---|
| `SP24` | **2.4.0.0** |
| `SP242` | **2.4.2.0** |
| `SP2422` | **2.4.2.2** |
| `SP224` | **2.2.4.0** |
| `SP10` | **1.0.0.0** |

Nghĩa là `SP24` **mới hơn** `SP224` (2.4 > 2.2), dù nhìn ít chữ số hơn. Đây là chỗ dễ đảo
ngược nhất khi so hai khách.

### 22 mã gặp thật

Đo trên `nbdmda`, **55 dự án của một lập trình viên** — không phải toàn bộ hệ thống, nên danh
sách này là mẫu, không phải bảng đầy đủ:

`FBISP23` · `FBOSP23` · `FBISP24` · `FBIHRMSP242` · `FBISP2421` · `FBIHRMSP2421` ·
`FBISP2422` · `FBIHRMSP2422` · `FBOSP226` · `FBOSP2261` · `FBOHRMSP2261` · `FBOSP2263` ·
`FBOSP2264` · `FBOHRMSP228` · `FBOSP229` · `FBOSP22621` · `FBOR2SP11` ·
`FBOR2SP17` · `FBOR2SP20.1` · `FBOR2SP223` · `FBOR2SP224` · `FBOR2SP225.5`

Mọi mã có `R2` đều thuộc nhóm số thấp (1.1 → 2.2.5.5); nhóm 2.4 không có `R2` nào.

### Ba dạng KHÔNG khớp quy tắc bốn thành phần — chưa chốt

| Mã | Vấn đề |
|---|---|
| `FBOSP22621` | **5 chữ số**, trong khi quy tắc chỉ cho bốn thành phần. Là `2.2.6.21` hay `2.2.6.2` + bản vá `1`? |
| `FBOR2SP20.1` · `FBOR2SP225.5` | có **dấu chấm thật** trong mã. Đường dẫn của FABICO ghi `R2SP2255` (không chấm) trong khi `ma_pbsp` ghi `FBOR2SP225.5` |
| Tên dự án ghi tay | VITRAC mang `ma_pbsp = FBOR2SP224` nhưng `ten_da` ghi **"(SP22.4)"** — người viết đọc hai chữ số đầu thành major `22`, ngược với quy tắc mỗi-chữ-số-một-thành-phần |

Ba dạng này **chưa được xác nhận**. Gặp thì hỏi lại thay vì tự quy đổi — nhất là khi việc đang
làm phụ thuộc vào "khách nào mới hơn".

### Bẫy

- **`ma_pbsp` và đường dẫn program có thể lệch nhau.** BELGACAM khai `FBOHRMSP2261` nhưng
  program nằm ở `CustomerPro\FBI\BELGACAM\SP2261` — mã nói FBO, đường dẫn nói FBI. AMERICAN
  khai `FBIHRMSP2422`, đường dẫn `FBI\AMERICAN\FBISP2422` (không có `HRM`). Lấy dòng sản phẩm
  theo **đường dẫn thật**, không theo mã.
- **Một mã SP phục vụ nhiều khách.** `FBOSP2264` có 7 dự án, `FBOSP22621` có 6 (đều là BCONS).
  Sửa theo SP không có nghĩa là sửa cho một khách — xem rule `erp-program-scope`.
- `SP` trong ngữ cảnh khác vẫn có thể là **sản phẩm** theo nghĩa hàng hoá (`ma_sp`, `post_sp`
  trong `dmct`). Đọc theo ngữ cảnh: đứng trước chữ số trong `ma_pbsp` thì là phiên bản.
