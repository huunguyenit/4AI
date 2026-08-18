# Changelog

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/). Version đánh theo mốc bàn giao
beta nội bộ, chưa theo semver nghiêm ngặt vì dự án chưa có `package.json`.

## [Chưa phát hành]

### Thêm — kho hướng dẫn lập trình thực chiến

- **Node kind `Playbook` + `4ai playbook add|search` + tool MCP `playbook_add`/`playbook_search`.**
  `ExperienceFact` do máy rút chỉ trả lời được "ai đã đụng vào hiện vật nào" — không có một chữ
  nào về CÁCH làm, vì `nbphyc.noi_dung` là lời khách yêu cầu chứ không phải nhật ký sửa code.
  Kho mới do người viết: LT kể, PM ghi (node giữ riêng `nguonLt` và `nhapBoi` — gộp làm một là
  mất dấu người thật sự biết việc).
  - **Tra bằng `sysid`/`menu_id`/`bang`/`tags`, KHÔNG bằng `ma_da`.** `ma_da` chỉ là xuất xứ.
    Lọc theo dự án đang rà soát là tự tay chặn đúng công dụng của tính năng — cả kho sinh ra để
    dự án mới dùng lại kinh nghiệm dự án cũ.
  - **Bắt buộc có ít nhất một neo tra cứu**, chặn ngay ở `kiemEntry()` chứ không ghi rồi thôi:
    hướng dẫn không neo vào hiện vật nào thì nằm trong DB mà không lần tra nào chạm tới.
  - Khớp qua `menu_id` hiện trên báo cáo là **khớp yếu** kèm giải thích — cùng lý do đã ghi ở
    `ExperienceFact`: đo trên DVDKB_FBO, 25 giá trị `menu_id` thì đúng 1 tồn tại trong cây menu
    thật của khách.
  - Hướng dẫn tự hiện ở tab "Gợi ý kỹ thuật" của báo cáo rà soát, ghép theo hiện vật của từng UR.
- **`4ai playbook edit` — sửa từng trường, không ghi đè cả dòng.** `MERGE` ghi đè TOÀN BỘ cột từ
  lô, nên gõ lại `add` chỉ để thêm `--from` mà quên `--warn` sẽ xoá trắng `canhBao` — im lặng,
  `kiemEntry` không biết cái gì "đáng lẽ phải còn đó". `edit` đọc dòng cũ rồi chỉ đè trường được
  truyền; cờ **vắng mặt** = giữ nguyên, chuỗi **rỗng tường minh** (`--warn ""`) = xoá. Node
  `parseArgs` phân biệt sẵn hai trạng thái đó, nhờ vậy xoá là việc phải GÕ RA chứ không xảy ra do
  quên. Tiêu đề nằm trong khoá nên `edit` từ chối đổi nó (đổi tên trong chế độ ghi bổ sung sẽ để
  dòng cũ nằm lại mà không ai gọi được nữa). `nhapBoi`/`ngayNhap` giữ nguyên của lần ghi ĐẦU —
  ai vừa sửa đã nằm ở cột audit `capNhatBoi`/`capNhatLuc`.

  Bốn lỗi chỉ lộ ra khi ghi entry ĐẦU TIÊN lên DB thật — đường ghi báo thành công, đường đọc trả
  rỗng hoặc rác, và `docPlaybook` nuốt lỗi nên không có gì chỉ ra vì sao:
  - **Cạnh `HAS_PLAYBOOK` không bao giờ được tạo.** Đầu `Request` viết thành `Request:<ma_da>|
    <stt_rec>`, nhưng `Request` KHÔNG phải kind scoped (khoá là `stt_rec` trần) — phép JOIN lúc
    nạp không khớp dòng nào và cạnh lặng lẽ không sinh ra, script vẫn báo chạy xong. Hai đầu một
    cạnh phải viết theo đúng cờ `scoped` của từng kind, giống `graph-sync.mjs` và
    `recommendation-log.mjs` vẫn làm.
  - **Select cột `key` không tồn tại.** Khoá của bảng node là `id`; `sql.keyColumn` trong schema
    nói về view đồ thị chứ không phải bảng node.
  - **`cachLam` nhiều dòng phá vỡ TSV của `sqlcmd`.** Nó BẢN CHẤT là nhiều dòng — đó là các bước
    làm. Một bản ghi bị đọc thành 4 dòng rác. Mã hoá LF thành sentinel rồi khôi phục ở JS; khác
    `experience-build.mjs` (ở đó thay bằng khoảng trắng là đủ) vì ở đây xuống dòng là THÔNG TIN.
  - **`sqlcmd` cắt nvarchar(max) ở 256 ký tự, âm thầm.** `-W` (bắt buộc để parseTsv chạy) loại
    trừ nhau với `-y` nên không sửa được ở tầng `execSql`. Vòng qua bằng cách chia mảnh
    `CAST(SUBSTRING(...) AS NVARCHAR(200))` rồi ghép ở JS, kèm cột `LEN` để **nói ra** khi nội
    dung vượt trần thay vì trả bản cụt như thể đủ.
  - `docPlaybook` giờ có `neLoi: false` cho đường tra cứu do người gõ (`playbook search`, tool
    MCP): ở đó im lặng là tai hại — một câu SQL sai trông y hệt một kho rỗng, và người dùng sẽ
    gõ lại hướng dẫn tưởng lần trước chưa ghi được. Đường báo cáo vẫn nuốt lỗi như cũ.

### Thêm — gợi ý kỹ thuật thành prompt cho AI

- **Mục `prompt-ky-thuat` đứng đầu tab "Gợi ý kỹ thuật".** Mỗi UR một prompt dán thẳng vào
  Claude Code, gộp bối cảnh + kinh nghiệm thực chiến đã có + luồng dữ liệu + việc cần làm. Ba
  mục bên dưới là cùng nội dung đó bày ra để đọc bằng mắt. Trước đây prompt chỉ có ở mục "Luồng
  dữ liệu" và chỉ mang `luongDuLieu` — người sắp code phải tự ghép lại từ ba chỗ.
- **Script SQL CỐ Ý không vào prompt.** Nó là đầu ra XÁC ĐỊNH của `tools/lib/ddl.mjs` (cùng đặc
  tả → cùng script từng byte), mà đó cũng là thứ hỏng ngay khi cho model đọc: model sẽ "cải
  thiện" tên cột, đổi kiểu, thêm index — mỗi lần một khác, không còn đối chiếu lại được với đặc
  tả. Prompt thay vào đó có khối `NGOÀI PHẠM VI PROMPT NÀY` nói rõ script nằm ở đâu, chạy nguyên
  văn, và muốn đổi thì sửa đặc tả `ddl` rồi sinh lại chứ đừng sửa script.
- Hộp prompt cũ ở mục "Luồng dữ liệu" bỏ đi — một UR có cả hai sẽ hiện hai hộp và người đọc
  không biết dán cái nào. Phần phân nhánh "tính năng mới vs sửa màn hình có sẵn" của
  `promptCuaUr` tách thành `khoiDichVaViec()` để hai prompt dùng chung một nguồn: nhân đôi nó là
  cách chắc chắn nhất để hai prompt dạy hai điều khác nhau về cùng một UR.

### Sửa lỗi — trang trôi ngang ở bề rộng điện thoại

- **Mọi bảng bọc trong khung cuộn riêng (`.tw`).** Bảng 8 cột không thể vừa 375px, và khi tràn
  thì cả TRANG trôi ngang chứ không phải mình nó — người đọc mất luôn cột trái làm mốc.
- **URL trong `noi_dung` UR ngắt được.** Nó là một token không có chỗ ngắt tự nhiên; ở bề rộng
  điện thoại nó đẩy cả trang. Chỉ mở `overflow-wrap` cho link, không đụng văn xuôi thường.
- Sau khi sửa: 0 tràn ngang ở 375px và 1280px, trên cả ba tab.

### Sửa lỗi — hướng dẫn không tới được chính UR nó viết cho

- **Bỏ luật "hướng dẫn của chính UR đang xét thì giấu đi".** Luật đó dựa trên một giả định
  ngầm sai: rằng hướng dẫn luôn được ghi SAU khi làm xong, nên hiện lại chỉ là tiếng vọng. Thực
  tế UR ở `DD` là việc CHƯA làm, và cách làm ghi cho nó chính là chỉ dẫn cho người sắp bắt tay
  vào — đúng chỗ cần nó nhất thì lại là chỗ duy nhất bị giấu. Ca thật: HOATP UR10 (fcode1 `10`,
  DD) có hướng dẫn ghi đích danh mà tab "Gợi ý kỹ thuật" trống trơn. Giờ nó hiện đầu danh sách
  với nhãn riêng "cách làm ghi cho chính yêu cầu này", tách bạch với kinh nghiệm mượn từ dự án
  khác; thứ tự ưu tiên thành `chinh-ur` → `sysid` → `menu_id`.
