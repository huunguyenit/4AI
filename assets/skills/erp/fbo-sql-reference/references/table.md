# Bảng `sys*` — FBO/FBI SP2422

> **Nguồn:** quét `sys.objects` / `sys.parameters` / `sys.columns` của một chương trình
> FBO chuẩn bản **SP2422** (db `app` và db `sys`) qua MCP `4ai-fbo` → `query_sql`.
>
> **Ý nghĩa cột "Ý nghĩa" suy từ tên + chữ ký + tên tham số, KHÔNG phải từ đọc thân.**
> Nó đủ để chọn đúng đối tượng cần tra; trước khi dựa vào hành vi chính xác thì đọc thân:
> `query_sql { program, db, object: "<tên>" }`.
>
> Chương trình khách có thể thêm/sửa đối tượng riêng — danh mục này là bản CHUẨN, không phải
> bản của khách. Không thấy trong danh mục ≠ không tồn tại ở chương trình đang làm.

Tổng: **93** bảng tên bắt đầu bằng `sys` (43 ở db `app`, 50 ở db `sys`).

Đây là **bảng khai báo**, không phải bảng nghiệp vụ: chúng mô tả chương trình chạy thế nào
(màn hình, trường, quyền, luồng, quy tắc xoá), chứ không chứa chứng từ hay danh mục. Bảng
nghiệp vụ nằm ở tên khác (`m31$000000`, `dmct`, `dmvt`…) và không thuộc phạm vi file này.

> **Số dòng lấy từ một chương trình chuẩn gần như trống** — nó cho biết bảng có được dùng hay
> không, chứ không nói gì về quy mô ở chương trình khách.

> **Ghi vào bảng `sys*` là đổi hành vi chương trình, không phải sửa dữ liệu.** Sửa `sysfields`
> hay `sysflowinfo` bằng SQL tay là bỏ qua toàn bộ đường ghi có kiểm soát của FBO.

> **Cặp `X` / `X2`.** Nhiều bảng quyền đi thành cặp `X` và `X2` với cột gần giống nhau. Một bảng là khai báo gốc, bảng kia là bản đã dựng lại cho user — **không suy từ tên**: xem thủ tục `FastBusiness$System$Update*Rights`, `fs_UpdateSysActionRights`, `fs_UpdateActionRight2` để biết bảng nào là nguồn, bảng nào là kết quả, trước khi ghi vào bất kỳ bảng nào.

## Danh mục

### db `app` — khai báo bảng & trường

Bản đồ "bảng nào sinh ra từ đâu, cột nào tên là gì". Đọc `sysgendata` trước khi đi tìm một bảng dữ liệu.

- **`syscolumninfo`** · 0 dòng — Tên hiển thị song ngữ của cột.
  <br>`table_id varchar, column_id varchar, column_name nvarchar, column_name2 nvarchar`
- **`syscurrentfiles`** · 7 dòng — Danh sách bảng "hiện thời" (tồn kho / công nợ hiện thời) — bảng được cập nhật trực tiếp khi ghi chứng từ.
  <br>`table_name varchar`
- **`sysfreegroup`** · 1 dòng — Nhóm trường tự do: `xgroup` gắn với cột `xfield` của bảng `xtable`.
  <br>`xgroup char, xfield varchar, xtable varchar, status char`
- **`sysfreeinfo`** · 0 dòng — Khai báo hiển thị của trường tự do: tiêu đề song ngữ, độ rộng, định dạng, kiểu.
  <br>`code char, xorder tinyint, header nvarchar, header2 nvarchar, width int, format char, xtype char, ntype tinyint, status char`
- **`sysgendata`** · 367 dòng — Khai báo bảng nào sinh từ bảng nào: `basetable` → `primetable`, `refprimetable`, filegroup. Đây là bản đồ sinh bảng dữ liệu của chương trình.
  <br>`basetable varchar, primetable varchar, refprimetable varchar, primefilegroup varchar, status char, type tinyint`
