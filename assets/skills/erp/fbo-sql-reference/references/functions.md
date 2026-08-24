# Function dùng chung — FBO/FBI SP2422

> **Nguồn:** quét `sys.objects` / `sys.parameters` / `sys.columns` của một chương trình
> FBO chuẩn bản **SP2422** (db `app` và db `sys`) qua MCP `4ai-fbo` → `query_sql`.
>
> **Ý nghĩa cột "Ý nghĩa" suy từ tên + chữ ký + tên tham số, KHÔNG phải từ đọc thân.**
> Nó đủ để chọn đúng đối tượng cần tra; trước khi dựa vào hành vi chính xác thì đọc thân:
> `query_sql { program, db, object: "<tên>" }`.
>
> Chương trình khách có thể thêm/sửa đối tượng riêng — danh mục này là bản CHUẨN, không phải
> bản của khách. Không thấy trong danh mục ≠ không tồn tại ở chương trình đang làm.

Tổng: **221** function (200 ở db `app`, 21 ở db `sys`), tiền tố `ff_`, `Fast*`, `fsd_`, `df_`.

## Quy ước tên

- `ff_<Tên>` — thư viện tiện ích cũ, tên ngắn, tham số kiểu Hungarian (`@c…` chuỗi, `@n…` số, `@d…` ngày, `@str…` danh sách).
- `FastBusiness$<Vùng>$<Việc>$<Đối tượng>` — lớp mới, `$` là dấu phân cấp chứ không phải ký tự đặc biệt; **luôn bọc `[...]` khi gọi** nếu công cụ của bạn hiểu `$` khác.
- Tham số hiện tên `@_0`, `@_1`… nghĩa là hàm được biên dịch không giữ tên gốc — phải đọc thân mới biết thứ tự tham số.

## Danh mục

### Chuỗi & danh sách