- **Câu tra có thêm nhánh `stt_rec`.** Trước đó chỉ lọc theo `sysid`/`menu_id`, nên hướng dẫn
  chỉ neo bằng `tags` không bao giờ được lấy về cho chính UR nó được viết cho.

### Sửa lỗi — đường ghi từng bản ghi làm mất dữ liệu

- **`emitSql()` có thêm chế độ `boSung`.** Chế độ mặc định hiểu lô đang ghi LÀ toàn bộ sự thật
  của các scope trong đó, và xoá mọi dòng cùng scope không có mặt trong lô. Đúng với `graph
  build`/`graph experience`/đường báo cáo (chúng quét lại từ đầu), nhưng sai chí mạng với đường
  ghi từng bản ghi một: `playbook add` lần hai sẽ xoá hướng dẫn ghi lần đầu của cùng dự án — im
  lặng, không lỗi. `boSung: true` bỏ mọi `DELETE` và chuyển chèn cạnh sang chèn-nếu-chưa-có.
  Chế độ mặc định không đổi; `tests/test-playbook.mjs` ghim cả hai chiều.

### Sửa lỗi — URL `4ai serve`

- **`serve /review` in ra và mở đúng địa chỉ trang.** Trước đây ghép thẳng đối số vào gốc URL
  nên ra `http://127.0.0.1:<port>//review` (hai dấu gạch), và qua Git Bash trên Windows còn tệ
  hơn: shell dịch `/review` thành `C:/Program Files/Git/review` trước khi node nhìn thấy — đúng
  câu lệnh mà tài liệu agent đang bảo chạy. Giờ alias được phân giải NGAY ở CLI thành đường dẫn
  thật (`/review/<ngay>/_tong/tong.html`) thay vì để server trả 302, nên URL copy được từ
  terminal mở lại đúng trang ở phiên sau.

### Sửa — báo cáo rà soát đọc sai ý

- **Nhãn KPI viết lại.** `chờ cổng PM (DD)` → **Chờ duyệt**, `giai đoạn chưa chốt hẹn` →
  **Chưa chốt hẹn**, `yêu cầu trong phạm vi` (không rõ nghĩa ở thẻ đó) → **UR đang theo dõi**.
  Phần định lượng ("≤ 3 ngày LV", "DD/XN/TH", "UR ở DD") xuống dòng phụ: nhồi điều kiện vào
  chính cái nhãn thì con số to bên trên mất chỗ dựa.
- **Thẻ dự án nói vì sao bị xếp "Cần chú ý".** HUM và PSL_DKVN hiện nhãn đó bên cạnh ba số 0
  (quá hạn / sắp tới / chờ duyệt) vì lý do thật — giai đoạn chưa tick chốt đã hẹn — không nằm
  trong ba con số đang hiện. Thẻ giờ có dòng lý do và đếm luôn cả "chưa chốt hẹn" + tổng UR.
- **Tab Tổng quan liệt kê ĐỦ UR ở DD/XN/TH.** Trước đây chỉ có danh sách việc gấp, nên dự án
  không có mục nào quá hạn/sắp tới/chờ duyệt thì KPI báo "1 UR đang theo dõi" mà cả trang không
  chỉ ra được UR nào. UR chưa tới hạn đi bằng token màu `--calm` (xám xanh trầm) kèm nhãn chữ
  `CÒN HẠN` — dịu mắt nhưng vẫn đọc được mức độ khi in đen trắng.

### Sửa — tương phản màu dưới ngưỡng WCAG AA

Phát hiện khi đo lại toàn trang sau các thay đổi trên; đều là lỗi có sẵn, nhưng nhãn và chú
thích mới dùng chung đúng những token đó nên sửa luôn:

- `--bad` `#DC2626`→`#B91C1C`, `--warn` `#D97706`→`#B45309`, `--ok` `#059669`→`#047857`. Bộ cũ
  đạt ngưỡng 3:1 cho con số KPI 34px nhưng chỉ được 3,0–4,4:1 ở nhãn 10–12px dùng chung token.
- Dark mode: `.pill` và chip đang chọn lấy `--dd`/`--xn`/`--primary` (vốn là màu CHỮ trên nền
  tối) làm NỀN với chữ trắng — nhãn trạng thái `XN` chỉ còn 1,85:1. Đảo chữ sang màu nền trang.
- **`.pill` không có nền mặc định.** Nó đặt `color: #fff` rồi trông chờ class biến thể
  (`.tt-dd`/`.tt-xn`/`.dx`) cấp nền. Nhãn vai trò ("PM", "phó phòng") ở bảng gợi ý phân công gọi
  `<span class="pill">` trần — chữ trắng nằm thẳng trên nền ô, 1,23:1, tức là **không đọc được
  chữ nào**. Nền mặc định giờ nằm ở chính `.pill`, không phụ thuộc lời gọi có nhớ thêm class.
- `--th` `#0D9488`→`#0F766E`: chữ trắng trên nhãn trạng thái `TH` chỉ đạt 3,74:1.
- Hàng ứng viên số 1 ở bảng phân công tô bằng `--track` (`#E2E8F0`) — quá tối để `--mut` (3,86:1)
  và `--warn` (4,07:1) đọc được trên đó. Đổi sang `--calm-bg` và chữ phụ dùng `--calm`.
- Sau khi sửa: 0 vi phạm ở cả light lẫn dark, trên trang tổng và cả ba tab của trang dự án.

## [v0.4.0] — 2026-08-14

### Sửa lỗi — trạng thái mất theo phiên Cowork

- **`stateRoot()` tách khỏi `dataRoot()`.** `${CLAUDE_PLUGIN_DATA}` không bền như tên gọi: trong
  Cowork nó nằm trong thư mục của TỪNG PHIÊN. Đo được, không phải suy đoán — thư mục phiên
  hôm trước biến mất cùng `license.json` kích hoạt lúc 13:33 và `qlda.local.json` khai lúc 13:44;
  phiên kế tiếp phải kích hoạt lại giấy phép và khai lại kết nối từ đầu. Từ nay:
  - `dataRoot()` giữ nguyên cho thứ **dựng lại được** (index SQLite).
  - `stateRoot()` cho thứ **không dựng lại được** — `data/license.json`, `data/qlda.local.json`,
    `ledger/` — mặc định `%APPDATA%/4ai` khi chạy như plugin, vẫn là hub khi chạy từ mã nguồn
    (hành vi dev không đổi). Chốt bằng `FBO_STATE_ROOT` khi cần.
  - `stateFile()` **copy một lần** từ vị trí cũ khi nơi mới chưa có, nên bản cài hiện hữu không
    mất giấy phép sau khi cập nhật. Copy chứ không move: rollback về bản cũ vẫn chạy.
  - Không nhớ "đã di chuyển" trong biến module — `fs.existsSync` đã là câu trả lời, rẻ hơn cái
    giá của bộ nhớ ẩn. Bản đầu có `Set` memo và nó làm `test-sql-conn` đỏ theo đúng kiểu khó dò
    nhất: đọc mãi bản copy đầu tiên sau khi data root đổi.
- **Test không còn ghi vào thư mục người dùng thật.** Bốn test chỉ trỏ `FBO_DATA_ROOT` vào thư
  mục tạm; sau khi tách gốc, chúng bắt đầu ghi cấu hình giả (`TEST_APP`, `\\test-share\...`) vào
  `%APPDATA%/4ai` — nơi plugin thật đọc, tức là test làm hỏng cấu hình máy dev. Cả bốn giờ chốt
  luôn `FBO_STATE_ROOT`. Thêm `tests/test-state-root.mjs` ghim: hub không đổi hành vi, hai gốc
  tách nhau khi chạy như plugin, có di chuyển, không ghi đè bản mới, và không nhớ ngầm giữa các
  lần đổi data root.
- **`tests/test-setup.mjs` chạy được trở lại** — thiếu `import { fileURLToPath }`, ném
  `ReferenceError` ngay dòng đầu nên cả file chưa từng chạy (lỗi có sẵn, không phải do thay đổi này).

### Sửa lỗi — bề mặt không có shell (chat/Cowork)

Rút từ một phiên `/4ai:pm-review` chạy thật trên Cowork: báo cáo cuối cùng ra được, nhưng mất
bốn lượt hỏi-đáp và ba lần "retry" mù cho những thứ lẽ ra tool phải tự nói.