- **`sysgendatainfo`** · 1 dòng — Thông tin mô tả kèm `sysgendata` (song ngữ `info`/`info2`).
  <br>`id decimal, info nvarchar, info2 nvarchar`
- **`sysinventory`** · 2 dòng — Ánh xạ cột tồn kho ↔ loại chứng từ.
  <br>`xcolumn varchar, xvoucher varchar`
- **`syspostfields`** · 6 dòng — Danh sách trường được mang theo khi post chứng từ vào sổ.
  <br>`id char, field varchar, description nvarchar`
- **`sysrefdata`** · 246 dòng — Nguồn dữ liệu tham chiếu (lookup): bảng, khoá, thứ tự, câu truy vấn.
  <br>`xtable varchar, xkey varchar, xorder int, xforder varchar, xtype char, xquery varchar, xdesc nvarchar`
- **`sysspdetailinfo`** · 12 dòng — Khai báo phần detail của thủ tục post: danh sách trường, trường ngoại tệ, trường tham chiếu.
  <br>`xid char, xvalid varchar, xfields varchar, xfcfields varchar, xreffields varchar, xorder tinyint`
- **`sysspmasterinfo`** · 3 dòng — Khai báo phần master của thủ tục post (`xid` → câu đọc dữ liệu).
  <br>`xid char, xread varchar`
- **`systableinfo`** · 0 dòng — Tên hiển thị song ngữ của bảng (`table_id` → `table_name`/`table_name2`).
  <br>`table_id varchar, table_name nvarchar, table_name2 nvarchar`
- **`sysudf`** · 12 dòng — Trường do người dùng tự định nghĩa (user-defined field) đang bật.
  <br>`id int, value varchar, type varchar, status char`
- **`sysudt`** · 0 dòng — Sáu mã tự định nghĩa `ma_td1`–`ma_td6` — chiều phân tích thêm mà khách tự khai.
  <br>`ma_td1 varchar, ma_td2 varchar, ma_td3 varchar, ma_td4 varchar, ma_td5 varchar, ma_td6 varchar`

### db `app` — luồng & trạng thái chứng từ

`sysflowinfo` là máy trạng thái chứng từ. Muốn biết vì sao một nút bị mờ, xem ở đây trước khi xem XML.

- **`syscredit`** · 3 dòng — Loại chứng từ nào chịu kiểm tra hạn mức công nợ, ở trạng thái nào.
  <br>`ma_ct char, loai_ct char, status char, cn_yn bit`
- **`sysdaterules`** · 0 dòng — Khoảng ngày user được phép thao tác (`ngay_ct1`–`ngay_ct2`) — khoá sổ theo người dùng.
  <br>`user_id int, ngay_ct1 smalldatetime, ngay_ct2 smalldatetime, not_vc_search bit`
- **`sysflowinfo`** · 355 dòng — Máy trạng thái chứng từ: với `ma_ct` ở trạng thái `xstatus`, hành động `xaction` đưa sang `xstatus2`; `xin`/`xgl` cho biết có cập nhật kho / sổ cái không.
  <br>`ma_ct char, xstatus char, xaction char, xstatus2 char, xorder tinyint, xin bit, xgl bit`

### db `app` — quy tắc xoá

FBO không xoá theo khoá ngoại của SQL Server mà theo khai báo trong ba bảng này.

- **`sysdelete`** · 450 dòng — Khai báo xoá theo tầng: với `xcode`/`xtype`, phải xoá bảng `xtable` theo khoá `xkey` (hoặc chạy `xscript`), có ghi log không, có kiểm tồn tại không.
  <br>`xcode char, xtype varchar, xtable varchar, xkey varchar, xscript varchar, delete_log bit, check_exists bit, xaction varchar, i int`
