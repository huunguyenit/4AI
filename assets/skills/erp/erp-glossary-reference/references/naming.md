# Quy tắc đặt tên của Fast

Đọc được quy tắc thì đoán đúng tên bảng/cột trước khi tra, và biết ngay khi một cái tên
**không** theo quy tắc — đó thường là chỗ customize.

Số liệu dưới đây đo trên db app của một chương trình **FBI SP2422**: 14 635 bảng, trong đó
312 bảng `dm*`, 13 bảng `ph*`, 97 bảng `ct*`. Con số bảng lớn như vậy là vì sổ phát sinh
được **phân kỳ theo tháng**, xem mục cuối.

## Bảng

| Tiền tố | Nghĩa | Ví dụ |
|---|---|---|
| `dm` | **danh mục** — dữ liệu chủ, người dùng khai một lần rồi dùng lại | `dmvt` vật tư, `dmkh` khách hàng, `dmtk` tài khoản, `dmct` loại chứng từ, `dmnt` ngoại tệ, `dmdvt` đơn vị tính, `dmbp` bộ phận, `dmphanhe` phân hệ |
| `ph` | **phần header** của một chứng từ — mỗi dòng là một chứng từ. Xem cảnh báo "tên logic" ngay dưới | `phsx` lệnh sản xuất, `phdm` cấu trúc NVL |
| `ct` | **chi tiết** chứng từ — nhiều dòng cho một header | `ctsx`, `ctdm` |
| `m` / `d` / `i` / `c` + số + `$yyyyMM` | bốn bảng vật lý của **một chứng từ có phân kỳ** | `m81$202601`, `d81$202601`, `i81$202601`, `c81$000000` |
| `cttt` | sổ **thanh toán** (công nợ) | `CTTT20` phải thu, `CTTT30` phải trả |
| `ctgt` | sổ thuế **giá trị gia tăng** | `CTGT20` đầu ra, `CTGT30` đầu vào |
| `ctcp` | sổ **chi phí** | `CTCP20`, `CTCP30` |
| `r00$yyyyMM` | **sổ cái** — mọi bút toán cuối cùng đổ về đây | |
| `r70$yyyyMM` / `r90$yyyyMM` | **sổ kho** — một cặp; vai trò từng bảng xem mục dưới | |
| `ct00` / `ct70` / `ct90` | bản **lỗi thời** không phân kỳ của ba sổ trên — xem cảnh báo dưới | |
| `bim` / `bid` | header / chi tiết của nhóm mua hàng nâng cao | `bim10$`, `bid10$` |
| `sys*` | bảng hệ thống ở db `sys` — khai báo màn hình, quyền, menu | `wcommand`, `entity` |
| `<tên>$log` | **nhật ký sửa đổi** của bảng cùng tên | `dmphi$log` |

**Cặp `PHxx` ↔ `CTxx` cùng số là một chứng từ**, khai ở hai cột `dmct.m_phdbf` (header) và
`dmct.m_ctdbf` (chi tiết). Muốn biết chứng từ nào ghi vào bảng nào thì tra `dmct`, đừng đoán
theo số.

### `PH81` là tên LOGIC, không phải tên bảng — đọc kỹ chỗ này

Giá trị trong `m_phdbf`/`m_ctdbf` là di sản thời DBF. Nó **không luôn là tên bảng thật**:

| `m_phdbf` | Dạng | Bảng vật lý | Phân kỳ |
|---|---|---|---|
| `PH81`, `PH31`, `PH11`… (**có số**) | chứng từ phân kỳ | `m81$yyyyMM` header · `d81$yyyyMM` chi tiết · `i81$yyyyMM` tìm kiếm · `c81$000000` truy vấn | theo tháng |
| `CT00` · `CT70` · `CT90` | sổ dùng chung | **`r00$yyyyMM`** sổ cái · **`r70$yyyyMM`** · **`r90$yyyyMM`** sổ kho | theo tháng |
| `PHSX`, `PHDM`, `PHNL`, `PHRT`, `PHHD` (**toàn chữ**) | chứng từ không phân kỳ | đúng tên đó: `phsx`/`ctsx`, `phdm`/`ctdm`… | không |
| `DMTS`, `DMCC` | danh mục có phát sinh | `DMTS`/`CTDMTS`, `DMCC`/`CTDMCC` | không |
| `CTTT29`, `CTGT20`, `CTCP20` (`m_ctdbf` rỗng) | sổ thanh toán / thuế / phí | đúng tên đó | không |

