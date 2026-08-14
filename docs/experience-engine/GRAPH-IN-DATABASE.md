# Đồ thị sống trong Database — đề xuất thiết kế

Yêu cầu mới đảo bốn giả định nền của lược đồ hiện tại. Tài liệu này nêu từng xung đột, đề xuất
cách giải, và đánh dấu rõ chỗ nào cần chốt trước khi viết code.

## Xung đột 1 — Nguồn sự thật đảo chiều

`data/graph-schema.json` hiện khai:

> `sourceOfTruth.kind = "files"` — "Database chỉ là CHỈ MỤC dựng lại được — xoá DB không mất dữ
> liệu. Nhờ vậy mọi thay đổi đồ thị đều review được bằng git diff."

Yêu cầu mới: DB là nơi lưu thật, file local không phải giải pháp cho nhiều người dùng.

> **ĐÃ CHỐT**: toàn bộ dữ liệu vào DB, bỏ hẳn JSONL — kể cả tầng System. Git chỉ còn code.
> Bảng dưới giữ lại vì phân biệt System/Customize vẫn cần cho cách **tổ chức trong DB**
> (`scope`, nhịp cập nhật, ai được ghi), chỉ là cả hai cùng nằm ở DB.

| | **System** (thiết kế FBO chuẩn) | **Operational** (vận hành hằng ngày) |
|---|---|---|
| Nội dung | Menu, Controller, Table, SpVersion, Status, Capability của bản build chuẩn | Request + status, PMReview, kinh nghiệm, log gợi ý |
| Đổi khi nào | Mỗi bản SP — vài tháng một lần | Mỗi lần chạy report — nhiều lần một ngày |
| Ai ghi | Người bảo trì hub, có chủ đích | Mọi user, tự động |
| Giống nhau giữa user? | **Hoàn toàn giống** | Khác nhau theo dự án đang phụ trách |
| `scope` trong DB | `system` | `<ma_da>` |
| Nhịp ghi | Khi có SP mới, có kiểm soát | Mỗi lần chạy report |

Hệ quả của "bỏ hẳn JSONL":

- `data/graph/*.jsonl` (reference · capability · effort-samples · recommendation-feedback) và
  `ledger/<ma_da>/graph.jsonl` **biến mất**. `recommendations.jsonl` vừa làm cũng bỏ theo.
- `graph.mjs` đổi vai: đang là *đọc JSONL → sinh script*, thành *đọc DB → validate → ghi DB*.
- `sourceOfTruth.kind` đổi từ `"files"` sang `"database"`; mất khả năng review thay đổi tri thức
  sản phẩm bằng `git diff` — chấp nhận đánh đổi này để có một nguồn duy nhất cho nhiều người.
- Cần đường **seed lần đầu**: dữ liệu đang nằm trong JSONL (57 node, 19 cạnh) phải nạp vào DB
  một lần rồi mới xoá file. Không xoá trước khi nạp xong.

## Xung đột 2 — Nạp toàn bộ sẽ xoá dữ liệu của người khác

Hiện tại `reloadStrategy.kind = "full"`: `DELETE` sạch mọi bảng rồi `INSERT` lại. Với một người
thì đúng và đơn giản. Với nhiều người thì đây là **mất dữ liệu**: user B chạy report lúc 9h sẽ
xoá sạch phần user A vừa ghi lúc 8h.

**Đề xuất**: bỏ full reload, chuyển sang **upsert có phạm vi sở hữu**.

- Mỗi node/cạnh mang thêm `scope` (`system` | `<ma_da>`) và `capNhatLuc`.
- Một lần chạy chỉ được `MERGE` trong phạm vi nó sở hữu — user chạy N1,N2,N3 chỉ đụng
  `scope IN ('N1','N2','N3')`, không thấy và không xoá được N4,N5,N6.
- `DELETE` chỉ xảy ra trong phạm vi đó, và chỉ cho node không còn tồn tại ở nguồn.

Kéo theo: script sinh ra không còn idempotent theo kiểu "chạy hai lần ra file giống hệt" mà là
idempotent theo kiểu "chạy hai lần cho cùng TRẠNG THÁI DB". Bài test idempotency phải đổi theo.

## Xung đột 3 — System vs Customize không chỉ là nhãn

Ví dụ cụ thể: cùng một `sysid` (vd `CDTran`), bản chuẩn FBO có một cấu trúc, còn khách ACME
có bản `.xml` customize đè lên. Đó là **hai node khác nhau về nội dung nhưng cùng khoá**.