Thao tác chuỗi kiểu FoxPro mà FBO mang sang T-SQL. `ff_Inlist` là hàm bị gọi nhiều nhất trong toàn hệ thống — mọi bộ lọc "mã nằm trong danh sách" đều đi qua nó.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$Function$Convert$Unicode` | `@b varchar` | nvarchar | Chuyển chuỗi mã hoá `@b` sang Unicode. | app |
| `FastBusiness$Function$GetWordCount` | `@strString nvarchar, @seperate char` | int | Số từ, phân tách bằng `@seperate`. | app |
| `FastBusiness$Function$GetWordNum` | `@strString nvarchar, @intNum int, @seperate char` | nvarchar | Từ thứ `@intNum`, phân tách bằng `@seperate`. | app |
| `FastBusiness$Function$GetWordNum` | `@strString nvarchar, @intNum int, @seperate char` | nvarchar | Từ thứ `@intNum`, phân tách bằng `@seperate`. | sys |
| `FastBusiness$Function$Message$ConvertToUnsign` | `@Input nvarchar` | varchar | Bỏ dấu tiếng Việt — dùng để tìm kiếm không dấu. | app |
| `FastBusiness$Function$System$GetWordCount` | `@strString nvarchar, @Delimiter char` | int | Số từ, phân tách bằng `@Delimiter`. | app |
| `FastBusiness$Function$System$GetWordNum` | `@strString nvarchar, @intNum int, @Delimiter char` | nvarchar | Từ thứ `@intNum`, phân tách bằng `@Delimiter`. | app |
| `FastBusiness$Function$System$Replace` ⊗ | `@input nvarchar, @find nvarchar, @replace nvarchar, @_3 nvarchar` | nvarchar | Thay chuỗi có kiểm soát (4 tham số) — dùng trong sinh SQL. | app |
| `FastBusiness$Function$System$Split` | `@s nvarchar, @d char` | TABLE (tvf) | Tách chuỗi theo `@d` thành bảng — bản Fast của `ff_SplitString`. | app |
| `FastBusiness$Function$System$Split` | `@s nvarchar, @d char` | TABLE (tvf) | Tách chuỗi theo `@d` thành bảng — bản Fast của `ff_SplitString`. | sys |
| `FastBusiness$MergeList` | `@s1 varchar, @s2 varchar, @d char` | varchar | Gộp hai danh sách bằng dấu `@d`, bỏ trùng. | app |
| `FastBusiness$MergeList` | `@s1 varchar, @s2 varchar, @d char` | varchar | Gộp hai danh sách bằng dấu `@d`, bỏ trùng. | sys |
| `ff_CharIndex` | `@cChar nvarchar, @sString nvarchar` | int | Vị trí xuất hiện đầu tiên của `@cChar` trong `@sString`; 0 nếu không có. | app |
| `ff_ChrTran` | `@cSearchIn nvarchar, @cSearchFor nvarchar, @cReplaceWith nvarchar` | nvarchar | Thay từng ký tự trong `@cSearchFor` bằng ký tự cùng vị trí ở `@cReplaceWith` — port hàm ChrTran của FoxPro. | app |
| `ff_ConvertFont` | `@strConvert nvarchar` | nvarchar | Chuyển chuỗi giữa bảng mã font cũ và Unicode. | app |
| `ff_ConvertUniFont2Char` | `@strConvert nvarchar` | nvarchar | Chuyển Unicode dựng sẵn về ký tự đơn. | app |
| `ff_ExactInlist` | `@cItem varchar, @strList nvarchar` | int | Vị trí của `@cItem` trong danh sách phân tách, so khớp CHÍNH XÁC cả chuỗi; 0 nếu không có. | app |
| `ff_ExactInlist` | `@cItem varchar, @strList nvarchar` | int | Vị trí của `@cItem` trong danh sách phân tách, so khớp CHÍNH XÁC cả chuỗi; 0 nếu không có. | sys |
| `ff_GetWordCount` | `@strString nvarchar` | int | Số từ trong chuỗi (phân tách mặc định). | app |
| `ff_GetWordCount` | `@strString nvarchar` | int | Số từ trong chuỗi (phân tách mặc định). | sys |
| `ff_GetWordCountEx` | `@strString nvarchar` | int | Như `ff_GetWordCount`, quy tắc đếm mở rộng. | app |
| `ff_GetWordIndex` | `@cWord nvarchar, @strWord nvarchar` | int | Vị trí (thứ tự từ) của `@cWord` trong `@strWord`. | sys |
| `ff_GetWordNum` | `@strString nvarchar, @intNum int` | nvarchar | Từ thứ `@intNum` trong chuỗi. | app |
| `ff_GetWordNum` | `@strString nvarchar, @intNum int` | nvarchar | Từ thứ `@intNum` trong chuỗi. | sys |
| `ff_GetWordNumEx` | `@strString nvarchar, @intNum int` | nvarchar | Như `ff_GetWordNum`, quy tắc tách mở rộng. | app |
| `ff_Inlist` | `@cItem nvarchar, @strList nvarchar` | int | Vị trí của `@cItem` trong `@strList`; 0 nếu không có. Dạng dùng nhiều nhất để lọc theo danh sách mã. | app |
| `ff_Inlist2` | `@cItem nvarchar, @strList nvarchar` | int | Như `ff_Inlist` nhưng khác quy tắc tách/so khớp — kiểm thân trước khi thay lẫn nhau. | app |
| `ff_InlistN` | `@nItem numeric, @strList nvarchar` | int | Bản `ff_Inlist` cho item số (`@nItem numeric`). | app |
| `ff_Inlists` | `@cItem1 nvarchar, @strList1 nvarchar, @cItem2 nvarchar, @strList2 nvarchar` | int | Kiểm hai cặp (item, list) cùng lúc — dùng cho điều kiện lọc đôi. | app |
| `ff_InlistsE` | `@cItem1 nvarchar, @strList1 nvarchar, @cItem2 nvarchar, @strList2 nvarchar, @nE numeric` | int | Như `ff_Inlists`, thêm tham số `@nE` điều chỉnh cách so khớp. | app |
| `ff_LeftItem` | `@cpItem varchar, @cSeparator varchar` | varchar | Phần bên trái `@cpItem` tính tới `@cSeparator` đầu tiên. | app |
| `ff_Occurs` | `@strString nvarchar, @c char` | int | Số lần ký tự `@c` xuất hiện trong `@strString`. | sys |
| `ff_PadL` | `@cpItem varchar, @nLen tinyint` | varchar | Đệm trái cho đủ `@nLen` ký tự. | app |
| `ff_PadR` | `@cpItem varchar, @nLen tinyint` | varchar | Đệm phải cho đủ `@nLen` ký tự. | app |
| `ff_ReplaceOutsideQuotes` | `@Input nvarchar, @Target nvarchar, @Replace nvarchar` | nvarchar | Thay `@Target` bằng `@Replace` nhưng bỏ qua phần nằm trong dấu nháy — sửa biểu thức/công thức mà không đụng chuỗi hằng. | app |
| `ff_ReplaceWordAt` | `@strString nvarchar, @strWord nvarchar, @intNum int` | nvarchar | Thay từ thứ `@intNum` trong chuỗi bằng `@strWord`. | app |
| `ff_RightItem` | `@cpItem varchar, @cSeparator varchar` | varchar | Phần bên phải `@cpItem` tính từ `@cSeparator`. | app |
| `ff_SplitString` | `@string nvarchar, @delimiter char` | TABLE (tvf) | Tách `@string` theo `@delimiter` thành bảng một cột — dùng để JOIN thay vì `IN (...)` động. | app |
| `ff_TextContent` | `@strP nvarchar, @strC nvarchar` | tinyint | Chuỗi `@strC` có nằm trong `@strP` theo quy tắc phân cấp text không. | app |

### Ngày, kỳ & chu kỳ

Năm tài chính của FBO có thể lệch năm dương lịch, và kỳ (`period`) là khái niệm riêng — đừng thay các hàm này bằng `DATEDIFF`/`YEAR` trần.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$Function$Different$Month` | `@d1 smalldatetime, @d2 smalldatetime` | numeric | Số tháng chênh lệch giữa hai ngày. | app |
| `FastBusiness$Function$Different$Year` | `@d1 smalldatetime, @d2 smalldatetime` | numeric | Số năm chênh lệch giữa hai ngày. | app |
| `FastBusiness$Function$GetArisingDateAndPeriod` ⊗ | `@dateFrom smalldatetime, @dateTo smalldatetime` | TABLE (tvf) | Bảng cặp (ngày, kỳ) phát sinh trong khoảng. | app |
| `FastBusiness$Function$GetBalanceDateAndPeriod` ⊗ | `@date smalldatetime, @type tinyint` | TABLE (tvf) | Bảng cặp (ngày, kỳ) cho số dư. | app |
| `FastBusiness$Function$GetFinancialDate` | `@Period int, @Year int` | smalldatetime | Ngày ứng với kỳ tài chính (`@Period`, `@Year`). | app |
| `ff_BgCycle` | `@pS tinyint, @yS int` | smalldatetime | Ngày đầu chu kỳ `@pS` của năm `@yS`. | app |
| `ff_BgDate` | `@dS datetime` | datetime | Ngày đầu kỳ chứa `@dS`. | app |
| `ff_BgYear` | `@pS tinyint, @yS int` | int | Năm tài chính ứng với chu kỳ `@pS`/`@yS` (năm tài chính có thể lệch năm dương lịch). | app |
| `ff_D2C` | `@dConvert smalldatetime` | char | Ngày → chuỗi ký tự (định dạng khoá dùng trong bảng). | app |
| `ff_GetBOP` | `@nYear numeric, @nPeriod numeric` | char | Ngày đầu kỳ (Begin Of Period) của `@nPeriod`/`@nYear`, trả dạng char. | app |
| `ff_GetBalanceDateAndPeriod` | `@dDate smalldatetime, @nType tinyint` | TABLE (tvf) | Bảng cặp (ngày, kỳ) dùng cho số dư tới `@dDate`, kiểu `@nType`. | app |
| `ff_GetCycles` | `@d datetime` | int | Số hiệu chu kỳ chứa ngày `@d`. | app |
| `ff_GetDateAndPeriod` | `@dFrom smalldatetime, @dTo smalldatetime` | TABLE (tvf) | Bảng cặp (ngày, kỳ) phát sinh trong khoảng `@dFrom`–`@dTo`. | app |
| `ff_GetDayDepreciation` | `@dFrom datetime, @dTo datetime, @d0 datetime, @d1 datetime, @d2 datetime, @d3 datetime` | int | Số ngày được tính khấu hao trong khoảng `@dFrom`–`@dTo`, có tính các mốc `@d0`–`@d3`. | app |
| `ff_GetDays` | `@d1 smalldatetime, @d2 smalldatetime` | int | Số ngày giữa `@d1` và `@d2`. | app |
| `ff_GetEOP` | `@nYear numeric, @nPeriod numeric` | char | Ngày cuối kỳ (End Of Period) của `@nPeriod`/`@nYear`, trả dạng char. | app |
| `ff_GetEndDateOfCycle` | `@nCycle numeric, @nYear numeric` | datetime | Ngày cuối chu kỳ `@nCycle`/`@nYear`. | app |
| `ff_GetMonths` | `@d1 smalldatetime, @d2 smalldatetime` | int | Số tháng giữa `@d1` và `@d2`. | app |
| `ff_GetQuarter` | `@d smalldatetime` | int | Quý của ngày `@d`. | app |
| `ff_GetStartDate` | `@dS smalldatetime` | char | Ngày bắt đầu ứng với `@dS`, trả dạng char. | app |
| `ff_GetStartDateOfCycle` | `@nCycle numeric, @nYear numeric` | datetime | Ngày đầu chu kỳ `@nCycle`/`@nYear`. | app |
| `ff_GetStartDateOfQuarter` | `@dDate smalldatetime` | smalldatetime | Ngày đầu quý chứa `@dDate`. | app |
| `ff_GetStartDateOfYear` | `@nYear int` | char | Ngày đầu năm tài chính `@nYear`. | app |
| `ff_IsEmptyDate` | `@dType smalldatetime` | tinyint | Ngày có phải giá trị rỗng quy ước của FBO không. | app |

### Số & định dạng