Đã kiểm trên một chương trình FBI SP2422: **bảng `PH81` và `CT81` không tồn tại**; `m81$202601`
và `c81$000000` thì có. Toàn db chỉ có 13 bảng tên `ph*`, đều thuộc nhóm không phân kỳ.
`SELECT ... FROM PH81` sẽ báo lỗi không tìm thấy đối tượng.

Nhóm toàn chữ chỉ tồn tại **nếu phân hệ đó được triển khai cho khách**. `dmct` của chương trình
đã đo có khai `PHT1`, `PHWO`, `PHDC1`, `PHEX` nhưng bảng tương ứng không có, vì khách không dùng
phân hệ TX/SF/CF.

Xác nhận điều này ngay trong controller: `Grid\APDetail.f:21` khai `table="d31$000000"` và
`Grid\APDetail.f:24` khai `<partition table="c31$000000" prime="d31$" inquiry="i31$" .../>` —
trong khi `dmct` của `PN1` ghi `m_phdbf = PH31`, `m_ctdbf = CT31`.

### Hai bảng cùng nghĩa ⇒ LUÔN chọn bản tách kỳ

`ct00`, `ct70`, `ct90` là **bản lỗi thời**. Bảng chính thức là `r00$yyyyMM` (sổ cái),
và cặp sổ kho `r70$yyyyMM` / `r90$yyyyMM`.

Hỏi *"sổ kho là bảng nào"* mà trả lời `ct70` là **sai**; đúng là `r70$yyyyMM`.

Đo trên một chương trình FBI SP2422:

| Bảng | Kiểu | Số lượng | Dữ liệu |
|---|---|---|---|
| `r00$…` · `r70$…` · `r90$…` | phân kỳ theo tháng | **37 bảng mỗi loại** (`$000000` + 36 tháng) | `r00$202608` có 40 dòng |
| `ct00` | một bảng, không phân kỳ | 1 | 40 dòng — **trùng đúng nội dung** `r00$202608` |
| `ct70` · `ct90` | một bảng, không phân kỳ | 1 mỗi cái | **0 dòng** |

Không có SQL nào trong `Controllers\` nhắc tới `ct00`/`ct70`/`ct90`; stored procedure ghép tên
động `'r70$' + @period`.

**Quy tắc chung, không riêng ba bảng này:** hai bảng cùng định nghĩa thì bản **tách kỳ**
(`$yyyyMM`) là bản chính thức, bản không hậu tố là di sản. Chọn bản tách kỳ và nêu rõ kỳ.

#### `r70` là sổ kho HOÁ ĐƠN, `r90` là sổ kho THỰC TẾ

| Bảng | Sổ | Đọc khi |
|---|---|---|
| `r70$yyyyMM` | kho **hoá đơn** (sổ sách) | `@DataType = 2` |
| `r90$yyyyMM` | kho **thực tế** | `@DataType = 1` |

Quy ước `@DataType` trong proc báo cáo: **1 = thực tế, 2 = hoá đơn**.

##### Nhưng `r90` chỉ có dữ liệu khi tùy chọn tách sổ đang bật

`options.m_instock_split` (phân hệ IN — *"Tách tồn kho sổ sách và thực tế"*, mặc định `1`)
quyết định chương trình dùng một sổ hay hai:

| `m_instock_split` | Cách lưu |
|---|---|
| `1` — tách | `r70` giữ hoá đơn, `r90` giữ thực tế |
| khác `1` — **không tách** | **chỉ `r70`**, giữ cả logic hoá đơn lẫn thực tế. `r90` không được dùng. |

Vì vậy proc báo cáo NXT phải đọc **cả hai nhánh**, không chỉ chọn một:

```sql
IF @DataType = 1 BEGIN
    ...' from r90$%Partition a with(nolock)'...      -- thực tế
