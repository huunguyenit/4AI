# `Options\Options.xml` — định dạng nhập/hiển thị cấp program

`App_Data\Controllers\Options\Options.xml` khai **mọi mặt nạ định dạng** mà controller dùng
lại. Một field trong XML không tự viết mặt nạ; nó trỏ tới một tên khai ở đây.

- Namespace: `urn:schemas-fast-com:data-options`
- Schema: `Options.xsd` **cùng thư mục** — đọc nó khi nghi ngờ cú pháp, đừng đoán.
- Encoding thực tế: **UTF-8 có BOM, newline CRLF**. Ghi lại phải giữ nguyên
  (xem `erp-xml-encoding`).
- Không có cặp `.f`/`.xml` — file này là cấu hình cấp program, **mỗi program một bản**.

## Cấu trúc (theo `Options.xsd`)

```xml
<options xmlns="urn:schemas-fast-com:data-options">
  <variants>
    <var name="quantityInputFormat" type="String" value="# ### ### ##0.00" />
  </variants>
</options>
```

| Nút / thuộc tính | Bắt buộc | Ý nghĩa |
|---|---|---|
| `options` → `variants` | có, đúng 1 | gốc file |
| `var` | ≥1, không giới hạn trên | một khai báo |
| `var/@name` | **bắt buộc** | tên gọi. Khai `xs:key` trong xsd ⇒ **không được trùng** trong cùng file |
| `var/@type` | **bắt buộc** | `String` \| `Numeric` \| `DateTime` \| `Variant` — chỉ bốn giá trị này |
| `var/@value` | tuỳ chọn | giá trị |
| `var/@description` | tuỳ chọn | mô tả, tiếng Anh trong bản chuẩn |
| `var/header/@v`, `@e` | tuỳ chọn | nhãn tiếng Việt / tiếng Anh |
| `var/expresion/@value`, `@operator`, `@reference` | tuỳ chọn, lặp | biểu thức điều kiện thay cho `value` tĩnh |

`header` và `expresion` **phải đứng theo thứ tự đó** (`xs:sequence`) khi cả hai cùng có.

## Controller tham chiếu thế nào

**Cú pháp: `@<name>`, và chỉ trong thuộc tính `dataFormatString`.**

```xml
<field name="so_luong" type="Decimal" dataFormatString="@quantityInputFormat" clientDefault="0" width="80">
  <header v="Số lượng" e="Quantity"></header>
  <items style="Numeric"/>
</field>
```
— `Grid\APDetail.f:36`

Đã quét `Grid`, `Structure`, `Filter`, `List`, `Lookup`: **không có thuộc tính nào khác nhận
`@<name>`**. (`xpath="@name"` trong vài file là XPath, không liên quan.)

Ba thứ đi kèm nhau, thiếu một là hỏng:
- `type="Decimal"` — kiểu dữ liệu của field
- `dataFormatString="@..."` — mặt nạ
- `<items style="Numeric"/>` — kiểu điều khiển nhập

## Ký pháp mặt nạ

| Ký tự | Nghĩa |
|---|---|
| `0` | **bắt buộc** hiện chữ số, không có thì hiện `0` |
| `#` | chữ số **tuỳ chọn**, không có thì bỏ trống |
| dấu cách | dấu phân nhóm nghìn (Fast dùng **khoảng trắng**, không phải dấu phẩy) |
| `.` | dấu thập phân |
| `X` / `x` | ép hoa / ép thường cho chuỗi |
| `dd/MM/yyyy` | ngày — `MM` hoa là tháng, `mm` thường là phút |

**Quy tắc Input vs View.** Bản View **được sinh ra từ bản Input**, không phải hai giá trị độc
lập. Luật sinh nằm nguyên văn trong cột `xmlformat` của bảng `options`:

    có dấu thập phân   → REPLACE(input, '0.', '#.')
    không có           → REPLACE(input, '0',  '#')

Kiểm lại trên cả ba dạng mặt nạ:

    quantityInputFormat            # ### ### ##0.00      → quantityViewFormat            # ### ### ###.00
    baseCurrencyAmountInputFormat  ### ### ### ### ##0   → baseCurrencyAmountViewFormat  ### ### ### ### ###
    HourInputFormat                #000.00               → HourViewFormat                #00#.00

Nghĩa là: **Input giữ số 0 cho người gõ nhìn thấy; View đổi nó thành `#` nên giá trị 0 hiện
trống, báo cáo đỡ rác.** `HourFormat` trông lạ mắt nhưng vẫn đúng luật.