- **`sysdeletechecking`** · 104 dòng — Câu kiểm tra chặn xoá (`xscript` → `errorcode`) — nơi khai "không cho xoá vì còn phát sinh".
  <br>`xcode char, xtype varchar, xscript varchar, modekey varchar, errorcode varchar, i int`
- **`sysdeletecontent`** · 50 dòng — Khai báo xoá cho phần nội dung/đính kèm.
  <br>`id varchar, xtype varchar, xtable varchar, xkey varchar, xscript varchar, delete_log bit, check_exists bit, xaction varchar, i int`

### db `app` — đổi mã danh mục

Đổi một mã khách hàng/vật tư là chạy hàng loạt UPDATE trên toàn database; ba bảng đầu là khai báo, ba bảng sau là hàng đợi + lịch sử + log.

- **`syscodechange`** · 0 dòng — Hàng đợi yêu cầu đổi mã đang chạy: giá trị cũ/mới, tiến độ, spid, trạng thái.
  <br>`id_no int, code varchar, old_value nvarchar, new_value nvarchar, xtype tinyint, description nvarchar, external_parameter varchar, error_code varchar, progress tinyint, spid int, status char, datetime0 datetime, datetime2 datetime, datetime3 datetime, user_id0 int, user_id2 int`
- **`syscodechangedeclare`** · 0 dòng — Bảng nào tham gia đổi mã loại `xtype`.
  <br>`xtype tinyint, table_name varchar`
- **`syscodechangehistory`** · 0 dòng — Lịch sử các lần đổi mã đã hoàn tất.
  <br>`id_no int, code varchar, old_value nvarchar, new_value nvarchar, xtype tinyint, description nvarchar, external_parameter varchar, error_code varchar, progress tinyint, status char, datetime0 datetime, datetime2 datetime, datetime3 datetime, user_id0 int, user_id2 int`
- **`syscodechangelist`** · 18 dòng — Danh mục các loại mã được phép đổi: trường liên quan, mã bị từ chối, mã trùng, script gộp/kiểm/cập nhật.
  <br>`code varchar, code_name nvarchar, code_name2 nvarchar, fields varchar, rejected varchar, duplicate varchar, basetable varchar, basefield varchar, nested tinyint, unicode_yn tinyint, merge_yn tinyint, merge_script nvarchar, check_script nvarchar, update_script nvarchar, status char`
- **`syscodechangelog`** · 0 dòng — Nhật ký từng câu SQL của một lần đổi mã, kèm số dòng ảnh hưởng.
  <br>`id_no int, stt int, field varchar, basetable varchar, strSQL nvarchar, execute_type tinyint, description nvarchar, row_count int, progress tinyint`
- **`syscodechangevoucher`** · 887 dòng — Chứng từ/controller nào chịu ảnh hưởng khi đổi mã, trên trường nào.
  <br>`controller varchar, xtype char, field varchar, field_name nvarchar, field_name2 nvarchar, operation varchar, inquiry_table varchar, ma_ct char`

### db `app` — chuyển & nhập dữ liệu

Khai báo cho luồng nhập dữ liệu từ file.

- **`sysbakfiles`** · 134 dòng — Danh sách file backup dữ liệu theo loại và khoá.
  <br>`sysid char, sysfile varchar, sysref char, systype char, syskey char`
- **`syschecktransfer`** · 116 dòng — Bộ kiểm tra dữ liệu chuyển: cột nào phải khớp cột nào ở bảng gốc.
  <br>`id char, tbl varchar, field varchar, fref varchar, fcheck varchar, forg varchar, tblorg varchar, xgroup char, status char, unicode_yn varchar`
- **`systransfer`** · 217 dòng — Khai báo nhập/chuyển dữ liệu: file nguồn `xfile` → bảng `xtable`, khoá, kiểu, cờ kiểm tra tồn tại, cờ unicode.
  <br>`id char, xfile varchar, xref varchar, xtable varchar, xfind varchar, xtype char, xkey varchar, xcode char, xfield varchar, xcheck tinyint, xexists tinyint, kind tinyint, xtblref varchar, status char, unicode_yn varchar, xkeyext varchar, xcode_change varchar`
