# Bảng `options` — tùy chọn nghiệp vụ

`Options.xml` chỉ lo **cách hiển thị**. Câu hỏi *"phần mềm cư xử thế nào"* — tài khoản công nợ
là những tài khoản nào, có tính giá thành theo lệnh sản xuất không, mã vật tư sinh tự động
theo mẫu gì — nằm ở **bảng `options` trong db app**, không nằm trong file nào.

Đo trên một chương trình FBI SP2422: **512 dòng, trải 17 phân hệ**.

## Tra cứu: chỉ bằng `name`

`name` **duy nhất trên toàn bảng** (512/512 khác nhau) — nên mọi chỗ trong FBO đều tra bằng
đúng một khuôn, không cần `ma_phan_he`:

```sql
declare @currency varchar(8)
select @currency = rtrim(val) from options where name = 'm_ma_nt0'
```
— `Query\PurchasingInformation.xml`, và hàng chục chỗ khác

Dạng cờ bật/tắt:

```sql
case when exists(select 1 from options where name = 'm_xvalid_amt' and val = '1') then ... end
```
— `Include\XML\WhenVoucherInit.xml`

**Luôn `rtrim(val)`.** Đây là thói quen thống nhất trong toàn bộ code FBO; đừng bỏ.

`stt` **không** duy nhất trong một phân hệ (phân hệ GL có ba dòng `stt = 002`). Đừng dùng
`(ma_phan_he, stt)` làm khoá.

## Cột

| Cột | Kiểu | Nghĩa |
|---|---|---|
| `ma_phan_he` | char(2) | phân hệ, khớp `dmphanhe` |
| `stt` | char(3) | thứ tự hiển thị trong phân hệ — **không duy nhất** |
| `name` | char(24) | **khoá tra cứu thật**, duy nhất toàn bảng |
| `type` | char(1) | `C` chuỗi · `N` số · `D` ngày |
| `descript` / `descript2` | nvarchar(512) | mô tả tiếng Việt / tiếng Anh |
| `val` | nvarchar(512) | **giá trị đang dùng** |
| `defaul` | nvarchar(512) | giá trị Fast giao ban đầu |
| `attribute` | tinyint | `0` hoặc `1` — xem mục Chưa xác định |
| `sysvar` | tinyint | `1` = biến hệ thống (41 dòng), `0` = tham số nghiệp vụ |
| `inputmask` | nvarchar(512) | mặt nạ nhập cho chính ô này trên màn hình khai báo, dạng `FN^##0.00` |
| `xmlformat` | nvarchar(8000) | **bản đồ chiếu giá trị này ra file XML cấp program** — xem mục dưới |
| `roundscript` | nvarchar(8000) | biểu thức SQL suy số chữ số thập phân từ `val` |
| `irregular` | nvarchar(256) | ký tự bị loại khi nhập (toàn bảng đều là `'()`) |
| `edition` / `wedition` | char(1) | phiên bản sản phẩm áp dụng |

`ma_td1..3`, `sl_td1..3`, `ngay_td1..3`, `gc_td1..3`, `s1..s9` là trường tự do/dự phòng —
xem `erp-glossary-reference` → `naming.md`.

## Phân bố theo phân hệ

| Phân hệ | Số tùy chọn | | Phân hệ | Số tùy chọn |
|---|---|---|---|---|
| GL — kế toán tổng hợp | 169 | | CO — giá thành | 14 |
| SM — hệ thống | 60 | | CF — hợp nhất | 12 |
| IN — tồn kho | 59 | | MR — MPS/MRP | 9 |
| DN — công ty | 43 | | FA — tài sản cố định | 8 |
| RP — báo cáo | 42 | | BK — lưu trữ | 7 |
| FM — định dạng | 36 | | SF — phân xưởng | 6 |
| TX — thuế TNCN | 34 | | CR, FX, GE, AR | 4, 4, 3, 2 |

**Hơn một phần ba nằm ở GL.** Câu hỏi "phần mềm hạch toán thế nào" gần như luôn tra ở GL trước.

## Họ tên gọi