- **Tool MCP `doctor` (mới).** `4ai doctor` trước giờ chỉ sống ở CLI — mà bề mặt hay hỏng cấu
  hình nhất lại đúng là bề mặt không có shell. Không có nó thì khi một tool báo "chưa khai kết
  nối", cả PM lẫn trợ lý đều không phân biệt được: khai nhầm file, đặt biến môi trường sau khi
  tiến trình đã chạy, hay gõ sai tên khoá — nên chỉ còn cách thử lại và đoán. Tool trả về data
  root đang dùng, **đường dẫn thật** của `qlda.local.json` được đọc, **tên** khoá đã khai (không
  bao giờ giá trị), nguồn kết nối app/sys/đồ thị, danh tính PM, giấy phép, sqlcmd, thư mục
  ledger, kèm `goiY[]` là các bước sửa cụ thể. Chạy được **khi chưa có giấy phép** — cùng nhóm
  với `license_status`/`license_activate`, vì chẩn đoán mà bị chặn thì vô dụng đúng lúc cần nhất.
  Hàm `nguonKetNoiGraph()` viết cho `doctor` từ trước nhưng chưa ai gọi, giờ mới thật sự có lối ra.
- **`doctor` phân biệt "đã khai" với "dùng được".** Một chuỗi kết nối đồ thị có `Data Source`
  nhưng thiếu `Initial Catalog`, trong khi `graph4aiDatabaseName` cũng chưa khai, vẫn hiện là
  nguồn `env` — nhìn thì ổn, mà mọi truy vấn đồ thị đều ném lỗi. Đây đúng là ca đã xảy ra: PM
  khai đủ biến môi trường, `app`/`sys` chạy ngon (chuỗi của chúng có `Initial Catalog`), riêng
  `graph` hỏng, và không có gì chỉ ra tại sao. Giờ `doctor` chạy đúng bước phân giải (KHÔNG mở
  kết nối) qua `kiemTraKetNoiGraph()`, trả thêm `nguonKetNoi.graphSanSang` và đẩy nguyên thông
  báo lỗi có chỉ dẫn vào `goiY`.
- **Thông báo lỗi thiếu kết nối giờ chỉ đúng file phải sửa.** `resolveGraphConn()` từng bảo
  "chạy `node tools/4ai.mjs setup`" — vô nghĩa ở nơi không có `node` — và nhắc `data/qlda.local.json`
  bằng đường dẫn tương đối, trong khi trên máy có tới ba bản sao cùng tên mà chỉ bản trong data
  root được đọc. Giờ in **đường dẫn tuyệt đối** của bản có tác dụng, nói rõ sửa file thì ăn ngay
  còn đổi biến môi trường thì phải khởi động lại host, và trỏ sang `doctor`. Cùng cách chữa cho
  lỗi thiếu `Initial Catalog` và lỗi chuỗi kết nối QLDA không có `Data Source`.
  `duongDanQldaLocal()` tách ra từ `localConnString()` để một chỗ tính đường dẫn, mọi nơi dùng lại.
- **`render_review_report` trả `trangChinh`** — đường dẫn **tuyệt đối** của `tong.html`
  (hoặc `review.html` khi có `project`). Trước chỉ có `relPath` trong `files[]`, nên ở Cowork —
  nơi ledger nằm ngoài mọi thư mục người dùng mở được — không ai chỉ tới được file vừa dựng.
  Trường `xem` cũng thôi khuyên "mở HTML" ở bề mặt không mở được: nói thẳng là đừng thử `Read`
  nó, phân tích từ `ddUR`, và muốn file cầm được thì ghi bản phân tích ra thư mục phiên.
- **`/pm-review` (v9 → v10) chọn bề mặt TRƯỚC.** Bản v9 mở đầu bằng "Giao [pm-deadline-review]"
  rồi mới nêu nhánh không-shell ở dưới, nên trên Cowork trợ lý vẫn spawn sub-agent — mà sub-agent
  ở đó không được cấp Bash, nên nó dừng lại xin quyền và mất trắng một lượt. Giờ câu hỏi "bề mặt
  này có chạy được `node` không" đứng đầu, hai nhánh nằm sau nó, và có thêm mục xử lý tình huống
  "báo thiếu cấu hình mà người dùng nói đã khai rồi" → gọi `doctor` một lần thay vì bảo thử lại.

### Bảo mật

- **Dọn định danh hạ tầng nội bộ khỏi repo — chuẩn bị publish Cursor Marketplace công khai.**
  Cursor yêu cầu plugin **open source** và review thủ công cả repo, nên mọi thứ trong này là
  nội dung công khai.
  - **Tên database và đường dẫn share thành TOKEN.** `data/qlda.json` và `data/graph-schema.json`
    giờ giữ `{QldaDatabaseName}`, `{QldaSysDatabaseName}`, `{QldaProgramPath}`,
    `{Graph4aiDatabaseName}`, `{AttachmentsFileStoreRoot}`; giá trị thật do TỪNG MÁY khai vào
    `data/qlda.local.json` (đã gitignore) qua `4ai setup` — cùng cơ chế overlay mà `{PMName}`/
    `{PMDept}` vốn dùng, thêm ở `qlda-metadata.mjs`.
  - **Bỏ fallback tên DB ghi cứng trong `sql.mjs`.** Chưa khai thì **báo lỗi có chỉ dẫn**, không
    âm thầm nối vào một tên đoán được — sai DB mà vẫn chạy là kiểu hỏng khó dò nhất. `laQldaProgram()`
    cũng không so đường dẫn khi token chưa gán: khớp nhầm là chạy SQL của khách trên DB nội bộ.
  - **Tên khách, mã nhân viên, IP share nội bộ** trong asset/test/docs/comment đổi sang ví dụ
    trung tính (`ACME`, `DEMO1`, `PM01`/`NV01`, `10.0.0.1`). Ví dụ minh hoạ lấy từ khách thật —
    không phải hư cấu như vẻ ngoài.
  - **`ledger/` bị gỡ khỏi git tracking** — 14 file báo cáo rà soát của khách thật (tên khách,
    nội dung UR, mã nhân viên) vẫn bị track dù `.gitignore` đã có dòng `ledger/`: gitignore
    không có tác dụng với file ĐÃ track. Cùng lớp lỗi với `.4ai/scratch/` bên dưới.
  - **`.4ai/graph/{PMDept}_4AI.sql` → `.4ai/graph/graph-4ai.sql`** — tên file script sinh ra
    không còn suy từ mã bộ phận (chính đường này làm tên DB thật rò vào bản build `.claude/`,
    `.cursor/`, `.github/`, `.agents/`).

- **Gỡ `.4ai/scratch/` khỏi git tracking — thư mục này chứa dữ liệu khách THẬT** (tên khách,
  mã nhân viên, nội dung UR chi tiết) từ một lần chạy `render_review_report`/
  `get_review_dataset` bị `git add` nhầm ở commit `a713fdd`. Repo `huunguyenit/4AI` public
  trên GitHub tại thời điểm đó nên dữ liệu đã bị lộ ra ngoài — đã chuyển repo về **private**
  ngay khi phát hiện. Thêm `.4ai/scratch/` vào `.gitignore` (cùng nhóm với `.4ai/cache|ledger|
  index|graph` vốn đã bị chặn — thư mục tạm này lẽ ra phải nằm trong danh sách đó từ đầu).
  - File đã gỡ khỏi tracking **tại HEAD**, KHÔNG rewrite lịch sử git — dữ liệu vẫn còn trong
    các commit cũ, ai có bản clone/fork từ trước vẫn đọc được qua `git log`. Rewrite lịch sử
    (force-push) là quyết định riêng, cần xác nhận thêm trước khi làm.
  - Không ảnh hưởng dữ liệu trên máy — file vẫn còn nguyên trên đĩa, chỉ không còn track.

### Thêm