- **`systransferref`** · 0 dòng — Quan hệ phụ thuộc giữa các file trong một lần chuyển dữ liệu (`xfile` cần `xfile_ref` trước).
  <br>`id char, xfile varchar, xfile_ref varchar`

### db `app` — lịch, đính kèm, log, mẫu in

- **`sysevents`** · 0 dòng — Sự kiện / công việc trên lịch: nội dung, mức độ, người được giao, khoảng thời gian, chia sẻ, trạng thái, chứng từ liên quan.
  <br>`id bigint, event_yn tinyint, text nvarchar, type tinyint, muc_do tinyint, assigned_name varchar, start_date datetime, end_date datetime, full_day bit, details nvarchar, share_user varchar, share_group int, private bit, status char, stt_rec char, stt_rec_ref char, stt_rec_type tinyint, line_nbr int, user_ref varchar, user_id0 int, user_id2 int, datetime0 datetime, datetime2 datetime`
- **`syseventsoptions`** · 1 dòng — Tuỳ chọn hiển thị lịch của từng user (khoảng ngày, giờ đầu/cuối, bước thời gian, màu theo mức độ).
  <br>`user_id int, number_of_date_before int, number_of_date_after int, monday_yn bit, event_duration int, first_hour tinyint, last_hour tinyint, time_step int, muc_do_cao varchar, muc_do_tb varchar, muc_do_thap varchar, tt_chua_thuc_hien varchar, tt_dang_thuc_hien varchar, tt_hoan_thanh varchar, tt_tam_dung varchar, text_color varchar, max_month_events tinyint, mark_now bit, active_link_view varchar`
- **`syseventsuser`** · 0 dòng — Ai được chia sẻ sự kiện nào.
  <br>`id int, id_event int, user_id int, user_id0 int, user_id2 int, datetime0 datetime, datetime2 datetime`
- **`sysfileinfo`** · 0 dòng — File đính kèm theo controller + khoá bản ghi; nội dung nằm ở cột `file_data` (image).
  <br>`controller char, syskey char, line_nbr int, file_name nvarchar, file_ext nvarchar, file_size numeric, file_type bit, file_enc nvarchar, file_data image, datetime0 datetime, datetime2 datetime, user_id0 int, user_id2 int`
- **`sysrpoptions`** · 1.052 dòng — Danh mục mẫu báo cáo/mẫu in: mã mẫu, tên song ngữ, mẫu mặc định, thứ tự, edition.
  <br>`form varchar, form_type varchar, form_id varchar, form_id2 varchar, form_name nvarchar, form_name2 nvarchar, form_df bit, form_order tinyint, edition char`
- **`sysuserlogs`** · 0 dòng — Ánh xạ spid ↔ user đang kết nối.
  <br>`sp_id int, user_id int`

### db `app` — phân quyền (bản chiếu xuống app)

Quyền gốc khai ở db `sys`; các bảng này là bản chiếu sang db `app` để câu truy vấn nghiệp vụ join được mà không phải nối chéo database.

- **`syssiterights`** · 0 dòng — Quyền của user trên từng kho (`ma_kho`).
  <br>`user_id int, ma_kho varchar`
- **`syssiterights2`** · 0 dòng — Bản thứ hai của `syssiterights`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, ma_kho varchar`
- **`sysstockrights`** · 0 dòng — Cờ quyền xem giá/tồn (`hd_yn`, `tt_yn`) của user.
  <br>`user_id int, hd_yn bit, tt_yn bit`
- **`sysstockrights2`** · 0 dòng — Bản thứ hai của `sysstockrights`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, hd_yn bit, tt_yn bit`
- **`sysunitlimits2`** · 0 dòng — Giới hạn theo đơn vị cơ sở, cùng bộ cờ quyền.
  <br>`user_id int, ma_dvcs varchar, r_new bit, r_edit bit, r_del bit, r_access bit`