Định dạng số phụ thuộc cấu hình từng user (`config`), nên chuỗi format phải lấy từ hàm chứ không hardcode.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$ConvertToNumberFormatString` | `@prec int, @scale int, @val int, @viewMode char` | nvarchar | Dựng chuỗi mẫu định dạng số từ precision/scale và chế độ hiển thị `@viewMode`. | app |
| `FastBusiness$Function$FormatShortKeyExport` | `@c varchar, @o char` | varchar | Rút gọn khoá `@c` khi xuất dữ liệu, chế độ `@o`. | app |
| `FastBusiness$Function$FormatStringColumn` ⊗ | `@table varchar, @sourceColumn varchar, @targetColumn varchar` | varchar | Định dạng giá trị cột thành chuỗi hiển thị. | app |
| `FastBusiness$Function$FormatStringValue` ⊗ | `@value numeric` | varchar | Định dạng một số thành chuỗi hiển thị. | app |
| `FastBusiness$Function$GetFieldRound` | `@t varchar, @f varchar` | tinyint | Số chữ số làm tròn khai báo cho cột `@f` của bảng `@t`. | app |
| `FastBusiness$Function$NumberFormat` | `@c varchar` | varchar | Chuỗi định dạng số của cột `@c`. | app |
| `FastBusiness$MaxNumericInString` | `@s varchar` | varchar | Cụm số lớn nhất tìm được trong chuỗi. | app |
| `FastBusiness$MaxNumericRegion` | `@str varchar, @b varchar` | varchar | Cụm số lớn nhất trong vùng `@b` của chuỗi — dùng dò số chứng từ lớn nhất đã dùng. | app |
| `FastBusiness$VoucherNumberStruct` | `@str varchar, @b varchar, @c varchar` | varchar | Tách cấu trúc số chứng từ (tiền tố / phần số / hậu tố) theo quy tắc `@b`, `@c`. | app |
| `df_SystemFormatFileSize` | `@n numeric, @sFormat varchar` | varchar | Định dạng kích thước file theo mẫu `@sFormat` (db sys). | sys |
| `ff_Arab2Roman` | `@tNum sql_variant` | varchar | Số Ả Rập → số La Mã. | app |
| `ff_Dec2Seq` | `@nDec bigint` | varchar | Số nguyên → chuỗi seq nén (dùng sinh khoá `stt_rec`). | app |
| `ff_GetDataLength` | `@Code varchar` | int | Độ dài khai báo của mã `@Code` (mã tài khoản, mã vật tư… có độ dài cấu hình được). | app |
| `ff_GetInputmask` | `@val nvarchar, @strString nvarchar, @clan char` | nvarchar | Input mask hiển thị cho giá trị `@val` theo ngôn ngữ `@clan`. | app |
| `ff_GetNumberFormat` | `@nPrec tinyint, @nScale tinyint` | varchar | Chuỗi mẫu định dạng ứng với precision `@nPrec` / scale `@nScale`. | app |
| `ff_IncreaseSeq` | `@sHex varchar` | varchar | Tăng chuỗi seq lên một đơn vị (không cần đổi về số). | app |
| `ff_IsNumeric` | `@expression varchar` | int | Chuỗi có chuyển được sang số không. | app |
| `ff_Max` | `@Value1 numeric, @Value2 numeric` | numeric | Giá trị lớn hơn trong hai số. | app |
| `ff_Min` | `@Value1 numeric, @Value2 numeric` | numeric | Giá trị nhỏ hơn trong hai số. | app |
| `ff_NumberFormat` | `@n numeric, @sFormat varchar` | varchar | Định dạng số theo mẫu `@sFormat`. | app |
| `ff_NumberFormat` | `@n numeric, @sFormat varchar` | varchar | Định dạng số theo mẫu `@sFormat`. | sys |
| `ff_NumberFormatConfig` | `@n numeric, @sFormat varchar, @config varchar` | varchar | Như `ff_NumberFormat` nhưng lấy dấu phân cách từ `@config` của người dùng. | app |
| `ff_NumberFormatConfigReplace` | `@s nvarchar, @config varchar` | nvarchar | Thay chuỗi định dạng số theo `@config` của người dùng. | sys |
| `ff_NumberFormatReplace` | `@str varchar` | varchar | Thay chuỗi định dạng số trong một biểu thức. | app |
| `ff_OprList` | `@cItem varchar, @strList nvarchar` | numeric | Áp phép toán khai trong `@strList` cho `@cItem`, trả kết quả số. | app |
| `ff_Seq2Dec` | `@sHex varchar` | bigint | Chuỗi seq → số nguyên; nghịch đảo của `ff_Dec2Seq`. | app |
| `ff_TryConvertNumber` | `@value nvarchar` | int | Thử chuyển `@value` sang số, trả kết quả/mã lỗi thay vì raise. | app |

### Đọc số thành chữ

Dùng khi in chứng từ. Có bản tiếng Việt và tiếng Anh riêng.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$Function$System$NineNumber2Words` | `@NineNumber nvarchar` | nvarchar | Đọc nhóm 9 chữ số thành chữ. | app |
| `FastBusiness$Function$System$Number2Words$EN` | `@decNumber numeric` | varchar | Đọc số thành chữ tiếng Anh. | app |
| `FastBusiness$Function$System$Number2Words$VI` | `@Number nvarchar` | nvarchar | Đọc số thành chữ tiếng Việt. | app |
| `FastBusiness$Function$System$ReadCurrency` | `@cCurrencyCode char, @mAmount nvarchar, @cLan char` | nvarchar | Đọc số tiền thành chữ theo mã ngoại tệ và ngôn ngữ `@cLan` — dùng in chứng từ. | app |
| `FastBusiness$Function$System$ReadCurrency$EN` | `@cCurrencyCode char, @mAmount money` | varchar | Bản tiếng Anh của `ReadCurrency`. | app |
| `FastBusiness$Function$System$ReadCurrency$VI` | `@cCurrencyCode char, @mAmount nvarchar` | nvarchar | Bản tiếng Việt của `ReadCurrency`. | app |
| `FastBusiness$Function$System$String2GroupThree` | `@String varchar` | TABLE (tvf) | Tách chuỗi số thành các nhóm 3 chữ số. | app |
| `FastBusiness$Function$System$ThreeNumber2Words` | `@ThreeNumber nvarchar` | nvarchar | Đọc nhóm 3 chữ số thành chữ. | app |

### Nghiệp vụ: tỷ giá, thuế, tài khoản, tồn kho

