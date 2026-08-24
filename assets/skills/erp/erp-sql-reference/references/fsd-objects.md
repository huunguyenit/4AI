# `fsd_*` — thư viện SQL của bộ phận lập trình

29 đối tượng, quét từ db app của một chương trình **FBI SP2422**.

Khác với `ff_`/`fs_`/`Fast*` (sản phẩm chuẩn của Fast), `fsd_*` là **lớp tiện ích do bộ phận
lập trình FSD dựng**. Chúng có mặt ở các chương trình FSD bảo trì, **không bảo đảm có ở mọi
program** — kiểm bằng `query_sql { object: "fsd_..." }` trên đúng program trước khi gọi.

Không cái nào bị `WITH ENCRYPTION`: đọc được thân đầy đủ bằng `query_sql { object }`.

## Sinh câu lệnh — nhóm dùng nhiều nhất

| Đối tượng | Chữ ký | Trả về | Việc |
|---|---|---|---|
| `fsd_GetSQLInsert` | `@cTableInsert varchar, @cTableData varchar, @cKey varchar` | `varchar` | Sinh `INSERT` từ bảng nguồn sang bảng đích, **tự khớp cột theo tên** — cách chuẩn để đẩy `#temp` vào bảng thật khi đích rộng hơn nguồn |
| `fsd_getSQLUpdate` | `@cTableUpdate varchar, @cTableData varchar, @join varchar, @cKey varchar` | `varchar` | Sinh `UPDATE … FROM` theo điều kiện join |
| `fsd_getInsertJoinTwoTable` | `@cTableInsert varchar, @cTableMaster varchar, @cTableDetail varchar, @cJoin varchar, @cKey varchar` | `varchar` | Sinh `INSERT` gộp master + detail |
| `fsd_MakeJoinFromField` | `@field varchar, @cA char, @cB char` | `varchar` | Sinh mệnh đề `ON a.x = b.x AND …` từ danh sách cột |

Cả nhóm **trả về CHUỖI, chưa chạy** — nơi gọi tự `EXEC sp_executesql @q`.

```sql
SELECT @q = dbo.fsd_GetSQLInsert('xcdloaiytdd', '#wip', '')
EXEC sp_executesql @q
```

## Chuỗi và danh sách

| Đối tượng | Chữ ký | Trả về | Việc |
|---|---|---|---|
| `fsd_StringToTable` | `@str nvarchar` | bảng (`val`) | Tách chuỗi CSV thành bảng một cột |
| `fsd_StringToTableByChar` | `@str nvarchar, @c char` | bảng | Như trên, tự chọn ký tự phân tách |
| `fsd_InList` | `@cItem varchar, @strList varchar` | `bit` | `@cItem` có nằm trong danh sách CSV không |

`fsd_StringToTable` trả cột `val` — luôn `rtrim(val)` khi so sánh (xem `erp-category-create`).

## Sinh mã tăng dần

| Đối tượng | Chữ ký | Loại | Việc |
|---|---|---|---|
| `fsd_IncreaseCode` | `@curCode varchar, @num int` | function → `varchar` | Tăng mã hiện tại thêm `@num` |
| `fsd_IncreaseCodeAnymore` | `@code varchar` | function → `varchar` | Tăng mã, xử lý phần đuôi số dài |
| `fsd_IncreaseMultiCode` | `@tbName varchar, @fieldIncrease varchar, @fieldKey varchar, @codeIncrease varchar, @referenceIncreaseField varchar` | proc | Sinh nhiều mã một lượt trên một bảng |
| `fsd_IncreaseVoucherCode` | `@ma_nk varchar, @len_so_ct int, @isSave bit, @ma_ct varchar, @us_id int, @action varchar, @ma_nk_old varchar, @stt_rec varchar` | proc | Cấp **số chứng từ** theo quyển `ma_nk` |

## Ngày và kỳ

| Đối tượng | Chữ ký | Trả về | Việc |
|---|---|---|---|
| `fsd_getCycle` | `@DateFrom smalldatetime, @DateTo smalldatetime` | bảng | Liệt kê các kỳ nằm giữa hai mốc — dùng để duyệt bảng phân kỳ |
| `fsd_getEndOfMonth` | `@d smalldatetime` | `smalldatetime` | Ngày cuối tháng |
| `fsd_ConvertDatetimeToUnixTimeStamp` | `@d datetime` | `bigint` | datetime → Unix timestamp |
| `fsd_ConvertUnixTimeStampToDatetime` | `@timestamp bigint` | `datetime` | chiều ngược lại |