- **`sysunitrights`** · 2 dòng — Quyền theo đơn vị cơ sở của user: new / edit / del / access.
  <br>`user_id int, ma_dvcs varchar, r_new bit, r_edit bit, r_del bit, r_access bit`
- **`sysunitrights2`** · 2 dòng — Bản mở rộng của `sysunitrights` (thêm bộ cờ `*2`). Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, ma_dvcs varchar, r_new bit, r_edit bit, r_del bit, r_access bit, r_new2 bit, r_edit2 bit, r_del2 bit, r_access2 bit`

### db `sys` — khai báo màn hình

Đây là nơi "màn hình FBO" thật sự sống. Một controller XML tham chiếu vào các bảng này; sửa XML mà không hiểu `sysfields`/`sysfilters` là sửa nửa vời.

- **`sysarrangement`** · 78 dòng — Bố cục màn hình của controller, lưu dạng nội dung.
  <br>`controller varchar, content nvarchar`
- **`sysarrangementcolumns`** · 7 dòng — Cột trong một bố cục: tiêu đề song ngữ, thứ tự, kiểu sắp xếp.
  <br>`id varchar, field varchar, i int, header nvarchar, header2 nvarchar, order_type varchar, order_id varchar`
- **`sysbutton`** · 3 dòng — Phím tắt do user gán: `key_code` → `command`.
  <br>`user_id int, key_code int, command varchar`
- **`syscontentfilters`** · 95 dòng — Nội dung khai báo riêng cho bộ lọc.
  <br>`id varchar, content nvarchar`
- **`syscontentgrids`** · 7 dòng — Nội dung khai báo riêng cho lưới (field + view).
  <br>`id int, name varchar, field nvarchar, view nvarchar`
- **`syscontents`** · 282 dòng — Kho nội dung khai báo theo `id` + `type` — thân của nhiều khai báo khác trỏ vào đây.
  <br>`id varchar, type varchar, content nvarchar`
- **`sysfields`** · 1.779 dòng — Khai báo TRƯỜNG của từng controller — 64 cột: `field`/`view` là biểu thức SQL, các bộ `ls*`/`lf*`/`lw*`/`li*`, `fs*`/`ff*`/`fw*`/`fi*`, `ss*`/`sf*`/`sw*`/`si*` là các lớp select/from/where/index xếp chồng. Bảng nặng nhất của tầng khai báo.
  <br>`controller varchar, id varchar, priority int, c bit, name varchar, field nvarchar, dependent varchar, d varchar, view nvarchar, ls01 varchar, ls02 varchar, ls03 varchar, ls04 varchar, ls05 varchar, lf01 varchar, lf02 varchar, lf03 varchar, lf04 varchar, lf05 varchar, lw01 varchar, lw02 varchar, lw03 varchar, lw04 varchar, lw05 varchar, li01 varchar, li02 varchar, li03 varchar, fs01 varchar, fs02 varchar, fs03 varchar, fs04 varchar, fs05 varchar, ff01 varchar, ff02 varchar, ff03 varchar, ff04 varchar, ff05 varchar, fw01 varchar, fw02 varchar, fw03 varchar, fw04 varchar, fw05 varchar, fi01 varchar, fi02 varchar, fi03 varchar, ss01 varchar, ss02 varchar, ss03 varchar, ss04 varchar, ss05 varchar, sf01 varchar, sf02 varchar, sf03 varchar, sf04 varchar, sf05 varchar, sw01 varchar, sw02 varchar, sw03 varchar, sw04 varchar, sw05 varchar, si01 varchar, si02 varchar, si03 varchar, include bit`
- **`sysfieldsgroup`** · 59 dòng — Nhóm trường dùng chung: bảng join, mệnh đề join, danh sách trường truy vấn.
  <br>`name varchar, data_type varchar, join_table varchar, query_join varchar, query_fields nvarchar, xgroup nvarchar, xgroup2 nvarchar, xgroup3 nvarchar, i int, require_name varchar, query_type tinyint`
- **`sysfilterdeclares`** · 3.550 dòng — Khai báo nguồn cho một điều kiện lọc: bảng, khoá, bảng tham chiếu, mệnh đề join.
  <br>`controller varchar, id varchar, name varchar, exname varchar, xtable varchar, fieldkey varchar, exfieldkey varchar, reftable varchar, reffieldkey varchar, joinclause varchar, conditionalreplace varchar`
- **`sysfilterfield`** · 1.211 dòng — Hành vi từng ô lọc trên màn hình: giá trị mặc định, ô nhận focus tiếp theo, cờ ngoại tệ / dữ liệu ngoài.
  <br>`controller varchar, field_name varchar, field_value varchar, focus_field varchar, default_value nvarchar, action_type varchar, nt_yn bit, external_yn bit`
- **`sysfilters`** · 1.299 dòng — Khai báo BỘ LỌC của controller: biểu thức field/view/query và mệnh đề thay thế.
  <br>`controller varchar, id varchar, priority int, c bit, xtype tinyint, name varchar, field nvarchar, view nvarchar, query nvarchar, replace nvarchar, category int`
- **`sysformfield`** · 222 dòng — Hành vi từng ô trên FORM nhập liệu (cùng bộ cột với `sysfilterfield`).
  <br>`controller varchar, field_name varchar, field_value varchar, focus_field varchar, default_value nvarchar, action_type varchar, nt_yn bit, external_yn bit`
- **`sysgridfield`** · 488 dòng — Hành vi từng cột trên LƯỚI nhập liệu.
  <br>`controller varchar, field_name varchar, default_value nvarchar, nt_yn bit, external_yn bit`
- **`sysrelative`** · 799 dòng — Quan hệ giữa các controller: `parent` và `list` con — nền của tra cứu "màn hình liên quan".
  <br>`controller varchar, type varchar, parent varchar, list varchar`
- **`sysrelativeright`** · 1.833 dòng — Quyền trên quan hệ controller.
  <br>`controller varchar, type int, parent varchar`
- **`systemplate`** · 136 dòng — Mẫu sinh khai báo: `pattern`, `parent`, `formula`, thứ tự và độ ưu tiên áp dụng.
  <br>`order int, priority int, code varchar, kind tinyint, pattern varchar, parent varchar, type tinyint, formula varchar`
- **`sysvouchertype`** · 65 dòng — Ánh xạ mã chứng từ `ma_ct` → loại và cặp `field`/`view`. Điểm nối giữa mã chứng từ và khai báo màn hình.
  <br>`ma_ct char, type tinyint, field varchar, view varchar`

### db `sys` — trường tự do

Cơ chế cho khách thêm trường mà không đổi cấu trúc bảng chuẩn.

- **`sysfreecolumns`** · 47 dòng — Cột tự do trên lưới: kiểu, style, tiêu đề, độ rộng, định dạng, làm tròn, cờ post/merge/import.
  <br>`id varchar, field char, type varchar, i int, style varchar, header nvarchar, header2 nvarchar, width int, format varchar, round int, order_type varchar, order_id varchar, allownulls_yn bit, client_default varchar, post_yn bit, merge_yn bit, import_yn char, order_id_import char, status_import bit`
- **`sysfreefields`** · 21 dòng — Trường tự do trên form: tiêu đề song ngữ, biểu thức field/view, bản riêng cho nhập khẩu và cho kiểm tra.
  <br>`id varchar, type varchar, header nvarchar, header2 nvarchar, field nvarchar, view nvarchar, i int, status char, field_dir nvarchar, view_dir nvarchar, merge_line nvarchar, category nvarchar, field_import nvarchar, view_import nvarchar, field_dimport nvarchar, view_dimport nvarchar, field_check nvarchar`
- **`sysfreereadonly`** · 8 dòng — Trường tự do bị khoá chỉ đọc theo controller + post.
  <br>`controller varchar, post_id varchar, field_id varchar`

### db `sys` — kiểm tra dữ liệu

Bộ quy tắc validate chạy trước khi ghi. Thêm một cảnh báo khi lưu thường là thêm dòng ở đây, không phải thêm code.

- **`syscheckcontents`** · 0 dòng — Nội dung thông báo kiểm tra (song ngữ).
  <br>`id varchar, content nvarchar, content2 nvarchar`
- **`syscheckdir`** · 0 dòng — Kiểm tra tồn tại trong danh mục: trường `field` của controller phải có trong bảng `table`.
  <br>`controller varchar, field varchar, table varchar, type char, order int, status char`
- **`syscheckfields`** · 6.503 dòng — Trường nào của chứng từ `ma_ct` chịu bộ kiểm tra nào, thuộc nhóm `gr_id`, thứ tự `stt_sx`. 6.5k dòng — bảng khai báo kiểm tra chính.
  <br>`ma_ct varchar, xtable varchar, field varchar, field_name nvarchar, field_name2 nvarchar, gr_id varchar, xtype tinyint, stt_sx int`
- **`syscheckgroupfields`** · 100 dòng — Nhóm kiểm tra: mã nhóm + tên song ngữ + thứ tự.
  <br>`gr_id varchar, gr_name nvarchar, gr_name2 nvarchar, stt_sx int`
- **`syscodechange`** · 16 dòng — Khai báo đổi mã ở tầng sys: trường liên quan, mã bị từ chối, mã trùng.
  <br>`code char, fields varchar, rejected varchar, duplicate varchar`

### db `sys` — báo cáo & mẫu in

- **`sysreport`** · 90 dòng — Danh mục báo cáo: tiêu đề song ngữ, có giới hạn quyền không, phân hệ, chế độ BI.
  <br>`id varchar, controller varchar, header nvarchar, header2 nvarchar, limit_right_yn bit, bi_mode char, ma_phan_he char, xmode char`
- **`sysreportformid`** · 2.527 dòng — Mẫu in của báo cáo: cờ PDF / Excel / song ngữ / ngoại tệ / dữ liệu ngoài.
  <br>`controller varchar, form_id char, header nvarchar, header2 nvarchar, limit_right_yn bit, pdf_yn bit, excel_yn bit, bilingual_yn bit, nt_yn bit, external_yn bit, form_id_ref varchar`
- **`sysreportformidright`** · 0 dòng — Quyền của user trên một mẫu in.
  <br>`user_id int, controller varchar, form_id char, r_limit bit`
- **`sysreportformidright2`** · 0 dòng — Bản thứ hai của `sysreportformidright`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, controller varchar, form_id char, r_limit bit`
- **`sysreportid`** · 3 dòng — Biến thể báo cáo theo `report_id`: danh sách cột lưới và cột truy vấn.
  <br>`controller varchar, report_id char, header nvarchar, header2 varchar, limit_right_yn bit, grid_fields varchar, query_fields varchar`