Nhóm này chứa quy tắc nghiệp vụ thật. Viết lại logic tỷ giá hay quan hệ cha–con tài khoản bằng tay là nguồn sai số kinh điển.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$EInvoice$GetPeriod` | `@voucherCode varchar, @key varchar` | varchar | Kỳ (yyyyMM) của chứng từ hoá đơn điện tử theo `@voucherCode` + `@key`. | app |
| `FastBusiness$EInvoice$GetProviderFields` | `@voucherCode varchar, @provider int, @unit varchar, @userID int, @type int, @Extension varchar` | TABLE (tvf) | Bảng khai field/join/result mà nhà cung cấp HĐĐT `@provider` yêu cầu cho loại chứng từ `@voucherCode`. | app |
| `FastBusiness$Function$Current$Stock` | `@Field tinyint, @Item varchar, @Site varchar, @Location varchar, @Lot varchar, @IDNumber varchar, @Rate numeric, @VoucherCode varchar, @Unit varchar, @Action tinyint, @DataType tinyint, @Type varchar` | numeric | Tồn kho hiện thời theo vật tư / kho / vị trí / lô / số hiệu, chọn chỉ tiêu bằng `@Field`. | app |
| `FastBusiness$Function$Einvoice$GetTaxRateName` | `@taxRate float` | nvarchar | Tên thuế suất hiển thị trên hoá đơn điện tử ứng với `@taxRate`. | app |
| `FastBusiness$Function$Report$TaxDepartment` | `@Dept varchar` | TABLE (tvf) | Bảng thông tin cơ quan thuế của bộ phận `@Dept`. | app |
| `ff_AccumulateJob` | `@d smalldatetime` | TABLE (tvf) | Bảng số luỹ kế theo vụ việc tính tới ngày `@d`. | app |
| `ff_BaseCurr` | `@cFC varchar` | tinyint | `@cFC` có phải đồng tiền hạch toán (base currency) không. | app |
| `ff_CoverBookCode` | `@StartCode char, @FormCode numeric` | varchar | Mã quyển/ký hiệu hoá đơn suy từ `@StartCode` và mẫu số `@FormCode`. | app |
| `ff_GetExRate` | `@nRate numeric, @dVoucher smalldatetime, @dPay smalldatetime, @cCR varchar, @nVCType tinyint` | numeric | Tỷ giá áp dụng cho chứng từ: dựa trên tỷ giá nhập `@nRate`, ngày chứng từ, ngày thanh toán, mã ngoại tệ và loại chứng từ. | app |
| `ff_GetExRateWithReverse` | `@nRate numeric, @dVoucher smalldatetime, @dPay smalldatetime, @cCR varchar, @nVCType tinyint, @cIDNumber varchar` | numeric | Như `ff_GetExRate`, có xét chứng từ gốc `@cIDNumber` khi ghi đảo. | app |
| `ff_GetTaxCode2TaxRate` | `@c varchar` | numeric | Thuế suất ứng với mã thuế `@c`. | app |
| `ff_GetTaxCodeExt` | `@c varchar, @t numeric` | varchar | Mã thuế mở rộng ứng với (`@c`, thuế suất `@t`). | app |
| `ff_IsRelationAcct` | `@cpAcct varchar, @cAcct varchar` | bit | `@cAcct` có nằm trong nhánh của tài khoản `@cpAcct` không. | app |
| `ff_IsRelationJob` | `@pJob varchar, @cJob varchar` | bit | `@cJob` có nằm trong nhánh vụ việc `@pJob` không. | app |
| `ff_ParentAccount` | `@cAccount varchar, @nLevel tinyint` | varchar | Tài khoản cha ở cấp `@nLevel` của `@cAccount`. | app |
| `ff_ParentAcct` | `@cAcct varchar` | varchar | Tài khoản cha trực tiếp của `@cAcct`. | app |

### Phân quyền

Mọi câu truy vấn hướng người dùng phải đi qua nhóm này. Bỏ qua = user thấy dữ liệu đơn vị/kho không thuộc quyền.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$Function$APV$Authorize` | `@voucherType varchar, @userID int, @status varchar, @category varchar, @currentDate smalldatetime` | tinyint | Mức duyệt của user cho loại chứng từ `@voucherType` ở trạng thái `@status`, nhóm `@category`, tại `@currentDate`. | app |
| `FastBusiness$Function$APV$PU$Authorize` | `@voucherType varchar, @userID int, @status varchar, @category varchar, @currentDate smalldatetime` | tinyint | Bản duyệt cho luồng mua hàng (Purchasing). | app |
| `FastBusiness$Function$APV$SO$Authorize` | `@voucherType varchar, @userID int, @status varchar, @category varchar, @currentDate smalldatetime` | tinyint | Bản duyệt cho luồng đơn hàng bán (Sales Order). | app |
| `FastBusiness$Function$CheckSiteRights` | `@VoucherCode varchar, @UnitCode varchar, @Site varchar, @UserID int, @Admin bit` | bit | User có quyền trên kho `@Site` của đơn vị `@UnitCode` với chứng từ `@VoucherCode` không. | app |
| `FastBusiness$Function$System$CheckUser` | `@name varchar, @UserID int, @Admin bit` | int | User `@name` hợp lệ / có quyền không (db sys). | sys |
| `FastBusiness$Function$System$GetSiteKey` | `@VoucherCode varchar, @UserID int, @Admin bit` | varchar | Khoá lọc kho của user cho chứng từ `@VoucherCode`. | app |
| `FastBusiness$Function$System$GetStockRights` | `@UserID int` | char | Cờ quyền kho của user (`@UserID`). | app |
| `FastBusiness$Function$System$GetUnitFilter` | `@UnitField varchar, @Unit varchar, @UserID int, @Admin bit` | varchar | Mệnh đề lọc theo đơn vị cơ sở, áp lên cột `@UnitField`. | app |
| `FastBusiness$Function$System$GetUnitFilterEx` | `@UnitField varchar, @Unit varchar, @UserID int, @Admin bit, @Right varchar` | varchar | Như trên, tách theo loại quyền `@Right` (new/edit/del/access). | app |
| `FastBusiness$Function$System$GetUnitKey` | `@UserID int` | varchar | Khoá lọc đơn vị cơ sở của user. | app |
| `FastBusiness$Function$System$GetUserName` | `@list varchar` | varchar | Tên hiển thị của danh sách user `@list` (db sys). | sys |
| `FastBusiness$System$CheckAccessRight` | `@id int, @c varchar` | int | User `@id` có quyền truy cập đối tượng `@c` không (db sys). | sys |
| `FastBusiness$System$GetAuthorize` | `@admin int, @id int, @c varchar, @type varchar` | int | Mức duyệt của user `@id` trên đối tượng `@c` loại `@type` (db sys). | sys |
| `ff_CheckUnitRight` | `@nUserID int, @cMa_dvcs varchar, @cAction varchar` | tinyint | User `@nUserID` có quyền `@cAction` trên đơn vị cơ sở `@cMa_dvcs` không. | app |
| `ff_GetGroupList` | `@cObject varchar` | varchar | Danh sách nhóm quyền gắn với đối tượng `@cObject`. | sys |
| `ff_GetLockedProcess` | `@cType char` | bit | Tiến trình loại `@cType` có đang bị khoá không (chặn hai người cùng chạy tính giá/kết chuyển). | app |
| `ff_GetUnitRightList` | `@nUserID int` | varchar | Danh sách đơn vị cơ sở user được TRUY CẬP. | app |
| `ff_GetUnitRightListDel` | `@nUserID int` | varchar | Danh sách đơn vị cơ sở user được XOÁ. | app |
| `ff_GetUnitRightListEdit` | `@nUserID int` | varchar | Danh sách đơn vị cơ sở user được SỬA. | app |
| `ff_GetUnitRightListNew` | `@nUserID int` | varchar | Danh sách đơn vị cơ sở user được THÊM MỚI. | app |
| `ff_GetUserList` | `@cObject varchar` | varchar | Danh sách user gắn với đối tượng `@cObject`. | sys |
| `ff_GetUserRestrictList` | `@cName varchar, @cCurrentUserList varchar` | varchar | Danh sách user bị hạn chế theo `@cName`, lọc trên `@cCurrentUserList`. | sys |
| `ff_InUnitRights` | `@cItem varchar, @strList varchar, @cUnits varchar` | tinyint | `@cItem` có nằm trong danh sách đơn vị được phép `@cUnits`/`@strList` không. | app |
| `ff_POAuthorize` | `@UserID int, @Dept varchar, @FC varchar, @Amount numeric, @Status varchar, @Category varchar, @currentDate smalldatetime` | tinyint | Mức duyệt của user cho đơn mua hàng theo bộ phận / ngoại tệ / số tiền / trạng thái. | app |
| `ff_PRAuthorize` | `@UserID int, @Dept varchar, @FC varchar, @Amount numeric, @Status varchar, @Category varchar, @currentDate smalldatetime` | tinyint | Mức duyệt của user cho phiếu nhu cầu vật tư (tham số như `ff_POAuthorize`). | app |

### Sinh mệnh đề lọc