| Tiền tố | Số | Quan sát được |
|---|---|---|
| `m_` | 348 | tham số nghiệp vụ chung — `m_tk_cn_pth` (ds tk công nợ phải thu), `m_ma_vt_td` (mẫu sinh mã vật tư), `m_ma_nt0` (ngoại tệ hạch toán) |
| `r_` | 79 | thông tin in trên báo cáo — `r_so_qd_cdkt`, `r_ngay_qd_cdkt` |
| `t_` | 35 | tỷ lệ phần trăm — `t_tl_bhxh`, `t_tl_bhyt`, `t_tl_gt` |
| `c_` | 15 | tuỳ chọn mẫu in / hiển thị — `c_006` chiết khấu trên mẫu in |
| `x_` | 8 | bật/tắt một chiều tính giá thành — `x_dt_lsx` (theo lệnh sản xuất), `x_dt_sp`, `x_dt_bp` |
| `l_` | 6 | hỗn hợp: có cái là giới hạn (`l_export_input_invoice`), có cái không (`l_tax_input_invoice`) — **đừng suy theo tiền tố, đọc `descript`** |
| `pos_` | 5 | bán lẻ / phiếu quà tặng |
| `transfer_` | 4 | sao chép số liệu giữa đơn vị |
| `dt_` | 3 | kế hoạch dòng tiền |

## Khách đã chỉnh những gì

`val` khác `defaul` nghĩa là **có người đổi so với bản Fast giao**. Đây là cách nhanh nhất để
thấy một chương trình đã được cấu hình lệch chuẩn ở đâu:

```sql
select ma_phan_he, name, descript, defaul, val
from options
where rtrim(val) <> rtrim(defaul)
order by ma_phan_he, stt
```

Trên chương trình đã đo: **48/512 dòng lệch mặc định.** Chạy câu này trước khi kết luận
"phần mềm chuẩn phải chạy thế này" — rất có thể khách đã bật một tùy chọn mà bạn không biết.

## Quan hệ với `Options.xml` — đọc kỹ chỗ này

**Bảng `options` phân hệ FM là nơi khai; `Options.xml` là bản chiếu ra.** Cột `xmlformat` chứa
bản đồ chiếu, nguyên văn:

```
options.name = 'm_ip_sl'   descript = "Định dạng trường số lượng"   val = "# ### ### ##0.00"

xmlformat =
  Options{quantityInputFormat:%s}
         {quantityViewFormat:<CASE CHARINDEX('.', %s) WHEN 0
                              THEN REPLACE(%s,'0','#')
                              ELSE REPLACE(%s,'0.','#.') END>}
  Report {roundQuantity:<...select ... from options where rtrim(name) = 'm_round_sl'>}
```

Cú pháp: `<TênFile>{<tênVar>:<khuôn>}{<tênVar>:<khuôn>}` — `%s` là `val` của chính dòng đó,
`<...>` là biểu thức SQL cho ra giá trị.

Kiểm chứng đầu-cuối trên chương trình đã đo:

| Nguồn | Giá trị | Đích | Giá trị |
|---|---|---|---|
| `options.m_ip_sl.val` | `# ### ### ##0.00` | `Options.xml` → `quantityInputFormat` | `# ### ### ##0.00` ✓ |
| suy bằng `REPLACE(val,'0.','#.')` | `# ### ### ###.00` | `Options.xml` → `quantityViewFormat` | `# ### ### ###.00` ✓ |
| `options.m_round_sl.val` | `2` | `Report.xml` → `roundQuantity` | `<header v="2" e="2"/>` ✓ |

Đây cũng là **luật sinh bản View** một cách chính thức, không phải suy đoán: có dấu thập phân
thì thay `0.` → `#.`, không có thì thay mọi `0` → `#`.

### Ba tùy chọn định dạng đang LỆCH giữa bảng và file

Đo trên chương trình FBI SP2422 nói trên:

| `options.name` | `val` trong bảng | Biến tương ứng trong `Options.xml` | Giá trị trong file |
|---|---|---|---|
| `m_ip_cs` | `### ### ### ##0.00` | `CapacityNumberInputFormat` | `### ##0.00` |
| `m_ip_diem` | `######0.00` | `markInputFormat` | `# ### ##0.00` |
| `m_ip_gio` | `0` | `HourInputFormat` | `#000.00` |

Chín cái còn lại khớp. Nghĩa là **hai nguồn có thể trôi khỏi nhau**, và hậu quả không đồng đều:

- **Lưới và form dùng file** — controller viết `dataFormatString="@CapacityNumberInputFormat"`.
- **SQL trong Include/Message dùng bảng** — `select rtrim(val) from options where name = 'm_ip_sl'`.

Lệch ⇒ ô trên lưới hiện một kiểu, thông báo do SQL dựng ra hiện kiểu khác, trên cùng một con số.
Gặp triệu chứng đó thì so hai nguồn trước khi đi tìm lỗi ở chỗ khác.

