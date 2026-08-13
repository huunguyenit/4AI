# Changelog

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/). Version đánh theo mốc bàn giao
beta nội bộ, chưa theo semver nghiêm ngặt vì dự án chưa có `package.json`.

## [Chưa phát hành]

### Tài liệu

- **README thiếu hướng dẫn setup cục bộ.** Thêm mục "Cấu hình cục bộ" — yêu cầu Node.js 22+,
  cách gọi `set_pm_identity` để ghi `data/qlda.local.json`, bảng biến môi trường
  (`QLDA_APP_CONNECTION`, `QLDA_SYS_CONNECTION`, `GRAPH_4AI_CONNECTION`, `FBO_SQLCMD`) và thứ
  tự phân giải, cách dùng `targets.local.json` để override path theo máy.

### Sửa

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