- **Giấy phép offline cho gói phân phối.** Public key đi kèm gói
  (`data/license-public-keys.json`), private key ở máy phát hành; người dùng gửi **Device ID**,
  Fast Source ký một JSON gắn đúng máy đó, người dùng lưu lại là chạy được. Ed25519 qua
  `node:crypto`, **không thêm dependency** nào.
  - **Không gọi mạng, không máy chủ kiểm tra** — máy khách thường không ra được Internet, và
    một MCP server treo vì chờ HTTP còn hỏng nặng hơn cả việc không có giấy phép.
  - **Device ID** (`XBZ3E-SQ33C-K8R5F-0Y1TC`) = base32 của SHA-256 trên định danh **cài đặt
    HĐH** (MachineGuid trên Windows, `/etc/machine-id` trên Linux, IOPlatformUUID trên macOS),
    lùi về địa chỉ MAC rồi tên máy. Chọn định danh HĐH chứ không phải MAC vì MAC đổi khi cắm
    thêm card hay dựng VPN — Device ID nhảy là giấy phép chết oan. Giá trị thô **được băm trước
    khi ra khỏi tiến trình**: chuỗi gửi cho Fast Source không lộ MachineGuid hay MAC.
  - **Chặn ở `tools/call`, không chặn lúc khởi động.** Chặn lúc khởi động thì client chỉ thấy
    server chết, không còn chỗ nào hiện Device ID; chặn ở đây thì `tools/list` vẫn đủ tool và
    mỗi lần gọi trả về đúng các bước gỡ. Hai tool `license_status` / `license_activate` **luôn**
    chạy được — không thì bề mặt không có shell (chat/Cowork) không có đường nào kích hoạt, y
    như lý do `set_pm_identity` tồn tại.
  - **CLI**: `4ai license` (trạng thái + Device ID) · `license id` · `license import <file>` ·
    `license path`; phía phát hành có `license keygen` và `license issue`. Lệnh runtime
    (`report`, `serve`, `graph`) qua cùng một cổng; **compiler không bị chặn** (`check`, `sync`,
    `list`, `explain`, `targets`, `doctor`, `setup`) — ai có mã nguồn hub thì giấy phép không
    còn là hàng rào, chặn chỉ tổ làm người phát triển kẹt.
  - **Verify trước, ghi sau**: giấy phép sai máy / hết hạn / sai chữ ký **không để lại file**.
    Lưu rồi mới báo lỗi thì lần chạy sau người dùng thấy "đã có lic mà vẫn chặn" và không có
    cách nào lần ra nguyên nhân.
  - Hạn mặc định khi cấp là **365 ngày**, muốn vĩnh viễn phải gõ `--forever` — không có máy chủ
    kiểm tra nên bản cấp nhầm là **không thu hồi được**.
  - `data/license.json` và `*.pem` vào `.gitignore`; `SECRET_PATTERNS` thêm shape
    `-----BEGIN … PRIVATE KEY-----` để `4ai check` bắt được khoá ký lọt vào file commit.
  - `tests/test-license.mjs` (44 kiểm tra) + ba kiểm tra trong `mcp/fbo/selftest.mjs`.
  - **Hàng rào thương mại, không phải hàng rào an toàn** — runtime là JS đọc được, ai sửa
    `license.mjs` thì bỏ được. Mục tiêu là "chỉ chạy ở nơi đã được cấp" và để lại vết khi chạy
    sai chỗ.

## [v0.3.0] — 2026-08-14

### Thay đổi phá vỡ

- **Đồ thị chuyển vào database — lược đồ v3.** `sourceOfTruth.kind` đổi từ `files` sang
  `database`; JSONL trong `data/graph/` chỉ còn là **hạt giống** cho lần nạp đầu. Lý do: hub
  được nhiều người dùng — user A chạy báo cáo N1-N3, user B chạy N4-N6, quản lý C chạy cả sáu
  và phải ĐỌC NGAY phần A/B đã tổng kết chứ không dựng lại. File cục bộ không chia sẻ được;
  git thì chia sẻ nhưng cần commit/push/pull, không ai làm giữa hai lần chạy báo cáo. Đánh đổi
  đã chấp nhận: mất khả năng review thay đổi đồ thị bằng `git diff`.
  - **`scope` trên mọi node** (`system` = thiết kế FBO chuẩn · `<ma_da>` = phần riêng một dự
    án). Node cấu trúc (Menu/Controller/Table) khai `scoped: true` nên khoá thật là
    `<scope>|<khoá>`. Trước v3, bản chuẩn `CDTran` và bản customize của từng khách **đè lên
    nhau** vì chung khoá `sysid` trần — ai ghi sau thắng. Nay `system|CDTran` và
    `ACME|CDTran` là hai node, đúng mô hình `.f` vs `.xml` runtime FBO vốn dùng.
  - **Bỏ full reload, chuyển sang upsert theo phạm vi.** `DELETE` sạch rồi `INSERT` lại là hợp
    lệ khi DB chỉ là chỉ mục của một người; với nhiều người nó là **mất dữ liệu** — user B chạy
    lúc 9h xoá sạch phần user A ghi lúc 8h. Nay `MERGE` theo khoá và mọi phép xoá đều kèm
    `WHERE scope IN (…)`.
  - **Chỉ xoá loại cạnh mà lần chạy đó thật sự dựng lại được.** Đo trên DB thật: nạp hạt giống
    chỉ có `DEPENDS_ON`/`USES`/`HAS_VERDICT`, nếu xoá mọi loại thì `BELONGS_TO`, `IN_PHASE`,
    `HAS_PM_REVIEW`… của tầng dự án bị xoá sạch và không nguồn nào dựng lại.
  - **Di trú giữ nguyên `$node_id`**: đổi khoá bằng `UPDATE` tại chỗ chứ không xoá-rồi-chèn —
    xoá rồi chèn sinh `$node_id` mới và bỏ lại một đống cạnh trỏ vào hư không. Idempotent nhờ
    `WHERE scope IS NULL`. Đã chạy thật: 57 node hạt giống + toàn bộ tầng dự án (Project,
    Phase, Request, PMReview, ScopeEvidence và 7 loại cạnh) còn nguyên sau ba lần push.
  - **`node tools/4ai.mjs graph push`** (mới) — sinh rồi nạp thẳng vào DB qua `sqlcmd -i`
    (`-i` chứ không `-Q`: `GO` là chỉ thị của sqlcmd, không phải cú pháp T-SQL).
    `runGraphScript()` trong `sql.mjs` là đường ghi duy nhất; `query_sql` vẫn chặn câu lệnh ghi
    như cũ. `--dry-run` dừng trước khi ghi.
  - `graphConnectionString` từ **tuỳ chọn** thành **bắt buộc** — đồ thị sống ở đó.
  - Chia lô 1000 dòng mỗi `INSERT … VALUES` (giới hạn table value constructor của SQL Server)
    và MERGE qua bảng tạm, để `ExperienceFact` đếm bằng chục nghìn vẫn nạp được.
  - **Codepage đầu vào của `sqlcmd -i`**: đường ghi mới ban đầu chỉ đặt `-f o:65001` (đầu ra),
    copy theo `execSql`. Nhưng `execSql` đưa câu lệnh qua `-Q` (tham số dòng lệnh, Windows đã
    giải mã sẵn) còn đường này qua `-i <file>` — sqlcmd tự đọc file theo codepage ANSI của máy.
    Kết quả: "Giấy báo nợ" vào DB thành "Giáº¥y bÃ¡o ná»£", **exit 0, hỏng hoàn toàn im lặng**.
    Đã đổi sang `-f i:65001,o:65001`; MERGE tự ghi đè bản hỏng ở lần push sau. Quét lại 131 cột
    text của 15 bảng node: 0 dòng mojibake.
  - `tests/test-graph-scope.mjs` (mới, 26 khẳng định) — soi chuỗi SQL sinh ra, không chạm DB.

- **Chạy báo cáo tự nộp tầng dự án lên đồ thị.** `tools/lib/graph-sync.mjs` (mới) biến dataset
  rà soát — thứ báo cáo VỐN ĐÃ đọc từ QLDA — thành node Project/Phase/Request và cạnh
  BELONGS_TO/IN_PHASE/HAS_STATUS, `scope` = mã dự án. Không tốn thêm truy vấn nào. Nhờ vậy
  user A chạy N1-N3, user B chạy N4-N6, quản lý C mở N1-N6 là **đọc ngay** phần A và B đã
  tổng kết. Đã chạy thật: push một dự án (6 Request) rồi push dự án thứ hai — dự án đầu còn nguyên, hai scope cùng
  tồn tại.
  - Phân tầng theo GIÁ: tầng rẻ (Project/Phase/Request/trạng thái) đẩy lại mỗi lần chạy; tầng
    đắt (phân giải menu→controller→table, `ExperienceFact`) KHÔNG làm ở đây — chạy riêng và
    nằm lại trong DB để lần sau đọc thẳng.
  - `trang_thai` vào đồ thị dưới dạng **quan hệ** `HAS_STATUS` tới lookup Status dùng chung,
    không phải property lặp trên từng Request — đúng `propsNote` của lược đồ.
  - `graphTuObject()` + `nhanDoiTuong()` tách ra từ `loadGraph()`: JSONL hạt giống và object
    dựng trong bộ nhớ đi qua **đúng một** bộ luật validate. Nhân đôi luật là cách chắc chắn
    nhất để hai đường rẽ nhau lúc nào không biết.
  - `validateGraph` nhận `kindNgoai`: cạnh trỏ tới node đã nạp sẵn trong DB (Status) là hợp lệ,
    nhưng **mặc định vẫn nghiêm ngặt** — không khai thì cạnh treo vẫn báo lỗi, để `graph check`
    tiếp tục bắt được khoá gõ nhầm thay vì cho nó núp dưới danh nghĩa "tham chiếu ngoài".
  - `emitSql` lấy kind/khoá từ chính tham chiếu thay vì đòi node phải có trong lô — trước đó
    nó **sập** (`Cannot read properties of undefined`) khi gặp cạnh trỏ sang tầng khác.
  - Đẩy đồ thị hỏng KHÔNG làm mất báo cáo: bọc try/catch, báo một dòng rồi thôi.
  - `tests/test-graph-sync.mjs` (mới, 22 khẳng định) — dựng SQL từ dataset giả, không chạm DB.