Trả về một đoạn `WHERE`/khoá lọc để ghép vào SQL động — không phải giá trị nghiệp vụ.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$Function$BI$GetInspectionFilter` | `@InspectionField varchar, @Inspection varchar, @UserID int, @Admin bit` | varchar | Mệnh đề lọc theo lô kiểm định. | app |
| `FastBusiness$Function$BI$GetInspectionKey` | `@VoucherCode varchar, @UserID int, @Admin bit` | varchar | Khoá lọc lô kiểm định của user cho chứng từ. | app |
| `FastBusiness$Function$BI$GetPlantKey` | `@VoucherCode varchar, @UserID int, @Admin bit, @Type tinyint` | varchar | Khoá lọc nhà máy (plant) của user. | app |
| `FastBusiness$Function$BI$GetPurGroupKey` | `@VoucherCode varchar, @UserID int, @Admin bit, @Type tinyint` | varchar | Khoá lọc nhóm mua hàng. | app |
| `FastBusiness$Function$BI$GetPurOrgFilter` | `@PurField varchar, @Pur varchar, @UserID int, @Admin bit` | varchar | Mệnh đề lọc theo tổ chức mua hàng. | app |
| `FastBusiness$Function$BI$GetPurOrgKey` | `@VoucherCode varchar, @UserID int, @Admin bit` | varchar | Khoá lọc tổ chức mua hàng. | app |
| `FastBusiness$Function$CF$GetCFGroupFilter` | `@cfGroupField varchar, @cfGroup varchar, @userID int, @admin bit` | varchar | Mệnh đề lọc theo nhóm hợp nhất. | app |
| `FastBusiness$Function$CF$GetCFGroupKey` | `@voucherCode varchar, @userID int, @admin bit` | varchar | Khoá lọc nhóm hợp nhất. | app |
| `FastBusiness$Function$CF$GetCompanyFilter` | `@cfCompanyField varchar, @cfCompany varchar, @userID int, @admin bit` | varchar | Mệnh đề lọc theo công ty hợp nhất. | app |
| `FastBusiness$Function$CF$GetCompanyKey` | `@VoucherCode varchar, @UserID int, @Admin bit` | varchar | Khoá lọc công ty trong hợp nhất báo cáo. | app |
| `FastBusiness$Function$System$GetAccountFilter` | `@AccountField varchar, @Operation varchar, @AccountFilter varchar` | varchar | Mệnh đề lọc tài khoản theo phép so sánh `@Operation`. | app |
| `FastBusiness$Function$System$GetCodeFilter` | `@Field varchar, @Operation varchar, @Filter varchar` | varchar | Mệnh đề lọc mã tổng quát cho cột `@Field`. | app |
| `FastBusiness$Function$System$GetInvoiceFilter` | `@InvoiceNumber varchar` | varchar | Mệnh đề lọc theo số hoá đơn. | app |

### Sinh SQL động

FBO dựng phần lớn câu lệnh lúc chạy. Nhóm này là bộ dựng câu: có sẵn hàm cho việc bạn định tự ghép chuỗi.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `ff_CheckColumnExists` | `@FieldKey varchar, @cTable varchar` | tinyint | Cột `@FieldKey` có tồn tại trong bảng `@cTable` không — chốt trước khi sinh SQL đụng cột tuỳ biến. | app |
| `ff_CheckOverlapDateRange` | `@fieldFrom smalldatetime, @fieldTo smalldatetime, @valueFrom smalldatetime, @valueTo smalldatetime` | int | Hai khoảng ngày có giao nhau không — dùng chặn trùng kỳ hiệu lực. | app |
| `ff_CreateSpaceName` | `@cTable varchar, @strFields varchar, @strTypes varchar, @cCode varchar` | nvarchar | Sinh câu tạo bảng/cột tạm theo danh sách field + kiểu. | app |
| `ff_GetAdvFilter` | `@strCursor varchar, @strTable varchar, @strJoin1 varchar, @strJoin2 varchar, @strKey nvarchar` | nvarchar | Sinh mệnh đề WHERE cho bộ lọc nâng cao của màn hình. | app |
| `ff_GetAlterDateNull` | `@strCursor varchar, @strField varchar` | nvarchar | Sinh câu ALTER cho cột ngày nhận NULL. | app |
| `ff_GetAlterFieldsNull` | `@strCursor varchar, @strField varchar, @strTypes varchar` | nvarchar | Sinh câu ALTER cho danh sách cột nhận NULL. | app |
| `ff_GetFieldsList` | `@cBaseTable varchar, @cRefTable varchar` | nvarchar | Danh sách cột chung giữa bảng gốc và bảng tham chiếu. | app |
| `ff_GetFieldsListE` | `@cBaseTable varchar, @cRefTable varchar, @cEFileds varchar` | nvarchar | Như `ff_GetFieldsList`, cộng thêm danh sách cột mở rộng `@cEFileds`. | app |
| `ff_GetInsertGroup` | `@cGroups varchar, @cType char, @strSum varchar, @cTable varchar` | nvarchar | Sinh câu chèn dòng nhóm (subtotal) theo `@cGroups` cho bảng báo cáo. | app |
| `ff_GetInsertGroup2` | `@cGroups varchar, @cFieldCode varchar, @cFieldName varchar, @cRefCode varchar, @cRefName varchar, @strSum varchar, @cTable varchar, @cRefTable varchar, @cKey char` | nvarchar | Bản `ff_GetInsertGroup` có mã/tên nhóm lấy từ bảng tham chiếu. | app |
| `ff_GetInsertItemGroup` | `@cGroups varchar, @cRefGroups varchar, @cType char, @strSum varchar, @cTable varchar, @cRefTable varchar, @cFieldName varchar` | nvarchar | Sinh câu chèn dòng nhóm theo nhóm vật tư. | app |
| `ff_GetOrderString` | `@strGroup varchar, @strOrder varchar` | varchar | Ghép mệnh đề ORDER BY từ danh sách nhóm + danh sách sắp xếp. | app |
| `ff_GetSQLFieldsType` | `@cTable varchar, @cType varchar` | varchar | Danh sách cột của `@cTable` lọc theo kiểu dữ liệu `@cType`. | app |
| `ff_GetSQLInsert` | `@cTableInsert varchar, @cTableData varchar, @cBaseTable varchar, @cRefTable varchar, @cKey varchar` | varchar | Sinh `INSERT ... SELECT` từ bảng dữ liệu sang bảng đích, khớp cột theo bảng gốc/tham chiếu. | app |
| `ff_GetSQLInsertE` | `@cTableInsert varchar, @cTableData varchar, @cBaseTable varchar, @cRefTable varchar, @cKey varchar, @cEFileds varchar` | varchar | Như `ff_GetSQLInsert`, có cột mở rộng. | app |
| `ff_GetSQLInsertGroup` | `@cTableInsert varchar, @cTableData varchar, @cBaseTable varchar, @cKey varchar, @cSumList varchar, @cGroupBy varchar` | varchar | Sinh `INSERT ... SELECT ... GROUP BY` (dòng tổng hợp) cho báo cáo. | app |
| `ff_GetSQLInsertGroupE` | `@cTableInsert varchar, @cTableData varchar, @cBaseTable varchar, @cKey varchar, @cSumList varchar, @cGroupBy varchar` | varchar | Bản mở rộng của `ff_GetSQLInsertGroup`. | app |
| `ff_GetSQLInsertGroupE2` | `@cTableInsert varchar, @cTableData varchar, @cBaseTable varchar, @cKey varchar, @cSumList varchar, @cBitList varchar, @cGroupBy varchar` | varchar | Như bản E, tách thêm danh sách cột bit `@cBitList`. | app |
| `ff_GetSQLInsertGroupE2x` | `@cTableInsert varchar, @cTableData varchar, @cBaseTable varchar, @cKey varchar, @cSumList varchar, @cBitList varchar, @cGroupBy varchar` | varchar | Biến thể của `ff_GetSQLInsertGroupE2`. | app |
| `ff_GetSQLInsertGroupEx` | `@cTableInsert varchar, @cTableData varchar, @cBaseTable varchar, @cKey varchar, @cSumList varchar, @cGroupBy varchar` | varchar | Biến thể `ff_GetSQLInsertGroup` — so thân trước khi thay lẫn nhau. | app |
| `ff_GetSQLSearchVoucher` | `@cSystemData varchar, @cMTable varchar, @cDTable varchar, @ctmpMTable varchar, @ctmpDTable varchar, @ctmpMOrder varchar, @ctmpDOrder varchar` | nvarchar | Sinh câu tìm chứng từ trên cặp bảng master/detail và bảng tạm tương ứng. | app |
| `ff_GetSQLUpdate` | `@cTableUpdate varchar, @cTableData varchar, @cBaseTable varchar, @cRefTable varchar, @cLKey varchar, @cRKey varchar, @cJoin varchar` | varchar | Sinh `UPDATE ... FROM` khớp cột giữa bảng đích và bảng dữ liệu theo khoá trái/phải. | app |
| `ff_GetSQLUpdateE` | `@cTableUpdate varchar, @cTableData varchar, @cBaseTable varchar, @cRefTable varchar, @cLKey varchar, @cRKey varchar, @cJoin varchar, @cEFileds varchar` | varchar | Như `ff_GetSQLUpdate`, có cột mở rộng. | app |
| `ff_GetSQLUpdateOtherFields` | `@cTableUpdate varchar, @cTableData varchar, @cBaseTable varchar, @cRefTable varchar, @cLKey varchar, @cRKey varchar, @cJoin varchar` | varchar | Sinh `UPDATE` cho phần cột còn lại ngoài bộ cột chuẩn. | app |
| `ff_GetUpdateFreeFields` | `@cIdNumber char, @cFields varchar, @cRefFields varchar, @cTable varchar, @cTableRef varchar` | varchar | Sinh `UPDATE` cho các trường tự do (free field) từ bảng tham chiếu. | app |
| `ff_GetUpdateOrder` | `@cKeyFields varchar, @cTypeFields varchar, @cTable varchar, @cField varchar` | varchar | Sinh `UPDATE` đánh lại cột thứ tự `@cField` theo khoá `@cKeyFields`. | app |
| `ff_GetUpdateOrderE` | `@cKeyFields varchar, @cTypeFields varchar, @cTable varchar, @cField varchar, @cOrder varchar` | varchar | Như `ff_GetUpdateOrder`, chỉ định thứ tự sắp `@cOrder`. | app |
| `ff_GetUpdateOrderGroup` | `@cKeyFields varchar, @cTypeFields varchar, @cTable varchar, @cField varchar, @cOrder varchar, @cKey varchar` | varchar | Đánh lại thứ tự theo từng nhóm `@cKey`. | app |
| `ff_GetUpdateOrderGroup2` | `@cKeyFields varchar, @cTypeFields varchar, @cTable varchar, @cField varchar, @cOrder varchar, @cKey varchar` | varchar | Biến thể của `ff_GetUpdateOrderGroup`. | app |
| `ff_GetUserDefFields` | — | varchar | Danh sách trường do người dùng tự khai (không tham số). | app |
| `ff_InsertParentRecords` | `@t1 varchar, @c1 varchar, @p1 varchar, @s varchar, @o varchar, @l varchar, @t2 varchar, @c2 varchar, @p2 varchar, @m varchar, @t3 varchar, @c3 varchar, @k varchar` | nvarchar | Sinh câu chèn dòng cha (cấp trên) vào bảng báo cáo phân cấp. | app |
| `ff_InsertParentRecords2` | `@cRPTable varchar, @cRPCodeField varchar, @cRPParentCodeField varchar, @cRPMaxFieldList varchar, @cRPSumFieldList varchar, @cRPOrderField varchar, @cRPLevelField varchar, @cLTable varchar, @cLPCodeField varchar, @cLPParentCodeField varchar, @cRefTable varchar, @cRefCodeField varchar, @cRefKey varchar` | nvarchar | Bản `ff_InsertParentRecords` tham số đặt tên rõ, dùng cho báo cáo cây nhiều bảng. | app |
| `ff_UpdateFLManualData` | `@dPFrom smalldatetime, @dPTo smalldatetime, @dFrom smalldatetime, @dTo smalldatetime, @cUnit varchar, @RPCode char, @cForm varchar, @cReportTable varchar, @cColumnName varchar, @cColumnOrder char, @cColumnType char` | nvarchar | Sinh SQL cập nhật số liệu NHẬP TAY của báo cáo tài chính theo khoảng ngày. | app |
| `ff_UpdateFLManualData2` | `@nPeriod1 int, @nYear1 int, @nPeriod2 int, @nYear2 int, @cUnit varchar, @RPCode char, @cForm varchar, @nReportType tinyint, @nPeriodType tinyint, @nPeriodCount int, @cReportTable varchar, @cColumnName varchar, @cColumnOrder char, @cColumnType char` | nvarchar | Bản theo kỳ/năm và loại kỳ thay vì khoảng ngày. | app |
| `ff_UpdateFLManualData3` | `@dPFrom smalldatetime, @dPTo smalldatetime, @dFrom smalldatetime, @dTo smalldatetime, @cUnit varchar, @RPCode char, @cForm varchar, @cReportTable varchar, @cColumnName varchar, @cColumnOrder char, @cColumnType char` | nvarchar | Biến thể của `ff_UpdateFLManualData` — so thân trước khi thay lẫn nhau. | app |

### Sinh SQL động (họ `FastBusiness$Function$`)

Bản tầng ứng dụng của nhóm trên, đặt tên theo `$Area$Verb$Object`.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$Function$Allocate$Number` | `@t varchar, @n float, @p varchar, @c varchar, @h varchar, @k varchar, @f varchar` | varchar | Sinh SQL phân bổ theo số (`@n`) trên bảng `@t`. | app |
| `FastBusiness$Function$Allocate$Table` ⊗ | `@table1 varchar, @table2 varchar, @partition varchar, @source varchar, @code varchar, @header varchar, @key varchar, @fields varchar, @join varchar` | varchar | Sinh SQL phân bổ theo bảng nguồn/đích. | app |
| `FastBusiness$Function$App$Columns` | `@t1 varchar, @t2 varchar, @f varchar, @g varchar` | varchar | Danh sách cột chung giữa `@t1` và `@t2` để ghép câu INSERT/SELECT động. | app |
| `FastBusiness$Function$App$Columns$Default` | `@t1 varchar, @t2 varchar, @f varchar, @g varchar` | varchar | Như trên, dùng bộ cột mặc định khi `@f`/`@g` rỗng. | app |
| `FastBusiness$Function$App$Fields` ⊗ | `@targetTable varchar, @sourceTable varchar, @baseTable varchar, @fields varchar` | varchar | Danh sách trường của cặp bảng, dạng chuỗi ghép. | app |
| `FastBusiness$Function$App$Fields$Extender` | `@t1 varchar, @t2 varchar, @f varchar, @g varchar` | varchar | Như trên, có cả trường mở rộng. | app |
| `FastBusiness$Function$App$Insert` | `@t1 varchar, @t2 varchar, @t3 varchar, @k varchar, @f varchar, @g varchar` | varchar | Sinh câu INSERT giữa các bảng theo khoá `@k`. | app |
| `FastBusiness$Function$App$Insert$Extender` | `@t1 varchar, @t2 varchar, @t3 varchar, @k varchar, @f varchar, @g varchar, @e varchar, @o varchar` | varchar | Bản có trường mở rộng `@e` và thứ tự `@o`. | app |
| `FastBusiness$Function$Ext$Columns` ⊗ | `@table1 varchar, @table2 varchar, @fields varchar, @groups varchar` | varchar | Bản `App$Columns` cho bảng mở rộng. | app |
| `FastBusiness$Function$Ext$Insert` ⊗ | `@targetTable varchar, @sourceTable varchar, @targetRefTable varchar, @sourceRefTable varchar, @fields varchar, @groups varchar` | varchar | Bản `App$Insert` cho bảng mở rộng. | app |
| `FastBusiness$Function$Ext$InsertGroup` ⊗ | `@targetTable varchar, @sourceTable varchar, @whereClause varchar, @fields varchar, @groups varchar, @orderField varchar` | varchar | Sinh câu INSERT dòng nhóm cho bảng mở rộng. | app |
| `FastBusiness$Function$Report$GetDeleteNoneInvetoryItem` | `@Table varchar, @ItemField varchar, @Type char` | nvarchar | Sinh câu xoá dòng vật tư không quản kho khỏi bảng báo cáo `@Table`. | app |
| `FastBusiness$Function$Update$Inquiry` | `@master varchar, @detail varchar, @column varchar, @fields varchar, @sign varchar, @id varchar, @set varchar, @join varchar, @voucher varchar, @extension varchar, @right int` | varchar | Sinh SQL cập nhật bảng inquiry — số đã dùng của chứng từ gốc (đơn hàng → phiếu xuất…). | app |
| `FastBusiness$Function$Update$Inquiry$Ex` | `@master varchar, @detail varchar, @column varchar, @fields varchar, @sign varchar, @id varchar, @set varchar, @join varchar, @voucher varchar, @extension varchar, @right int` | varchar | Bản mở rộng của `Update$Inquiry`. | app |
| `FastBusiness$Function$Voucher$GetRecordsGroup` ⊗ | `@lineNumber bigint` | varchar | Nhóm bản ghi ứng với số `@_0` — dùng gom dòng chứng từ. | app |
| `FastBusiness$Function$Voucher$GetSQLReviseCurrentStock` ⊗ | `@Variable varchar, @Extension varchar, @IDNumberEx varchar, @VoucherCode varchar, @Action varchar, @Stock int, @reviseStock varchar` | varchar | Sinh SQL tính lại tồn kho hiện thời (revise). | app |
| `FastBusiness$Function$Voucher$GetSQLReviseMovingStock` | `@Variable varchar, @Extension varchar, @IDNumberEx varchar, @VoucherCode varchar, @Action varchar, @Stock int, @reviseMovingStock varchar` | varchar | Sinh SQL tính lại tồn luân chuyển. | app |
| `FastBusiness$Function$Voucher$GetSQLUpdateCurrentStock` ⊗ | `@Variable varchar, @Extension varchar, @IDNumber char, @VoucherCode varchar, @Action varchar, @Stock int` | varchar | Sinh SQL cập nhật tồn kho hiện thời khi ghi/huỷ chứng từ. | app |
| `FastBusiness$Function$Voucher$GetSQLUpdateMovingStock` | `@Variable varchar, @Extension varchar, @IDNumber char, @VoucherCode varchar, @Action varchar, @Stock int` | varchar | Sinh SQL cập nhật tồn luân chuyển (moving stock). | app |