Lược đồ hiện tại có `Controller.customized` (bool) nhưng khoá node vẫn là `sysid` trần — nghĩa
là bản chuẩn và bản customize của mọi khách **đè lên nhau**, ai ghi sau thắng.

**Đề xuất**: khoá node tầng cấu trúc phải gồm cả phạm vi.

```
Controller.key = "system|CDTran"          ← bản chuẩn, theo SpVersion
Controller.key = "ACME|CDTran"         ← bản customize của khách
```

Tra cứu thì luôn hỏi hai lần: có bản customize của dự án này không, không có thì rơi về bản
system. Đúng mô hình `.f` vs `.xml` mà runtime FBO vốn đã dùng — chỉ là đưa nó vào đồ thị.

## Xung đột 4 — Kinh nghiệm hiện tại đo sai đơn vị

Hiện tại: `COUNT(nbphyc) GROUP BY (ma_lt1, menu_id)` — một UR = một đơn vị kinh nghiệm, gắn vào
`menu_id` ghi trên UR.

Vấn đề bạn nêu đúng chỗ đau: **`menu_id` trên UR không phản ánh việc thật sự đã làm**. UR trỏ
menu hệ thống nhưng nội dung là xử lý 3 chứng từ → kinh nghiệm thật nằm ở 3 chứng từ đó, không
nằm ở menu hệ thống. Cách đo hiện tại ghi nhận sai địa chỉ, và không có cách nào phát hiện.

**Đề xuất — kinh nghiệm ở mức HIỆN VẬT, không ở mức UR:**

```
Request (CHỈ trạng thái HT, UP)
   ↓ nguồn: noi_dung · menu_id · đầu mục (nbctdaumuc) · phiếu phân công
   ↓ phân giải qua từ vựng ĐÓNG của FBO (mã chứng từ, tên menu, tên bảng, sysid)
ExperienceFact — một dòng cho MỖI hiện vật thật sự bị đụng:
   { ma_lt1, loaiHienVat: chung-tu|menu|table|controller,
     khoaHienVat: 'HDA',  hanhDong: 'them-truong'|'sua-validate'|...,
     viTri: 'form nhập'|'proc post'|..., stt_rec, ma_da, ngayHoanThanh, doTinCay, nguon }
```

Một UR sinh ra **nhiều** ExperienceFact. UR ví dụ ở trên cho 3 dòng trên 3 chứng từ, không cho
dòng nào trên menu hệ thống.

**Vì sao phân giải được mà không cần đoán mò**: tên hiện vật của FBO là **từ vựng đóng** — mã
chứng từ, tên menu (`bar`), tên bảng, `sysid` đều là tập hữu hạn đã có sẵn trong
`data/fbo-capability.json`, `data/fbo-database.json` và chỉ mục controller. Dò một câu tiếng
Việt để tìm token thuộc tập đóng là việc xác định, không phải suy đoán. Cái KHÔNG xác định được
là **"sửa cái gì / sửa chỗ nào"** — đó là ngữ nghĩa tự do.

> **ĐÃ CHỐT sau khi quét dữ liệu thật** (xem mục đo bên dưới): thiết kế **lai**.
> - Tên hiện vật → **từ điển**, không cần LLM. `menu_id ↔ bar` rút từ chính lịch sử UR con.
> - `hanhDong` / `viTri` / tên trường → **LLM đọc `noi_dung`**, luôn ghi `doTinCay < 1`, chờ
>   PM duyệt mới thành fact chắc chắn. Core scoring vẫn không phụ thuộc LLM.
> - `nbctdaumuc.ma_daumuc` giữ vai trò **kiểm chứng chéo**, không phải nguồn duy nhất.

## Đo trên dữ liệu thật (bp_lt = 'FSD', 2026-08-13)

Quét `nbphyc` toàn bộ bộ phận FSD trước khi chốt thiết kế. Kết quả sửa lại hai điều tôi đoán sai
ở bản nháp trên.

| Chỉ số | Giá trị |
|---|---|
| Tổng UR | 91.973 |
| **HT + UP** | **74.826 (81%)** |
| Đang mở (DD/XN/TH) | 92 |
| UR có `menu_id` là **menu CHA** (`xx.00.00`) | **7.477 (10% của HT/UP)** |
| UR không có `menu_id` | 3 |
| UR có `noi_dung` > 300 ký tự | 27.477 (37%) |