END
IF @DataType <> 1 OR NOT EXISTS(SELECT 1 FROM options WHERE name = 'm_instock_split' AND val = '1') BEGIN
    ...' from r70$%Partition a with(nolock)'...      -- hoá đơn, HOẶC gộp khi không tách sổ
END
```

Vế `OR NOT EXISTS(...)` chính là chỗ xử lý khách **không** tách sổ: lúc đó hỏi "tồn thực tế"
vẫn phải lấy từ `r70`, vì `r90` rỗng.

**Hệ quả khi viết SQL:** báo cáo tồn kho mà chỉ `FROM r90$…` sẽ trả 0 dòng ở mọi khách tắt
`m_instock_split` — lại là một kiểu sai im lặng. Xét tùy chọn trước, đừng chọn bảng theo trí nhớ.

**Điều đã chắc, không phụ thuộc tùy chọn:** cả `r70` và `r90` đều phân kỳ và đều là bảng chính
thức; `ct70`/`ct90` thì không.

### Bốn bảng của một chứng từ phân kỳ

| Bảng | Chứa |
|---|---|
| `M<nn>$yyyyMM` | thông tin chung (header) |
| `D<nn>$yyyyMM` | thông tin chi tiết |
| `I<nn>$yyyyMM` | thông tin tìm kiếm (*inquiry*) |
| `C<nn>$000000` | bảng giúp truy vấn |

Kèm theo là `m<nn>$000000`, `d<nn>$000000`, `i<nn>$000000` — **bảng khuôn định dạng cấu trúc,
không chứa dữ liệu**. Controller trỏ vào chính khuôn này (`table="d31$000000"`), runtime mới
thay `000000` bằng kỳ thật.

Tạo một loại chứng từ mới thì **bắt buộc tạo index cho tất cả các bảng trên**.

## Cột

Tần suất thật trên toàn db (số lần một tiền tố xuất hiện ở đầu tên cột, mọi bảng):

| Tiền tố | Nghĩa | Số lần | Ví dụ |
|---|---|---|---|
| `ma_` | **mã** — khoá của một danh mục | 108 278 | `ma_vt`, `ma_kh`, `ma_ct`, `ma_nt`, `ma_phan_he`, `ma_kho` |
| `ngay_` | ngày | 35 082 | `ngay_ct`, `ngay_lct` |
| `stt_` | số thứ tự / khoá dòng | 34 106 | `stt_rec` (khoá chứng từ), `stt_rec0` |
| `so_` | số | 33 007 | `so_ct`, `so_seri`, `so_hd` |
| `sl_` | **số lượng** | 17 609 | `sl_nhap`, `sl_xuat` |
| `tk_` | **tài khoản** kế toán | 8 897 | `tk_no`, `tk_co`, `tk_vt` |
| `tien_` | tiền (VND) | 8 636 | `tien_nt`, `tien_thue` |
| `thue_` | thuế | 6 543 | `thue_suat` |
| `gia_` | đơn giá | 6 416 | `gia_nt`, `gia_ban` |
| `loai_` | phân loại | 5 710 | `loai_ct`, `loai_phan_he` |
| `gc_` | **ghi chú** | 11 661 | `gc_td1` |
| `ty_gia` | tỷ giá | | `ty_gia`, `ty_gia_hq` |
| `user_id` | người dùng | 13 709 | `user_id0`, `user_id2` |

Quy tắc suy ra được từ những cặp trên:

- **`ma_<X>` luôn có `dm<X>` đứng sau nó.** `ma_vt` → `dmvt`, `ma_kh` → `dmkh`,
  `ma_nt` → `dmnt`, `ma_ct` → `dmct`. Đây là đường nhanh nhất từ một cột trên màn hình ra
  bảng nguồn lookup. Ngoại lệ có, nhưng ít.
- **Hậu tố `2` = bản thứ hai, thường là tiếng Anh.** `ten_ct` / `ten_ct2`,
  `ten_phan_he` / `ten_phan_he2`, `tieu_de_ct` / `tieu_de_ct2`. Đây là nguồn tên tiếng Anh
  chính thức của Fast — không phải bản dịch của ai đó.
- **Hậu tố `_nt` = "ngoại tệ".** `tien_nt` là số tiền tính theo nguyên tệ, `tien` là quy đổi
  VND. Đây là bẫy kinh điển: sửa `tien` mà quên `tien_nt` thì báo cáo ngoại tệ sai.
- **`0` = lúc tạo, `2` = lúc sửa lần cuối** cho cặp audit: `user_id0`/`user_id2`,
  `datetime0`/`datetime2`. *(Quy ước đọc từ cấu trúc bảng, chưa đối chiếu code ghi.)*
- **`stt_rec` là khoá của một chứng từ**, không phải "số thứ tự dòng". Chi tiết nối về header
  bằng chính `stt_rec`.
- **`_yn` = cờ có/không**, `_td1`/`_td2`/`_td3` = ba trường tự do người dùng tự định nghĩa,
  `s1`…`s9` = trường dự phòng để customize.

## sysid controller

`sysid` là tên controller trong `Controllers\`, cũng là thứ `describe_controller` nhận.

- **Màn hình nhập chứng từ: `<2 chữ cái>Tran`** — `SVTran`, `GLTran`, `ARTran`, `MOTran`,
  `CDTran`. Hai chữ cái là viết tắt tiếng Anh của nghiệp vụ (*SV* = sales voucher,
  *GL* = general ledger, *MO* = manufacturing order, *CD* = cash disbursement).
- **`W*Tran` = chứng từ kho thực tế** — `WHTran`, `WITran`, `WTTran`, `WSTran`, `WKTran`,
  `WQTran`. Chữ `W` là warehouse. Đối trọng của chúng (`IRTran`, `ISTRan`…) là chứng từ
  chứng từ/kế toán.
- **`BI*` = nhóm mua hàng nâng cao** — `BIPOTran`, `BIOATran`, `BIILTran`.
- **Màn hình không phải nhập chứng từ đặt tên PascalCase mô tả**: `InputInvoice`,
  `BookExchangeRate`, `PRApproval`, `CRRoutingMaintenance`.
- **`sysid` KHÔNG suy được từ `ma_ct`.** `HDA` → `SVTran`, `SX1` → `MOTran`, `PXA` → `ISTRan`.
  Muốn có ánh xạ thì tra `wcommand` (db sys) hoặc gọi `resolve_vouchercode` — đừng đoán.
- **Một màn hình phải khai ở CẢ HAI bảng `wcommand` và `command`** trong db sys, và `sysid`
  ở hai bảng **phải giống nhau**. Cột `type` phân loại màn hình: `D` cho danh mục, chuỗi rỗng
  cho báo cáo. Khai một bảng mà quên bảng kia là màn hình không vào được.
- Chữ hoa/thường trong `sysid` **không nhất quán**: `ISTRan`, `S6TRan` (chữ `R` hoa sai vị trí).
  Đây là dữ liệu thật, không phải lỗi gõ của tài liệu này — copy nguyên văn khi tra cứu.

## Phân kỳ theo tháng

Sổ phát sinh không nằm trong một bảng. Chúng bị cắt theo tháng với hậu tố `$yyyyMM`, dạng
`M/D/I/C<XX>$yyyyMM`. Đó là lý do db có hơn 14 000 bảng dù chỉ vài trăm cấu trúc khác nhau.

Hệ quả khi viết SQL: **không SELECT thẳng vào một bảng phát sinh có hậu tố tháng** trừ khi
đã biết chắc kỳ. Chi tiết cấu trúc nằm ở `erp-sql-reference` → `business-tables.md`.

## Khi tên không theo quy tắc

Bảng hay cột không khớp bất kỳ quy tắc nào ở trên là dấu hiệu **customize riêng của khách**.
Ví dụ: cột đuôi `_cust`, bảng tên thuần tiếng Việt không dấu, bảng có tên viết tắt của khách.
Gặp thì đừng suy nghĩa — tra `query_sql { object }` để đọc cấu trúc thật, và kiểm xem controller
nào dùng nó bằng `search_content`.