Nguồn của bản Input là bảng `options` phân hệ FM — xem `{REFDIR}/options-table.md`.

## 29 mặt nạ định dạng

Giá trị lấy từ một chương trình FBI SP2422. Cột "Dùng" đếm số lần xuất hiện trong
`Grid` + `Structure` + `Filter` + `List` + `Lookup` của chính chương trình đó — **không**
tính `Include`, `Dir`, `Report`, nên là cận dưới.

| name | value | Dùng | Dùng cho |
|---|---|---|---|
| `datetimeFormat` | `dd/MM/yyyy` | 3394 | mọi field ngày |
| `upperCaseFormat` | `X` | 1363 | field mã (`ma_vt`, `ma_kh`, `so_ct`) — ép hoa khi gõ |
| `lowercaseFormat` | `x` | **0** | — khai nhưng không controller nào dùng |
| `quantityInputFormat` | `# ### ### ##0.00` | 493 | số lượng, khi nhập |
| `quantityViewFormat` | `# ### ### ###.00` | 1142 | số lượng, khi xem |
| `exchangeRateInputFormat` | `### ### ### ##0.00` | 60 | tỷ giá, khi nhập |
| `exchangeRateViewFormat` | `### ### ### ###.00` | 206 | tỷ giá, khi xem |
| `baseCurrencyAmountInputFormat` | `### ### ### ### ##0` | 351 | tiền VND — **không có phần thập phân** |
| `baseCurrencyAmountViewFormat` | `### ### ### ### ###` | 1854 | tiền VND, khi xem |
| `baseCurrencyPriceInputFormat` | `### ### ### ##0` | 111 | đơn giá VND |
| `baseCurrencyPriceViewFormat` | `### ### ### ###` | 207 | đơn giá VND, khi xem |
| `foreignCurrencyAmountInputFormat` | `# ### ### ### ##0.00` | 581 | tiền ngoại tệ — **có 2 số lẻ** |
| `foreignCurrencyAmountViewFormat` | `# ### ### ### ###.00` | 2221 | tiền ngoại tệ, khi xem |
| `foreignCurrencyPriceInputFormat` | `### ### ### ##0.00` | 191 | đơn giá ngoại tệ |
| `foreignCurrencyPriceViewFormat` | `### ### ### ###.00` | 365 | đơn giá ngoại tệ, khi xem |
| `generalCurrencyAmountInputFormat` | `### ### ### ### ##0` | 10 | tiền "chung" |
| `generalCurrencyAmountViewFormat` | `### ### ### ### ###` | 38 | tiền "chung", khi xem |
| `generalCurrencyPriceInputFormat` | `### ### ### ##0` | **0** | — khai nhưng không dùng |
| `generalCurrencyPriceViewFormat` | `### ### ### ###` | 2 | đơn giá "chung" |
| `markInputFormat` | `# ### ##0.00` | 11 | điểm / hệ số nhỏ |
| `markViewFormat` | `# ### ###.00` | 20 | như trên, khi xem |
| `analysisInputFormat` | `## ### ### ### ##0.00` | 26 | số phân tích, dải rộng nhất |
| `analysisViewFormat` | `## ### ### ### ###.00` | 2 | như trên, khi xem |
| `coefficientInputFormat` | `## ### ### ##0.00` | 1 | hệ số |
| `coefficientViewFormat` | `## ### ### ###.00` | 1 | như trên, khi xem |
| `CapacityNumberInputFormat` | `### ##0.00` | 7 | công suất (phân hệ CR) |
| `CapacityNumberViewFormat` | `### ###.00` | 23 | như trên, khi xem |
| `HourInputFormat` | `#000.00` | 17 | số giờ |
| `HourViewFormat` | `#00#.00` | 12 | như trên, khi xem |

**Tiền VND không có số lẻ, tiền ngoại tệ có 2 số lẻ.** Đây là khác biệt cố ý giữa
`baseCurrency*` và `foreignCurrency*`. Gán nhầm mặt nạ cho một field `tien_nt` là mất phần
thập phân của nguyên tệ — sai số lặng lẽ, báo cáo mới lòi ra.

Tên chữ hoa `CapacityNumber*` và `Hour*` phá quy ước camelCase của 27 cái còn lại. Đó là dữ
liệu thật; tham chiếu phải gõ đúng hoa/thường.