### Công thức báo cáo

Kiểm và bóc tách công thức người dùng nhập trong báo cáo tài chính.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$Function$CheckFormula` ⊗ | `@formula nvarchar, @type tinyint` | nvarchar | Kiểm cú pháp công thức, trả thông báo lỗi (rỗng nếu hợp lệ). | app |
| `FastBusiness$Function$GetFormulaCheck` | `@Formula nvarchar` | nvarchar | Chuẩn hoá công thức thành dạng kiểm tra được. | app |
| `FastBusiness$Function$GetFormulaExecuteCheck` | `@s nvarchar` | nvarchar | Chuẩn hoá công thức thành dạng chạy thử được. | app |
| `FastBusiness$Function$GetFormulaList` | `@Formula nvarchar, @Type tinyint` | nvarchar | Bóc danh sách thành phần trong công thức theo `@Type`. | app |

### Bảo mật & mã hoá

`CheckSQLInjection` phải gọi TRƯỚC khi ghép bất kỳ tham số nào vào SQL động.

| Hàm | Tham số | Trả về | Ý nghĩa | db |
|---|---|---|---|---|
| `FastBusiness$EncryptPatternValue` | `@text nvarchar, @type varchar` | nvarchar | Mã hoá giá trị theo mẫu `@type` (dữ liệu nhạy cảm khai theo pattern). | sys |
| `FastBusiness$Function$CheckIrregularExternal` | `@s nvarchar` | bit | Chuỗi tham số ngoài có ký tự bất thường không. | app |
| `FastBusiness$Function$CheckSQLInjection` | `@s nvarchar` | bit | Chuỗi có dấu hiệu SQL injection không — GỌI TRƯỚC khi ghép tham số vào SQL động. | app |
| `FastBusiness$Function$EncodeHtml` | `@s nvarchar` | nvarchar | Escape HTML. | app |
| `FastBusiness$Function$EncodeHtml` | `@s nvarchar` | nvarchar | Escape HTML. | sys |
| `FastBusiness$Function$EncodeScript` | `@s nvarchar` | nvarchar | Escape script. | app |
| `FastBusiness$Function$GetKey` | `@input varchar` | varchar | Sinh khoá từ `@input`. | app |
| `FastBusiness$Function$Hash` | `@input varchar` | varchar | Băm chuỗi. | app |
| `FastBusiness$Function$HtmlCode` | `@c nvarchar, @t tinyint` | nvarchar | Sinh mã HTML cho ký tự `@c` theo kiểu `@t`. | sys |
| `FastBusiness$Function$System$GetCheckKey` | `@Key nvarchar` | nvarchar | Khoá kiểm tra (checksum) của `@Key`. | app |
| `FastBusiness$Function$Wrap` ⊗ | `@input varchar, @key varchar` | varchar | Mã hoá/bọc `@input` bằng `@key`. | app |

## Đối tượng mã hoá — chữ ký suy ngược

15 function trong danh mục khai `WITH ENCRYPTION`. Với chúng SQL Server không
giữ thân lệnh, và tên tham số bị thay bằng `@_0`, `@_1`… nên metadata một mình không đọc được.

Tên dưới đây **suy ngược từ chỗ gọi**, không phải từ đọc thân:

| Nguồn | Nghĩa |
|---|---|
| `A` | script nguồn chưa obfuscate trong SourceCollection, chữ ký khớp tuyệt đối với SP2422 |
| `B` | chỗ gọi thật: token runtime `@@xxx` trong controller XML, hoặc tên biến của thủ tục gọi nó |
| `D` | **đọc thân đã giải mã** — mạnh nhất: tên suy từ cột được gán, token `REPLACE`, hoặc khai báo `sp_executesql` |

Vị trí không có bằng chứng thì **giữ nguyên `@_N`** — đó là chỗ còn mù, đừng đoán thêm.
Câu lệnh trong mỗi khối là **lời gọi thật chép nguyên văn**; tên tham số chỉ là diễn giải của nó.

Trong 15 function mã hoá: **14** đã suy được tên, **0** chưa có bằng chứng, **1** vốn vẫn còn tên tham số.

#### `FastBusiness$Function$Allocate$Table`

- **Bằng chứng (B):** proc FastBusiness$App$Allocate$Table (db app) — truyền thẳng tham số của chính nó
- **Suy được 9/9 vị trí.**
- Tên lấy từ tham số của proc bọc ngoài (`@t1, @t2, @p, @s, @c, @h, @k, @f, @j`) — bản thân chúng cũng viết tắt; đây là mức tốt nhất có được.

```sql
SELECT @q = dbo.FastBusiness$Function$Allocate$Table(@t1, @t2, @p, @s, @c, @h, @k, @f, @j)
```

#### `FastBusiness$Function$App$Fields`

- **Bằng chứng (B):** proc fs_PostSVTran / fs_PostAdjustmentInventory / ds_PostInventoryDiscountGift (db app)
- **Suy được 4/4 vị trí.**
- Trả về DANH SÁCH CỘT dùng chung, để ghép vào `INSERT … SELECT` động.

```sql
SELECT @s = 'insert into #in select ' + dbo.FastBusiness$Function$App$Fields('indcsd', @DetailTable, @MasterTable, null) + ' from #detail a, #master b'
```
<sub>— proc fs_PostAdjustmentInventory (db app)</sub>

#### `FastBusiness$Function$CheckFormula`

- **Bằng chứng (B):** proc FastBusiness$Report$Import$CheckReportForm (db app)
- **Suy được 2/2 vị trí.**
- Trả `0` khi công thức KHÔNG hợp lệ — nơi gọi so `= 0` để bắt lỗi.

```sql
'… and (dbo.FastBusiness$Function$CheckFormula(a.' + @formulaField + ', 1) = 0)'
```
<sub>— proc FastBusiness$Report$Import$CheckReportForm (db app)</sub>

#### `FastBusiness$Function$Ext$Columns`

- **Bằng chứng (B):** proc rs_EIReleasedInvoiceCreate / FastBusiness$EInvoice$ReleaseInvoice (db app)
- **Suy được 4/4 vị trí.**

```sql
SELECT @c0 = dbo.FastBusiness$Function$Ext$Columns('#m0', '#master', null, null)
```

#### `FastBusiness$Function$Ext$Insert`

- **Bằng chứng (B):** proc fs_SFPostQC / fs_PostAPTran (db app)
- **Suy được 6/6 vị trí.**

```sql
SET @q = dbo.FastBusiness$Function$Ext$Insert('#gl', '#dGL', '#gl', '#dGL', NULL, NULL)
```
<sub>— proc fs_PostAPTran (db app)</sub>

#### `FastBusiness$Function$Ext$InsertGroup`

- **Bằng chứng (B):** proc fs_PostAPTran / fs_PostARTran / fs_PostASTran (db app)
- **Suy được 6/6 vị trí.**

```sql
SET @q = dbo.FastBusiness$Function$Ext$InsertGroup('#dGL', '#detail', '1 = 1', NULL, NULL, 'line_nbr')
```

#### `FastBusiness$Function$FormatStringColumn`

- **Bằng chứng (B):** proc rs_PrintDDTran / rs_PrintRDTran (db app)
- **Suy được 3/3 vị trí.**
- Trả về CÂU LỆNH ghi bản đã định dạng của `@sourceColumn` sang `@targetColumn` — nơi gọi tự `sp_executesql`.

```sql
set @s = dbo.FastBusiness$Function$FormatStringColumn('#report', 'ty_gia', 'chuoi_ty_gia')   exec sp_executesql @s
```
<sub>— proc rs_PrintDDTran (db app)</sub>

#### `FastBusiness$Function$FormatStringValue`

- **Bằng chứng (B):** 7 chỗ gọi Controllers, đều truyền `a.ty_gia`
- **Suy được 1/1 vị trí.**

```sql
dbo.FastBusiness$Function$FormatStringValue(a.ty_gia)
```

#### `FastBusiness$Function$GetArisingDateAndPeriod`

- **Bằng chứng (B):** proc fs_BI112/113/114, rs_rptTrialBalance (db app)
- **Suy được 2/2 vị trí.**
- Cột trả về: `p1, y1, p2, y2, dStart1, dEnd1, dStart2, dEnd2`.

```sql
SELECT @p1 = p1, @y1 = y1, @p2 = p2, @y2 = y2, @dStart1 = dStart1, @dEnd1 = dEnd1, @dStart2 = dStart2, @dEnd2 = dEnd2 FROM dbo.FastBusiness$Function$GetArisingDateAndPeriod(@DateFrom, @DateTo)
```

#### `FastBusiness$Function$GetBalanceDateAndPeriod`

- **Bằng chứng (B):** proc js_CalcBookExRatex / rs_rptTrialBalance / fs20_CalcBookExRatex (db app)
- **Suy được 2/2 vị trí.**
- Cột trả về: `y, y0, p0, dStart, dEnd`.

```sql
SELECT @y = y, @y0 = y0, @p0 = p0, @dStart = dStart, @dEnd = dEnd FROM dbo.FastBusiness$Function$GetBalanceDateAndPeriod(@dFrom, 1)
```

#### `FastBusiness$Function$System$Replace`

- **Bằng chứng (B):** proc rs_LoadPRApproval / rs_VoucherNumberMassUpdate (db app)
- **Suy được 3/4 vị trí.**

```sql
SET @strSQL = dbo.FastBusiness$Function$System$Replace(@q, '%Partition', @partition, DEFAULT)
```

#### `FastBusiness$Function$Voucher$GetRecordsGroup`

- **Bằng chứng (B):** 20 chỗ gọi Controllers + 45 proc trong db app
- **Suy được 1/1 vị trí.**
- Kết quả ghi vào `nh_dk` — mã nhóm định khoản của cặp bút toán nợ/có.

```sql
nh_dk = dbo.FastBusiness$Function$Voucher$GetRecordsGroup(FLOOR(stt + 1) / 2)
```
<sub>— proc fs_PostAPTran (db app)</sub>

#### `FastBusiness$Function$Voucher$GetSQLReviseCurrentStock`

- **Bằng chứng (A):** script nguồn `FBOR2SP24.2.2/Script/CurrentStock.sql` (chưa obfuscate, chữ ký khớp tuyệt đối)
- **Suy được 7/7 vị trí.**
- `@reviseStock` là tên bảng tạm chứa kết quả tính lại (thường `#reviseStock`).