- **`sysreportidright`** · 0 dòng — Quyền của user trên một biến thể báo cáo.
  <br>`user_id int, controller varchar, report_id char, r_limit bit`
- **`sysreportidright2`** · 0 dòng — Bản thứ hai của `sysreportidright`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, controller varchar, report_id char, r_limit bit`
- **`sysreportright2`** · 0 dòng — Quyền báo cáo mức user, kèm dấu vết tạo/sửa.
  <br>`user_id int, controller varchar, datetime0 datetime, datetime2 datetime, user_id0 int, user_id2 int`

### db `sys` — phân quyền

- **`sysactionrights`** · 319 dòng — Quyền theo hành động: user × `ma_ct` × `action_id` → `right_yn`.
  <br>`user_id int, ma_ct char, action_id char, right_yn tinyint`
- **`sysactionrights2`** · 319 dòng — Bản có thêm `right_yn2`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, ma_ct char, action_id char, right_yn tinyint, right_yn2 tinyint`
- **`sysstatusrights`** · 0 dòng — Quyền sửa/xoá theo TRẠNG THÁI chứng từ: user × `ma_ct` × `status_id`.
  <br>`user_id int, ma_ct char, status_id char, r_del bit, r_edit bit`
- **`sysstatusrights2`** · 0 dòng — Bản thứ hai của `sysstatusrights`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, ma_ct char, status_id char, r_del bit, r_edit bit`
- **`sysvaluelimits`** · 0 dòng — User có bị áp giới hạn giá trị không.
  <br>`user_id int`
- **`sysvaluelimits2`** · 0 dòng — Bản thứ hai của `sysvaluelimits`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int`
- **`sysvaluelimitsdeclare`** · 175 dòng — Khai báo giới hạn theo menu/controller: cột lưới, cột truy vấn, bộ lọc mặc định và bộ lọc ẩn.
  <br>`wmenu_id char, wmenu_id0 char, controller varchar, grid_fields varchar, query_fields varchar, filter_form_default nvarchar, filter_form_hidden nvarchar, grid_form_hidden varchar, menu_id char, kind char`