## 12 mã số giới hạn độ dài

Nhóm thứ hai: `type="Numeric"`, `name` là **số**, `value` là độ dài tối đa của một loại field.

| name | value | description (nguyên văn) |
|---|---|---|
| `100` | 016 | The maximum length of the voucher number field |
| `101` | 016 | The maximum length of the account number field |
| `102` | 016 | The maximum length of the customer identification field |
| `103` | 016 | The maximum length of the item number field |
| `104` | 016 | The maximum length of the site code field |
| `105` | 016 | The maximum length of the customer group field |
| `106` | 128 | The maximum length of the customer name field |
| `107` | 256 | The maximum length of the address field |
| `108` | 018 | The maximum length of the tax code field |
| `109` | 016 | The maximum length of the MO number field |
| `110` | 128 | The maximum length of the document number field |
| `111` | 018 | The maximum length of the voucher number field with region |

**Nhóm này KHÔNG được tham chiếu bằng `@100` từ controller** — đã quét, không có chỗ nào.
Runtime đọc thẳng theo mã số. Muốn nới độ dài một loại mã thì sửa ở đây, không sửa ở controller.

`109` = độ dài số **lệnh sản xuất** (MO number → `SX1`/`MOTran`, xem `fbo-glossary-reference`).

## Khác nhau giữa các program

Đã so 4 chương trình (FBI SP2422, FBI SP2421, FBI SP24, FBO SP2264):

- **29 mặt nạ định dạng: tên và giá trị giống hệt nhau** ở cả bốn.
- **Nhóm mã số thì không.** FBO SP2264 có thêm `112` = *"The maximum length of the form
  voucher number field"*, và `111` ở đó là `014` trong khi FBI SP2422 là `018`.

Hệ quả: **không copy Options.xml từ khách này sang khách khác**, và khi trả lời "độ dài tối đa
của trường X là bao nhiêu" thì phải đọc file của **đúng** program đang hỏi.

## File cùng schema

`Round.xml` (cùng thư mục) dùng **y hệt** namespace và `Options.xsd`, nhưng thay `@value`
tĩnh bằng nút `<expresion>`:

```xml
<var name="roundExchangeRate" type="Numeric" description="Làm tròn trường tỷ giá">
  <expresion operator="&gt;" reference="10" value="10"/>
</var>
```

Nghĩa là schema `data-options` là **khuôn dùng chung** cho nhiều file cấu hình, không riêng
`Options.xml`. Gặp một file lạ khai `xmlns="urn:schemas-fast-com:data-options"` thì đọc nó
bằng đúng bảng cấu trúc ở trên.

## Bẫy

- **Tham chiếu treo.** `Filter\zcSyncSaMoPN1Filter.f:60` dùng
  `dataFormatString="@exchangeRateFormat"` — **không có `var` nào tên đó** trong `Options.xml`.
  Field đó `hidden="true"` nên không ai thấy hỏng. Trước khi thêm `@<name>` mới, kiểm tên có
  thật trong `Options.xml` chưa; và đừng lấy file này làm mẫu.
- **`Input` vs `View` không hoán đổi được.** Đặt mặt nạ View lên ô nhập thì số 0 biến mất khi
  người dùng đang gõ.
- **Đừng sửa tay các mặt nạ số ở file này.** Chúng được chiếu ra từ bảng `options` phân hệ FM
  qua cột `xmlformat`; sửa file là sửa cái ngọn. Trên chương trình đã đo, ba biến
  (`CapacityNumberInputFormat`, `markInputFormat`, `HourInputFormat`) **đang lệch** với giá trị
  trong bảng — chi tiết và hậu quả ở `{REFDIR}/options-table.md`.
- **`name` là khoá** (`xs:key`): khai trùng tên thì file không hợp lệ với `Options.xsd`, và
  lỗi hiện lúc chạy chứ không lúc sửa.
- **`type` chỉ nhận 4 giá trị**: `String`, `Numeric`, `DateTime`, `Variant`. Gõ `Decimal`,
  `Int` hay `Number` là sai schema.
- **BOM và CRLF.** Sửa bằng editor tự ý normalize sang UTF-8 LF là đổi file ngoài chủ ý.
- Sửa `Options.xml` là **thay đổi toàn program** — mọi controller dùng mặt nạ đó đổi theo.
  Cân nhắc như sửa một file trong `Include\`, không như sửa một màn hình.