- **Log gợi ý chuyển từ file cục bộ vào đồ thị** (`node_RecommendationLog`, scope = mã dự án).
  Bản đầu ghi `ledgerRoot()/recommendations.jsonl` — chạy được với một người, nhưng user A
  không đọc được file trên máy user B, nên quản lý C mở báo cáo chung chỉ thấy phần mình từng
  chạy. Cùng lý do đã chuyển cả đồ thị vào DB.
  - Khoá `<stt_rec>|<ngày>` nên chạy report hai lần trong ngày **ghi đè chính nó** thay vì đẻ
    node thứ hai — `MERGE` lo phần chống trùng, không cần lọc ở tầng ứng dụng nữa.
  - Cạnh `HAS_RECOMMENDATION` (Request → RecommendationLog) đi **chung một lần đẩy** với tầng
    dự án; tách ra hai lần ghi thì có lúc cạnh trỏ vào node Request chưa tồn tại.
  - Lưu thêm `chamTheo` cạnh thứ hạng: so hai lần gợi ý mà không biết cái nào chấm theo hiện
    vật, cái nào rơi về `menu_id`, thì mọi kết luận "gợi ý tốt lên hay xấu đi" đều vô nghĩa.
  - Vẫn **không lưu kết cục** (PM giao ai) — suy lúc truy vấn từ `ma_lt1` hiện tại, giống cách
    lược đồ xử lý nhãn "Quá hạn". Lưu lại sẽ tạo bản sao có thể lệch với sự thật ở QLDA.
  - Đã chạy thật trên ITG_FBI: 3 node log, `MATCH(Request→HAS_RECOMMENDATION→RecommendationLog)`
    duyệt được; file `recommendations.jsonl` cũ đã xoá.
  - Lược đồ bump `version` 2 → **3** (trước đó chú thích khắp nơi ghi v3 nhưng trường vẫn là 2),
    và `layers.decision` khai thêm `ExperienceFact`/`RecommendationLog` — chúng là kết quả SUY
    từ nội dung UR, không phải dữ liệu chép nguyên từ QLDA.

- **Gợi ý phân công chấm trên HIỆN VẬT thay vì `menu_id`.** `assignee.mjs` nhận thêm
  `nhanSu.kinhNghiemHienVat` (đọc `node_ExperienceFact` từ đồ thị) và `u.hienVat` (hiện vật rút
  từ nội dung chính UR đang chờ giao). Có hiện vật thì chấm theo hiện vật, không thì rơi về
  `menu_id` như cũ — và `goiY.chamTheo` nói rõ đang dùng thang nào.
  - **Hai thang KHÔNG cộng dồn.** Chúng đo cùng một thứ ở hai độ chính xác; cộng cả hai là đếm
    hai lần cùng một bằng chứng — người từng sửa `SVTran` trong UR mang `menu_id` `07.10.06` sẽ
    vừa ăn điểm hiện vật vừa ăn điểm menu cho đúng một việc đã làm.
  - **Độ tin cậy hạ bậc cho thang menu**: `cao` giờ chỉ dành cho bằng chứng hiện vật; trùng
    `menu_id`/`bar` xuống `trung-binh`. Hai test cũ mã hoá giả định "menu = bằng chứng mạnh
    nhất" đã sửa theo thực tế đo được.
  - Đo trên dữ liệu giả lập ca thật: người 30 UR cùng `menu_id` nhưng chưa đụng hiện vật nào
    **rớt khỏi top gợi ý**, nhường cho người đã làm đúng 2/2 hiện vật của yêu cầu.
  - `staffing.mjs` thêm `sqlKinhNghiemHienVat()` — đọc `node_ExperienceFact`, đếm theo UR duy
    nhất, **không lọc theo dự án**: kinh nghiệm sửa `SVTran` ở dự án A vẫn dùng được ở dự án B.
  - `review-dataset.mjs` gắn `hienVat` cho UR bằng từ điển `wcommand` của CHÍNH chương trình
    khách; khách nào không với tới được thì rơi về thang menu_id chứ không làm hỏng báo cáo của
    khách khác. `projects[]` nay mang `programPath` (`nbdmda.dir_pro_web`/`dir_pro_app`).

- **`node tools/4ai.mjs graph experience`** — quét UR đã xong, rút kinh nghiệm, nạp vào đồ thị.
  Tách khỏi `report` vì **phạm vi dữ liệu rời nhau**: báo cáo chỉ đọc UR ở DD/XN/TH (cổng PM),
  kinh nghiệm chỉ lấy từ HT/DT/OK/UP. Bản nháp có nối extraction vào đường báo cáo — mã trông
  như đang chạy nhưng vĩnh viễn cho ra rỗng vì hai tập không giao nhau; đã gỡ và ghi rõ lý do
  tại chỗ. Chạy thật trên DVDKB_FBO: 39 UR → 39 kinh nghiệm, 5 người, 25 hiện vật;
  `MATCH(Request→PRODUCED_EXPERIENCE→ExperienceFact)` ra đúng 7 cho ca chuẩn `A000571322YC1`.