Phân bố trạng thái: `UP` 72.937 · **`OK` 12.780** · `HT` 1.889 · `KL` 1.867 · `TA` 1.131 ·
`CH` 894 · `YC` 327 · `XN` 63 · `DT` 30 · `TH` 19 · `DD` 10.

**Sửa lại giả định 1 — cổng HT/UP KHÔNG làm corpus nhỏ lại.** Bản nháp trên viết "sẽ làm corpus
nhỏ lại đáng kể". Sai: HT+UP chiếm 81% toàn bộ lịch sử. Đây là phép **lọc rác** (bỏ TA/YC/KL/CH
— yêu cầu tạm, không làm, chờ), không phải phép thu hẹp.

**Sửa lại giả định 2 — nhưng `OK` đang bị bỏ sót, và đó là bằng chứng MẠNH HƠN `HT`.** Luồng
trạng thái là `TH → HT → DT → OK → UP`. `HT` = "Hoàn thành, **chờ test**" — yếu nhất trong nhóm
đã-làm-xong. `OK` = "Test OK" — đã có người xác nhận chạy được. Lọc đúng chữ `IN ('HT','UP')`
sẽ **vứt 12.780 UR ở `OK`** (gấp 6,8 lần số UR ở `HT`) trong khi vẫn nhận 1.889 UR ở `HT` yếu
hơn. Đề xuất lọc `IN ('HT','DT','OK','UP')` — xem mục cần chốt cuối tài liệu.

*(Ghi chú phụ: dữ liệu thật còn có mã `NH` (10), `CT` (3), `TL` (1) không có trong ảnh chụp
`data/qlda.json → enums.trangThaiYeuCau`. Số lượng không đáng kể nhưng ảnh chụp enum đã cũ.)*

### Bằng chứng cho việc `menu_id` nói dối — ca thật

`A000571322YC1` (dự án `DVDKB_FBO`, người làm `NV01`, trạng thái `HT`):

- `menu_id` ghi là **`07.00.00`** — menu CHA "Phải thu", không phải màn hình nào cụ thể.
- `noi_dung` (1.036 ký tự) liệt kê **7 chứng từ**: Hóa đơn bán hàng · Hóa đơn dịch vụ · Hóa đơn
  điều chỉnh giá hàng bán · Hóa đơn điều chỉnh giá dịch vụ · Hóa đơn giảm giá hàng hóa-dịch vụ ·
  Phiếu nhập hàng bán trả lại · Hóa đơn dịch vụ trả lại — **cộng** báo cáo "Bảng kê thuế đầu ra,
  đầu vào".
- Hành động: "Ở Tab Khác — Thêm trường Loại kê khai" (kèm 4 giá trị 1/2/3/9 và quy tắc post tệp thuế).

Cách đo hiện tại ghi nhận: *NV01 có 1 UR kinh nghiệm trên menu 07.00.00*. Sự thật: **8 hiện
vật bị đụng**, không cái nào là `07.00.00`. Đây đúng ca bạn mô tả, có thật trong dữ liệu.

### Chính DB tự cung cấp từ điển phân giải

Cùng khối công việc đó còn được ghi thành các UR con — `A000571448` → `07.10.08` "Hóa đơn dịch
vụ", `A000571449` → `07.10.06` "Hóa đơn bán hàng", `A000571450` → `07.10.19` "Hóa đơn điều chỉnh
giá hàng bán", `A000571451` → `07.10.20`, `A000571452` → `07.10.21`, `A000571454` → `07.10.23`.

Nghĩa là ánh xạ **tên chứng từ ↔ `menu_id`** có sẵn trong chính lịch sử, không phải xây tay. Đây
là từ điển để phân giải các UR cha kiểu `07.00.00`, và là cách **kiểm chứng** kết quả LLM rút ra.

### Nội dung UR có cấu trúc hơn tưởng

Mẫu thật cho thấy động từ và vị trí lặp lại theo khuôn:

- Hành động: `Thêm trường …` · `Ẩn trường …` · `Thêm 1 cột …` · `bổ sung thêm trường …` ·
  `Sửa lỗi mẫu in …`
- Vị trí: `Ở Tab Khác` · `bên tab đơn vị` · `bên tab thông tin xuất hóa đơn` · `Điều kiện lọc`
- Có ca ghi cả kiểu dữ liệu: *"Thêm trường Thông tin công nợ **NVARCHAR(4000)** bên tab thông
  tin xuất hóa đơn"* (`A000571172YC1`).