## DDL và bảng tạm

| Đối tượng | Chữ ký | Loại | Việc |
|---|---|---|---|
| `fsd_addFields` | `@xTable varchar, @xField varchar, @xDataType varchar, @isDebug char` | proc | **Thêm cột** vào bảng nghiệp vụ — đường chuẩn khi customize cần cột mới |
| `fsd_AlterNullTable` | `@cTable varchar, @strKey nvarchar` | proc | Bỏ `NOT NULL` theo danh sách cột |
| `fsd_CreateFilegroup` | `@sPartitionName varchar` | proc | Tạo filegroup cho một partition |
| `fsd_DropTmp` | `@exclude varchar` | proc | Dọn bảng tạm, trừ danh sách loại lệ |
| `fsd_getColumFromTmp` | `@cTable varchar` | tvf | Liệt kê cột của một bảng tạm |
| `fsd_TableTempName` | `@cTableTmp varchar` | `varchar` | Tên thật của `#temp` trong `tempdb` |
| `fsd_ConvertToSttRec0` | `@n int` | `varchar` | Sinh `stt_rec0` từ số |

`fsd_addFields` là đường được duyệt để thêm cột — xem `erp-table-propose` trước khi tự
viết `ALTER TABLE`.

## Gộp nhóm và phân quyền

| Đối tượng | Chữ ký | Loại | Việc |
|---|---|---|---|
| `fsd_GroupData` | `@Table varchar, @FieldGroup nvarchar, @FieldMax nvarchar, @FieldSum nvarchar, @Insert tinyint, @DFColumns varchar, @DFValues varchar, @OrderNo varchar, @MoreJoin nvarchar, @MoreKey nvarchar` | proc | Gộp nhóm dữ liệu báo cáo |
| `fsd_InsertGroupMulti` | 11 tham số (`@tbData`, `@lstGroup`, `@lstGroupDanhMuc`, `@lstPrimaryKey`, `@colStt`, `@colTen`, `@colTen2`, `@lstSum`, `@lstMax`, `@sysOrderAtData`, `@type`) | function → `nvarchar` | Sinh SQL gộp nhóm nhiều cấp |
| `fsd_InsertGroupMuti` | **cùng chữ ký** | function → `nvarchar` | ⚠ bản trùng tên gõ thiếu chữ `l` |
| `fsd_Group$Order$MultiLevel_v2` | `@Controller`, `@GroupFields`, `@TableData`, `@TableInsert`, `@DefaultFields`, `@ValueFields`, `@DetailField`, `@IdentityField`, `@NameField`, `@Delimiter` | function → `nvarchar` | Gộp nhóm nhiều cấp, bản `_v2` |
| `fsd_GetUnitRight` | `@Unit varchar, @UserID int, @Admin bit` | tvf | Danh sách đơn vị cơ sở user được phép xem |
| `fsd_genFomulaReportForm` | `@field varchar, @ma_so varchar, @tb varchar, @fomula varchar, @group varchar, @value varchar` | `varchar` | Sinh công thức cho mẫu báo cáo |
| `fsd_InsertFieldToLog` | `@ma_ct varchar` | proc | Ghi cột vào bảng `$log` của chứng từ |

`fsd_GetUnitRight` là đường chuẩn lọc theo quyền đơn vị — đừng tự viết `IN (SELECT …)` trên
bảng quyền.

## Bẫy

- **`fsd_InsertGroupMulti` và `fsd_InsertGroupMuti` cùng tồn tại**, chữ ký giống hệt, tên khác
  nhau một chữ `l`. Đây là lỗi gõ đã lên production và **không được sửa** vì có code đang gọi
  bản sai. Copy nguyên văn tên từ chỗ đang chạy, đừng gõ lại theo trí nhớ.
- Cả họ `fsd_*` là **lớp customize**, không phải sản phẩm chuẩn. Program của khách khác có thể
  thiếu, hoặc có bản khác. Kiểm trước bằng `query_sql { program, object }`.
- Nhóm sinh câu lệnh trả **chuỗi**; quên `EXEC sp_executesql` thì không có gì chạy và cũng
  không có lỗi nào báo ra.
- Chữ hoa/thường không nhất quán (`fsd_addFields` vs `fsd_AlterNullTable` vs `fsd_getSQLUpdate`).
  Đây là dữ liệu thật — copy nguyên văn.