**Sửa ở đâu:** đổi định dạng nghiệp vụ thì sửa `options.val` (qua màn hình khai báo tùy chọn),
đừng sửa tay `Options.xml` — sửa file là sửa cái ngọn, và lần chiếu lại sẽ ghi đè.

## Ví dụ mẫu — một tùy chọn đổi cả bảng phải đọc

`m_instock_split` (phân hệ IN — *"Tách tồn kho sổ sách và thực tế"*, `val` mặc định `1`) là ca
rõ nhất cho thấy vì sao phải tra bảng này **trước khi** chọn bảng để `SELECT`:

| `m_instock_split` | Sổ kho hoá đơn | Sổ kho thực tế |
|---|---|---|
| `1` — tách | `r70$yyyyMM` | `r90$yyyyMM` |
| khác `1` — không tách | `r70$yyyyMM` | **cũng `r70$yyyyMM`** — `r90` rỗng |

Proc báo cáo NXT chuẩn của Fast xử lý đúng như vậy:

```sql
IF @DataType <> 1 OR NOT EXISTS(SELECT 1 FROM options WHERE name = 'm_instock_split' AND val = '1')
```

Vế `OR NOT EXISTS(...)` là nhánh dành cho khách **không** tách sổ: hỏi tồn thực tế vẫn phải lấy
từ `r70`. Viết `FROM r90$…` không kèm điều kiện này thì mọi khách tắt tùy chọn sẽ nhận 0 dòng
mà không có lỗi nào báo ra.

**Bài học tổng quát:** tùy chọn trong bảng này không chỉ đổi cách hiển thị — nó đổi **dữ liệu
nằm ở đâu**. Trước khi khẳng định "nghiệp vụ X đọc bảng Y", tra xem có tùy chọn nào chi phối
không.

### Quy ước tên trong họ `m_instock_*`

Hậu tố **`2` = bản dành cho tồn kho THỰC TẾ**; không hậu tố = sổ sách/hoá đơn:

| Cặp | Ý nghĩa |
|---|---|
| `m_instock_check` / `m_instock_check2` | kiểm tra tồn tức thời — sổ sách / thực tế |
| `m_instock_view` / `m_instock_view2` | hiện tồn tức thời trên màn hình nhập |
| `m_instock_process` / `m_instock_process2` | xử lý khi xuất làm tồn âm |

Đây **khác** nghĩa của hậu tố `2` ở tên cột (`ten_ct2` = bản tiếng Anh — xem
`erp-glossary-reference` → `naming.md`). Cùng một con số, hai quy ước; đọc theo ngữ cảnh.

## Chưa xác định

- **`attribute` nghĩa là gì.** Chỉ nhận `0` (235 dòng) hoặc `1` (277 dòng). Không tương quan
  sạch với `sysvar`, với việc có `inputmask` hay không (`attribute=0` có 116/235 dòng có
  inputmask; `attribute=1` có 202/277). Cần đọc màn hình khai báo tùy chọn hoặc engine mới
  kết luận được — **đừng đoán trong báo cáo**.
- **Ai chạy bước chiếu `xmlformat` ra file, và khi nào.** Chuỗi `xmlformat` không được tham
  chiếu từ bất kỳ controller nào (đã quét toàn bộ `Controllers\`), nên bước này nằm trong
  engine .NET. Bản đồ chiếu và kết quả khớp đã kiểm chứng; **thời điểm chiếu thì chưa**.

## Bẫy

- **Tra bằng `name`, không tra bằng `stt`.** `stt` trùng nhau trong cùng phân hệ.
- **Luôn `rtrim(val)`.** Toàn bộ code FBO làm vậy; bỏ đi là so sánh trượt.
- **`type='N'` không có nghĩa `val` là số sạch** — `val` là `nvarchar`, ép kiểu phải tự làm.
- **Đây là bảng cấu hình của một chương trình khách.** Sửa nó là đổi hành vi toàn hệ thống của
  khách đó, cùng mức rủi ro với sửa `Include\`. Không `UPDATE` trực tiếp trong lúc khảo sát —
  `query_sql` mặc định chặn ghi, giữ nguyên như vậy.
- **Số dòng và giá trị khác nhau giữa các chương trình.** Con số 512 và danh sách 48 dòng lệch
  mặc định ở trên là của **một** chương trình. Trả lời câu hỏi về một khách cụ thể thì phải
  chạy lại trên đúng program đó.