```sql
SET @s = dbo.FastBusiness$Function$Voucher$GetSQLReviseCurrentStock(@Variable, @Extension, @keyIDNumber, @keyVoucherCode, @Action, @Stock, @ReviseStock)
```
<sub>— proc FastBusiness$Voucher$UpdateCurrentStock (db app)</sub>

#### `FastBusiness$Function$Voucher$GetSQLUpdateCurrentStock`

- **Bằng chứng (A):** script nguồn `FBOR2SP24.2.2/Script/CurrentStock.sql` (chưa obfuscate, chữ ký khớp tuyệt đối)
- **Suy được 6/6 vị trí.**
- Trả về CÂU LỆNH, chưa chạy — nơi gọi tự `EXEC`/`sp_executesql`.

```sql
SET @q = dbo.FastBusiness$Function$Voucher$GetSQLUpdateCurrentStock('r70$' + @p, 'r90$' + @p, @identityNumber, @vCode, 'Delete', @Stock)
```
<sub>— proc rs_AutoGenerateStocktaking (db app)</sub>

### Mã hoá nhưng vẫn còn tên tham số

Thân lệnh không đọc được, nhưng metadata giữ nguyên tên tham số — chữ ký dùng được ngay,
không cần suy ngược:

- `FastBusiness$Function$Wrap` (app) — `@input varchar, @key varchar`