- **`sysvaluelimitsdetail`** · 0 dòng — Giới hạn giá trị chi tiết theo controller.
  <br>`user_id int, controller varchar`
- **`sysvaluelimitsdetail0`** · 0 dòng — Bản gốc của giới hạn chi tiết, kèm dấu vết tạo/sửa.
  <br>`user_id int, datetime0 datetime, datetime2 datetime, user_id0 int, user_id2 int`
- **`sysvaluelimitsdetail2`** · 0 dòng — Bản thứ hai của `sysvaluelimitsdetail`. Xem ghi chú về cặp `X` / `X2`.
  <br>`user_id int, controller varchar`

### db `sys` — vận hành

- **`sysconnections`** · 0 dòng — Khai báo kết nối phụ: mô tả, IP, cờ online. **Không đọc/echo cột `connection`.**
  <br>`id varchar, connection varchar, description nvarchar, description2 nvarchar, ip varchar, online bit, status char`
- **`syslog`** · 1.044 dòng — Nhật ký hệ thống: thời điểm, user, chế độ, máy trạm, nội dung song ngữ.
  <br>`id numeric, date_time datetime, user_id int, n_mode varchar, hostname nvarchar, content nvarchar, content2 nvarchar`
- **`sysmaintenance`** · 2 dòng — Lịch bảo trì theo loại: ngày, số ngày, trạng thái.
  <br>`type char, logdate smalldatetime, logday int, logstatus char`
- **`sysnotice`** · 0 dòng — Thông báo hiện lên màn hình: controller, hành động, khoảng hiệu lực, nội dung song ngữ, số lần hiện tối đa.
  <br>`id int, controller varchar, action varchar, ngay_hl_tu smalldatetime, ngay_hl_den smalldatetime, mess_text nvarchar, mess_text2 nvarchar, max_num tinyint, status char, datetime0 datetime, datetime2 datetime, user_id0 int, user_id2 int`
- **`sysnoticeuser`** · 0 dòng — User nào đã xem thông báo nào, bao nhiêu lần.
  <br>`id int, user_id int, controller varchar, action varchar, check_yn bit, mess_count tinyint`
- **`sysnotify`** · 1 dòng — Mốc thời gian dọn thông báo.
  <br>`logtime datetime, clear char`
- **`syspara`** · 1 dòng — Tham số vận hành chung (một dòng).
  <br>`logdate smalldatetime, logday int, logstatus char`