- **`nbphyc.menu_id` KHÔNG phải khoá tới màn hình — đo được, không phải phỏng đoán.** Đối chiếu
  25 giá trị `menu_id` của dự án DVDKB_FBO với `wcommand` (cây menu THẬT của chính chương trình
  đó): **đúng 1 cái tồn tại (4%)**. `07.00.00`, `07.10.06`, `07.10.08`… không có trong cây menu
  của khách. Nhưng TÊN thì khớp chính xác — cùng UR `A000571322YC1`, nội dung liệt kê 7 chứng
  từ, tra `wcommand` theo tên ra đủ 7, ở menu_id hoàn toàn khác (`Hóa đơn bán hàng` →
  `06.01.04`/`SVTran`, không phải `07.10.06`).
  - Điều này bác bỏ giả định trong bản thiết kế trước ("ánh xạ menu_id ↔ bar rút từ lịch sử UR
    con") — menu_id của chính các UR con cũng không phân giải được. Từ điển phải lấy từ
    `wcommand`, và khoá là **tên**, không phải menu_id.
  - `tools/lib/experience-extract.mjs` (mới): từ điển tên → `sysid` dựng từ `wcommand` của
    từng chương trình; dò tên trong `noi_dung` theo kiểu **khớp dài trước, không chồng lấn**;
    tên ngắn dưới 10 ký tự bị loại để không khớp bừa trong văn xuôi; cùng tên thì ưu tiên màn
    hình nhập chứ không phải mẫu in, và ghi lại chỗ nhập nhằng thay vì vứt im lặng.
  - `menu_id` chỉ dùng khi nó THẬT SỰ phân giải được, và `menuIdPhanGiaiDuoc` báo ra khi không.
    Không phân giải được mà nội dung cũng không nêu tên nào thì **không sinh kinh nghiệm** —
    không bịa một hiện vật mang chính chuỗi menu_id.
  - Đo trên dữ liệu thật (DVDKB_FBO, 39 UR ở HT/DT/OK/UP): 61,5% UR rút được hiện vật, trung
    bình 1,63 hiện vật/UR. Ca chuẩn `A000571322YC1` ra **đúng 7 hiện vật**, hành động
    `them-truong`, vị trí `tab khac` — khớp chính xác nội dung UR.
  - `tests/test-experience-extract.mjs` (mới, 26 khẳng định) — từ điển chép nguyên từ `wcommand`
    thật, không chạm DB.

- **`ExperienceFact` — kinh nghiệm đo ở mức HIỆN VẬT, không ở mức UR.** Mô hình cũ
  (`COUNT(nbphyc) GROUP BY (ma_lt1, menu_id)`) gắn kinh nghiệm vào `menu_id` **ghi trên UR** —
  và `menu_id` nói dối. Đo trên FSD: **7.477/74.826 UR (10%)** ở trạng thái đã xong trỏ vào
  menu CHA (`xx.00.00`), không phải màn hình cụ thể. Ca thật `A000571322YC1` (DVDKB_FBO,
  NV01): `menu_id` = `07.00.00` "Phải thu" nhưng nội dung là thêm trường "Loại kê khai" vào
  **7 chứng từ** cộng báo cáo "Bảng kê thuế đầu ra, đầu vào" — cách cũ ghi nhận 1 UR trên
  07.00.00, sai địa chỉ hoàn toàn. Cách mới ghi 8 dòng trên 8 hiện vật thật.
  - Nguồn lai: tên hiện vật khớp bằng **từ điển** (từ vựng FBO là tập đóng; ánh xạ
    `menu_id ↔ bar` rút từ chính lịch sử UR con — DB tự cung cấp từ điển). `hanhDong`/`viTri`/
    `truong` do **LLM** đọc `noi_dung`, luôn mang `doTinCay < 1` và `duyetBoiPm = 0` cho tới
    khi PM duyệt. Core scoring không phụ thuộc phần LLM.
  - **Cổng trạng thái `HT, DT, OK, UP`** — chỉ tính việc đã làm xong. Cố ý gồm `OK` và `DT`:
    luồng là `TH→HT→DT→OK→UP`, và `OK` ("Test OK", 12.780 UR) là bằng chứng **mạnh hơn** `HT`
    ("Hoàn thành, *chờ test*", 1.889 UR). Lọc đúng chữ "HT,UP" sẽ nhận bằng chứng yếu và vứt
    bằng chứng mạnh gấp 6,8 lần.

### Thêm

- **Đo gợi ý phân công có trúng không — bằng quan sát, không hỏi PM.** Mục "Gợi ý người tiếp
  nhận" chạy từ lâu nhưng không ai biết nó đúng hay sai: hệ thống đưa đề xuất rồi quên ngay.
  Bản nháp đầu định để PM tự ghi nhận xác nhận/override vào JSONL rồi commit — sai từ tiền đề,
  vì PM duyệt trên web QLDA, không mở repo, không chạy script; một cơ chế đòi hành động không ai
  làm sẽ vĩnh viễn rỗng. Sự thật về việc phân công vốn đã nằm ở `nbphyc.ma_lt1`, và `4ai report`
  vốn đã đọc bảng đó mỗi lần chạy — nên chỉ cần **quan sát**, không cần hỏi.
  - `tools/lib/recommendation-log.mjs` (mới) — snapshot gợi ý mỗi lần chạy report; lần chạy sau
    đối chiếu với `ma_lt1` hiện tại để tự suy ra PM đã giao cho ai (`trung`/`khac`/`chua-giao`).
    Không tự ghi đĩa: trả **mô tả file**, `writer.mjs` ghi, đúng luật chung của hub.
  - Nối trong `buildReviewReportFiles()` nên **cả `4ai report` lẫn `render_review_report`** đều
    có, không đẻ bề mặt riêng. Hỏng ở vòng này không làm mất báo cáo — log là dữ liệu phụ trợ.
  - Trang tổng quan thêm mục "Gợi ý có trúng không": tỉ lệ trúng Top-1 và người PM hay chọn
    thay. UR chưa giao không vào mẫu số (báo cáo chạy sớm không phải gợi ý sai); chưa có gì đã
    quyết thì `tiLeTrung = null` chứ không phải `0` — 0 nghĩa là trượt sạch.
  - **Không ghi nhận lý do PM đổi người.** Động cơ nằm trong đầu PM, không nằm trong `nbphyc`;
    dashboard nói thẳng "không suy đoán động cơ" thay vì bịa một lý do nghe hợp lý.
  - Lưu ở `ledgerRoot()/recommendations.jsonl` — cùng nơi report HTML, ngoài git, ngoài SQL
    Server. Cố ý KHÔNG vào `data/graph/*.jsonl`: đồ thị git-tracked là kiến thức đã xác minh
    đáng review bằng `git diff`, không phải nơi nhận dữ liệu sinh mỗi ngày.
  - `assignee.mjs` thêm `policyVersion()` — hash 8 hex của bộ trọng số, để biết một thứ hạng đã
    lưu sinh ra từ cấu hình nào khi `review.phanCong` đổi về sau.
  - `tests/test-recommendation-log.mjs` (mới, 22 khẳng định) và một mục trong
    `tests/test-review-report-build.mjs` mô phỏng hai lần chạy cách nhau một ngày, PM giao người
    khác ở giữa.
  - `docs/experience-engine/` (mới) — assessment, domain model, thuật toán, kế hoạch; kèm
    `docs/adr/ADR-0001` chốt hướng mở rộng hệ đang chạy thay vì dựng nền tảng recommendation
    tổng quát mới.

## [v0.2.0] — 2026-08-13

Bản đầu tiên dùng được ở bề mặt chỉ có MCP (chat/Cowork). Cài/cập nhật qua marketplace như cũ —
`plugin.json` lên `0.2.0` nên client mới thấy có bản update.

### Thêm

- **Tool MCP `render_review_report` — báo cáo rà soát UR chạy được ở bề mặt không có shell.**
  Cài plugin rồi dùng trong chat/Cowork thì `/4ai:pm-review` gãy toàn bộ chuỗi: bề mặt đó không
  nạp `commands/`, không giao được sub-agent, không chạy được `node tools/4ai.mjs report`. Mắt
  duy nhất còn sống là MCP, nên model tụt xuống `get_review_dataset` rồi **tự ghép một bản báo
  cáo riêng** — không qua validate payload, không nằm trong ledger, và phân tích cả UR `XN`/`TH`
  vốn đã qua cổng PM. Cách chặn không phải viết thêm lời dặn mà là làm cho đường đúng chạy được
  ở mọi bề mặt.
  - `tools/lib/review-report.mjs` (mới) — `buildReviewReportFiles()` gom phần dựng file mà CLI
    `4ai report` vẫn làm, trả **mô tả file**, không import `writer.mjs`. `tools/4ai.mjs` và tool
    MCP cùng gọi nó: hai đường vào, một cách dựng, không có bản báo cáo thứ hai để trôi lệch.
  - `ddChoPhanTich()` trả `ddUR[]` nguyên nội dung (phạm vi cổng PM) nhưng UR `XN`/`TH` **chỉ
    còn số đếm và hạn gần nhất**. Doctrine "chỉ phân tích DD" thôi làm lời dặn và thành hình
    dạng dữ liệu — cái không trả về thì không phân tích nhầm được. Có test canh đúng chỗ đó.
  - `ledgerRoot()` nhận thêm `FBO_DATA_ROOT` (= `${CLAUDE_PLUGIN_DATA}`) trước khi lùi về
    `<hub>/ledger`: chạy như plugin thì `hub` là gốc gói, bị ghi đè mỗi lần update — báo cáo ghi
    vào đó là mất. Biến này chỉ có trong tiến trình MCP nên CLI ở hub không đổi hành vi.
  - `tests/test-review-report-build.mjs` (mới) — dataset giả, không chạm DB, không chạm đĩa.
  - `pm-review` (v9), `pm-deadline-review` (v11), `pm-ur-routing` (v2) ghi rõ nhánh không-có-shell
    và cấm dựng báo cáo tay từ `get_review_dataset`.

### Sửa

- **Cài đặt chưa gán PM báo lỗi chỉ vào một file không với tới được.** `resolveReviewFilters()`
  và `list_programs` đều bảo "khai `pm.maNv` trong data/qlda.local.json" — vô nghĩa ở bề mặt
  không có shell: đường dẫn thật nằm trong `${CLAUDE_PLUGIN_DATA}`, model không tính ra được và
  cũng không ghi được. Không thông báo nào gọi tên `set_pm_identity`, đúng cái tool sinh ra để
  chữa việc này. Hệ quả quan sát được trong chat: model bỏ luôn `render_review_report`, quay ra
  hỏi "mã nhân viên **hoặc tên** của bạn là gì" và bịa ví dụ (`MA001`, `Nguyễn Văn A`) —
  `maNv` phải khớp `nbdmda.ma_lt1`, họ tên không bao giờ khớp.
  - Cả hai thông báo nay mở đầu bằng `CHƯA GÁN PM`, gọi tên `set_pm_identity({ maNv, boPhanLt })`
    trước, `4ai setup` sau, và nói rõ `maNv` là **mã** in hoa không dấu chứ không phải họ tên.
  - `set_pm_identity` khai thêm `render_review_report` vào danh sách tool có thể báo lỗi này;
    `render_review_report` khai rõ "gọi thẳng, không tham số trước".
  - Test canh nội dung thông báo trong `tests/test-review-dataset.mjs` — chữ nghĩa ở đây là
    giao diện thật với model, đổi nó là đổi hành vi.

### Tài liệu

- **README ghi sai `plan_report`/`execute_report` thành lệnh CLI.** Mục "Report Workflow" chỉ
  `node tools/4ai.mjs plan-report`/`execute-report` — hai lệnh này KHÔNG tồn tại trong
  `tools/4ai.mjs` (danh sách lệnh thật: `check|doctor|setup|list|explain|new|targets|graph|
  report|sync|serve`). Đây là tool MCP `4ai-fbo`, agent gọi trực tiếp, không qua CLI. Sửa lại
  cú pháp gọi tool đúng tham số (`request`/`program`/`domain`/`maxRows` cho `plan_report`;
  `planId`/`sql`/`program`/`database`/`maxRows` cho `execute_report`), và ghi rõ khác với
  `4ai report` (dataset UR cố định, không nhận SQL tự do).

### Thêm

- **Cursor Plugin — phương ngữ thứ sáu của compiler.** `tools/lib/emit/cursor-plugin.mjs`
  (target mới `plugin-cursor`, tools `cursor-plugin`) dựng gói `.cursor-plugin/plugin.json` +
  `rules/*.mdc` (doctrine/rule ra file rule THẬT với `alwaysApply`, không hạ thành skill như
  bên Claude) + `agents/` + `commands/` + `mcp.json` (biến `${PLUGIN_ROOT}`) + runtime chép
  nguyên văn — cùng khuôn với `plugin.mjs` (Claude Code) nhưng KHÔNG dùng chung thư mục output
  vì hai định dạng manifest khác nhau. Thêm `.cursor-plugin/marketplace.json` ở gốc repo để
  Cursor Team Marketplace import trực tiếp từ GitHub (Dashboard → Plugins → Add Marketplace →
  Import from Repo). `plugins/4ai-cursor/` đã dựng và commit.
  - Chưa xác nhận biến path bền qua update kiểu `${CLAUDE_PLUGIN_DATA}` phía Cursor — index
    SQLite của MCP ghi ngay trong thư mục cài (`${PLUGIN_ROOT}/.4ai/index/`), có thể mất khi
    plugin update. Ghi rõ trong code comment và README, không tự đoán tên biến.
  - Rút `RUNTIME_DIRS`/`RUNTIME_EXCLUDE`/`runtimeFiles()`/`bareCommand()` từ `plugin.mjs` sang
    `emit/common.mjs` — hai emitter đóng gói dùng chung logic bundling runtime, tránh hai bản
    trôi lệch nhau.
  - `schema.mjs` TARGETS, `paths.mjs` (emitPaths/mcpPath), `mcp/servers.json` targets,
    `targets.json` đều thêm `cursor-plugin`/`plugin-cursor` theo đúng chỗ đã khai (không
    hardcode tên tool ở emitter).

### Tài liệu

- **README — cài đặt Cursor qua Team Marketplace.** Mục "Cài đặt" tách theo tool (Claude Code /
  Cursor) vì hai bên marketplace không dùng chung cơ chế; thêm hướng dẫn Import from Repo, Auto
  Refresh (cần Cursor GitHub App), và mục "Dựng lại plugin sau khi sửa asset" cập nhật cho cả
  hai emitter đóng gói.

- **README thiếu hướng dẫn setup cục bộ.** Thêm mục "Cấu hình cục bộ" — yêu cầu Node.js 22+,
  cách gọi `set_pm_identity` để ghi `data/qlda.local.json`, bảng biến môi trường
  (`QLDA_APP_CONNECTION`, `QLDA_SYS_CONNECTION`, `GRAPH_4AI_CONNECTION`, `FBO_SQLCMD`) và thứ
  tự phân giải, cách dùng `targets.local.json` để override path theo máy.

### Sửa

- **Plugin xuất xưởng mang cứng đường dẫn máy dev — ai cài về cũng không chạy được.**
  `sync.mjs` giải `{{HUB}}` ra đường dẫn hub thật cho MỌI target *trước khi* emitter chạy, nên
  tới lượt plugin không còn token nào để thay: `.mcp.json` ship ra trỏ vào
  `D:/Fast Source/4AI/mcp/fbo/server.mjs` — thư mục không tồn tại trên máy người cài, MCP server
  không khởi động nổi. Nay chỉ target cục bộ mới giải sẵn; plugin nhận bản còn token và tự giải
  sang `${CLAUDE_PLUGIN_ROOT}`. `command` cũng đổi từ đường dẫn `node.exe` tuyệt đối sang lệnh
  trần để máy người cài tự phân giải qua PATH.
- **`4ai check` báo đỏ trên máy đã cấu hình ĐÚNG.** `scanSecrets` quét cả `data/qlda.local.json`
  — mà đó chính là nơi được phép giữ credential (đã gitignore, và là chỗ `setup` ghi vào). Nay
  bỏ qua mọi `*.local.json`; file được commit vẫn bắt như cũ.
- **Kết nối QLDA khai bằng env nhưng code không dùng.** `data/qlda.json → databases.qlda.resolveOrder`
  và README đều khai env → `qlda.local.json` → `Web.config` từ lâu, nhưng `sql.mjs` chưa bao giờ
  cài đặt bước env/local — mọi truy vấn QLDA đều đi thẳng Web.config. Hỏng này im lặng: kết quả
  vẫn đúng nên không ai nhận ra, cho tới lúc máy không truy cập được share chứa QLDA thì mới vỡ.
  Nay phân giải đúng thứ tự đã khai. Chương trình của **khách** (đường dẫn từ `nbdmda`) vẫn đọc
  `Web.config` của chính nó — mỗi khách một server/database riêng, không được lấy nhầm kết nối
  QLDA. Thêm `nguonKetNoi()` để kiểm nguồn mà không phải in chuỗi bí mật.
- **sqlcmd cắt âm thầm cột `nvarchar(MAX)` ở 256 ký tự.** Mặc định của cờ `-y`, và không tắt
  được vì `-y` xung khắc với `-W` (thứ làm parser TSV chạy được). Cắt này không cảnh báo,
  không cờ `truncated` — chuỗi trả về trông vẫn như một giá trị hoàn chỉnh. Đo trên `frpost`:
  44% số bài dài quá 256; topic 28934 có 11.252 ký tự nhưng chỉ nhận về 4.901. Cột khai độ
  dài rõ (`nbphyc.noi_dung` nvarchar(4000)) không dính, nên lỗi nằm im tới giờ. Cách chữa là
  ở câu truy vấn: cắt mảnh `nvarchar(4000)` rồi ghép lại, kèm `LEN()` thật để đối chiếu.
- **Mục "Chưa giao lập trình (DD)" không lấy được nhân sự gợi ý.** Từ lúc `4ai report` bỏ
  payload khai tay, `datasetToPayloads()` không dựng khối `nhanSu` nên mọi dòng đều in
  "chưa nạp `nhanSu`" — `assignee.mjs` vẫn đúng, chỉ là không ai đưa dữ kiện cho nó.
  `tools/lib/staffing.mjs` (mới) nạp roster + lịch sử menu + tải trọng và gắn vào dataset.
- **Dự án nhiều LTQL luôn bị coi là đã phân việc.** `payload.pm` ghép ba mã thành chuỗi
  `"A, B"` rồi đem so nguyên chuỗi với một `ma_lt1` — không bao giờ khớp, nên UR còn để mặc
  định tên PM lọt qua hết. `laChuaPhanCong()` nay tách danh sách và so từng mã.
- **Xếp hạng ứng viên hoà hết trên dữ liệu thật.** Điểm kinh nghiệm chấm theo mốc tuyệt đối
  3 UR; lịch sử thật đếm hàng chục tới hàng trăm UR mỗi menu nên cả phòng chạm trần. Nay chấm
  theo tương quan với người dẫn đầu chính menu đó; `baoHoaSoUr` thành SÀN của mẫu số.
- **Tra người theo chuỗi thô làm một người trượt thành hai.** `nbdmda.ma_lt1` viết hoa thường
  không thống nhất ('ThanhNM' cạnh 'NV07'); mọi khoá tra trong `assignee.mjs` nay lowercase.

### Thêm

- **`4ai setup` — khai cấu hình cục bộ mà không đưa bí mật qua model.** Hỏi danh tính PM và ba
  chuỗi kết nối ngay trong terminal của người dùng, ký tự gõ vào không hiện lên màn hình, giá
  trị ghi thẳng vào `qlda.local.json` ở data root của lần cài (plugin: `${CLAUDE_PLUGIN_DATA}`,
  sống sót qua update). Bỏ trống một mục = giữ nguyên giá trị cũ. CỐ TÌNH không làm bằng MCP
  tool: chuỗi kết nối truyền qua tool argument sẽ nằm lại trong context và transcript phiên chat,
  phá đúng hàng rào mà `sql.mjs` và `scanSecrets` dựng lên. Stdin không phải TTY thì từ chối và
  chỉ sang đường env, không hỏi nửa vời.
- **`4ai doctor` — chẩn đoán máy này chạy được chưa.** Gồm `check` cũ, cộng thêm Node, `sqlcmd`,
  danh tính PM, khoá nào đã khai và khai ở đâu (env / `qlda.local.json` / `Web.config`). Chỉ in
  **tên khoá và trạng thái**, không bao giờ in giá trị — dán output đi nhờ hỗ trợ được mà không
  lộ gì. `check` giữ nguyên nghĩa cũ: bài test của compiler, phải sạch trên mọi máy.
- **Link trong nội dung UR bấm được trên báo cáo HTML.** `escLink()` escape trước rồi mới
  dựng thẻ `<a>` — thứ tự đó là thứ giữ an toàn: `noi_dung` do người dùng nhập nên không được
  chảy thẳng vào HTML. Dấu câu cuối câu (`.` `)` …) nằm ngoài href, `&` trong query string
  không cắt link làm đôi.
- **UR ở DD có link forum.fast.com.vn được mở sẵn nội dung topic.** Nhiều UR chỉ ghi "update
  theo link forum: <url>" — yêu cầu thật nằm ở topic chứ không nằm trong UR. `tools/lib/forum.mjs`
  bóc link, tra bản sao diễn đàn trong DB (`frpost`) và gắn vào payload; báo cáo hiện trong
  mục "Nội dung forum kèm theo (DD)", thu trong `<details>`. Không gọi HTTP ra ngoài.
- **Báo cáo lấy lên cả việc PM tự làm.** Phạm vi rà soát nay có hai lý do OR với nhau: dự án
  PM đứng tên LTQL (hoặc bộ phận `--dept`), **hoặc** UR mang `nbphyc.ma_lt1 = {PMName}` ở
  trạng thái XN/TH. PM cũng là nhân viên của phòng và vẫn trực tiếp lập trình — lọc theo LTQL
  dự án chỉ ra việc PM *quản lý*, không ra việc PM *đang làm*. Đo trên dữ liệu thật: 10 UR
  mang tên PM thì 6 nằm ở dự án người khác quản lý, trước đây lọt hết. Cố ý bỏ DD (mã PM ở
  DD chỉ là mặc định màn hình BA để lại) và nhánh này chỉ mở rộng phạm vi đã có, không được
  đứng một mình — `--project` đơn lẻ vẫn trả về nguyên dự án.
- **Nhân sự lấy từ `userinfo2` (DB sys), không đoán.** Ứng viên = người CÒN làm và CÒN ở bộ
  phận (`status='1'`, `ma_bo_phan={PMDept}`). Ai off hoặc chuyển bộ phận thì không được đề
  xuất nhận việc mới, dù tên vẫn còn trên dự án cũ.
- **PM của dự án được phân giải, không chép nguyên LTQL.** LTQL trên `nbdmda` là dữ liệu đã
  nguội: người đã rời phòng vẫn còn tên ở đó. Rơi vào trường hợp này thì PM tính là cấp PP
  (phó phòng quản lý toàn bộ dự án của phòng), và báo cáo nói rõ `<LTQL cũ> → <PP>` thay vì
  lặng lẽ đổi tên. Vai PM nhận diện bằng việc đứng tên `nbdmda.ma_lt1/2/3` chứ không bằng
  chức vụ — mọi PM ở đây đều mang `ma_chv='NV'`.
- **Báo cáo hiện tên đầy đủ, vai PM/phó phòng và nguồn dữ kiện** ở mục gợi ý phân công; nguồn
  nào hỏng thì ghi rõ lý do ở đầu mục thay vì trả bảng rỗng.
- **Tiêu chí 3 (báo cáo đầu ra ưu tiên người đóng góp UR đầu vào) nay có nguồn thật.** Đầu
  vào/đầu ra không còn đoán qua từ khoá tự do trong `noi_dung` — dùng thẳng đầu mục công việc
  (`nbctdaumuc.ma_daumuc`, tín hiệu có sẵn trên 97.8% dòng đầu mục của FSD): chứng từ/danh
  mục/import = đầu vào, báo cáo/mẫu in = đầu ra. Xem `data/qlda.json → enums.dauMucLoai`.
- `tests/test-staffing.mjs` — 46 khẳng định, `runSql` tiêm giả, không chạm DB.

- **Đóng gói thành Claude Code plugin.** `plugins/4ai/` sinh tự động từ corpus, cài bằng
  `/plugin marketplace add huunguyenit/4AI` rồi `/plugin install 4ai@fast-source-4ai` — không
  phải clone repo. Gói tự chứa: 26 skill, 9 agent, 7 command, MCP `4ai-fbo`, và CLI.
- **Emitter thứ năm** `tools/lib/emit/plugin.mjs` + target `plugin` trong `targets.json`.
  Plugin là một phương ngữ của compiler như bốn phương ngữ kia, không phải thư mục dựng tay.
- **`.claude-plugin/marketplace.json`** — repo này vừa là nguồn vừa là marketplace.
- **Cờ `--data` cho MCP server** (và env `FBO_DATA_ROOT`) tách nơi ghi index khỏi nơi chứa code.
  Mặc định vẫn là hub nên không đổi cách dùng hiện tại; khi chạy như plugin thì index nằm ở
  `${CLAUDE_PLUGIN_DATA}` để sống sót qua mỗi lần update plugin.

### Ghi chú

- Lệnh bảo trì hub (`/sync`, `/doctor`, `/new-skill`, `/new-rule`, `/new-agent`,
  `4ai-asset-authoring`) cố tình KHÔNG vào plugin — chúng chỉ có nghĩa khi đứng trong repo.
- `data/qlda.local.json` và mọi `*.local.json` bị loại khỏi bản phân phối.

## [v0.1.0-beta] — 2026-08-11

Bản đóng gói đầu tiên để đồng nghiệp nội bộ (dev/PM dùng FBO) thử nghiệm beta. Giai đoạn 1 —
compiler hub và bộ asset FBO/FBI — coi như hoàn tất; từ đây tập trung thu feedback trước khi
mở rộng.

### Có gì trong bản này

- **Compiler hub** (`tools/4ai.mjs`): `check` / `sync` / `sync --dry-run` / `list` / `explain` —
  biên dịch một corpus markdown thành bốn phương ngữ config (Claude Code, Cursor, Antigravity,
  VSCode/Copilot).
- **49 asset**: 3 doctrine, 13 rule, 15 skill, 6 agent, 12 command — bao phủ quy trình FBO
  (customize, review diff, tra cứu SQL, điều tra màn hình) và PM (ledger, deadline review,
  customer/program registry, capability graph).
- **Report templates**: dashboard HTML ngoại tuyến (rà soát UR, KPI phòng ban), template tĩnh
  không CDN, xem được offline.
- **Report workflow qua MCP**: `plan_report` → agent tự viết SQL → `execute_report`, SQL luôn
  qua lớp validate theo metadata đã chốt.
- **Prompt tool** (`tools/lib/prompt.mjs`): sinh prompt gợi ý từ payload rà soát UR để dán thẳng
  vào Claude Code, không phải gõ lại ngữ cảnh tay.
- **Assignee tweaks** (`tools/lib/assignee.mjs`): gợi ý phân công UR dựa trên khối lượng, chuyên
  môn, thời gian rảnh, mức ưu tiên.
- **MCP server** `4ai-fbo`: `find_controller`, `describe_controller`, `resolve_entities`,
  `query_sql`, `list_related`, `search_content`, và các tool tra cứu khác cho chương trình FBO.

### Đã sửa trước khi đóng gói

- `tools/lib/prompt.mjs`: bỏ hardcode tên MCP tool cụ thể (`resolve_entities`,
  `data/customers.json`) trong prompt sinh tự động — môi trường có nhiều MCP nội bộ khác nhau,
  để agent tự chọn tool phù hợp theo ngữ cảnh thay vì ép một tên cố định.

### Biết trước khi test

- Mapping cho **Antigravity** dựng từ tài liệu công khai, **chưa verify** trên workspace thật —
  xem ghi chú đầu `tools/lib/emit/antigravity.mjs`.
- Chưa có test runner tự động hoá qua CI (`.github/` chưa có workflow) — `node tools/4ai.mjs check`
  và các file trong `tests/` phải chạy tay trước khi commit.
- Chưa có cơ chế version/package chính thức (`package.json`) — dự án cố tình zero npm dependency,
  cài đặt bằng `git clone` + chạy trực tiếp bằng Node.

### Cách feedback

Xem [BETA.md](BETA.md).