- Có ca ghi cả tiền lệ: *"(Chỉnh sửa giống dự án **NVLSAM**)"*, *"phiên bản **FBOSP229** đã có
  chỉnh sửa phần này"* — tín hiệu trực tiếp cho câu hỏi "ai/dự án nào đã làm việc này rồi".

**Kết luận cho câu hỏi phân giải**: LLM là đúng công cụ cho phần `hanhDong`/`viTri`, vì nội dung
là văn xuôi tự do nhưng có khuôn. Tên hiện vật thì **không cần LLM** — nó là từ vựng đóng, khớp
được bằng từ điển `menu_id ↔ bar` rút từ chính lịch sử. Thiết kế lai: từ điển làm phần chắc
chắn, LLM làm phần ngữ nghĩa và luôn mang `doTinCay < 1` cho tới khi PM duyệt.

**Không dùng `tg_dk_th` làm tín hiệu**: toàn bộ mẫu quan sát được đều bằng `.00` — trường giờ dự
kiến không được điền trên thực tế.

## Xung đột 5 — Ai được ghi vào DB, và ghi bằng gì

Hub zero-dependency: Node không nói chuyện trực tiếp với SQL Server. Đường ghi duy nhất đang có
là `sqlcmd` (qua `mcp/fbo/lib/sql.mjs`), và tool `query_sql` đã có cờ `allowWrite`.

Nghĩa là **kỹ thuật thì ghi được ngay**, không cần thêm dependency. Nhưng phát sinh:

- Mọi user cần quyền ghi trên `GRAPH_4AI` (hiện `graphConnectionString` là tuỳ chọn, nhiều máy
  chưa khai — `4ai doctor` sẽ phải coi đây là lỗi thay vì cảnh báo).
- Ghi qua `sqlcmd` là gọi tiến trình ngoài: chậm hơn, và một lần chạy report sẽ sinh nhiều câu.
  Gom thành một batch có `BEGIN TRAN` là bắt buộc, không ghi rời từng dòng.
- Không có transaction xuyên nhiều lần gọi — thiết kế phải chịu được đứt giữa chừng
  (upsert idempotent giải quyết được điều này).

## Điểm cần chốt trước khi code

**Cổng trạng thái: `HT,UP` hay `HT,DT,OK,UP`?** Chỉ đạo là "HT, UP", nhưng đo trên dữ liệu thật
thì luồng là `TH → HT → DT → OK → UP`, và `OK` có **12.780 UR** — nhiều gấp 6,8 lần `HT`
(1.889). `OK` = "Test OK", tức đã có người xác nhận chạy được, **mạnh hơn** `HT` = "Hoàn thành,
chờ test". Lọc đúng chữ `IN ('HT','UP')` sẽ nhận bằng chứng yếu và bỏ bằng chứng mạnh.

Đề xuất `IN ('HT','DT','OK','UP')` — vẫn đúng nguyên tắc "chỉ tính việc đã làm xong", chỉ là
không thủng ở giữa luồng. Cần bạn xác nhận vì đây là đi khác chỉ đạo.

## Thứ tự triển khai đề xuất

1. **Lược đồ**: thêm `scope` + `capNhatLuc`, đổi khoá node cấu trúc, đổi `reloadStrategy` sang
   upsert. Sinh script `MERGE` thay vì `DELETE`+`INSERT`.
2. **Đường ghi**: hàm ghi batch qua `sqlcmd`, có transaction, idempotent. `doctor` kiểm quyền ghi.
3. **Đồng bộ tăng dần**: mỗi lần chạy report chỉ cập nhật `trang_thai`/`noi_dung`/`ma_lt1` của UR
   trong phạm vi, giữ nguyên phần cấu trúc đã phân giải — đúng yêu cầu "C đọc ngay, không build lại".
4. **ExperienceFact**: phân giải hiện vật từ UR ở HT/UP, ghi vào DB.
5. **Chuyển `assignee.mjs`** sang chấm điểm trên ExperienceFact thay vì `COUNT` theo `menu_id`.
6. **Bỏ `recommendations.jsonl`**, chuyển log gợi ý vào DB cùng cơ chế.

Bước 1–2 là nền, không có thì các bước sau không đứng được. Bước 4–5 là phần đổi hành vi rõ
rệt nhất với PM (điểm số ứng viên sẽ khác hiện tại).
