# Changelog

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/). Version đánh theo mốc bàn giao
beta nội bộ, chưa theo semver nghiêm ngặt vì dự án chưa có `package.json`.

## [Chưa phát hành]

### Đổi — cổng phân tích PM chuyển từ `DD` sang `YC`

Quy định mới: AI chỉ phân tích UR ở trạng thái `YC` (tài liệu đầu vào, ảnh hưởng, phân việc,
đề xuất `DD`/`TA`/`KL`). Sau khi PM báo thời gian thực hiện và tick xác nhận theo giai đoạn
(`chotDaHen`), UR chuyển `DD` — giờ chỉ còn là mốc đã cam kết hạn, không phân tích lại. `XN`/`TH`
không đổi vai trò (chỉ theo dõi hạn). Luồng chuẩn: `YC → DD → XN → TH → HT`.

Đổi cả code lẫn tài liệu: `STATUS_MAC_DINH`/`STATUS_PM_TU_LAM`/`CHI_THEO_DOI` và mọi điểm gọi
`laChuaPhanCong`/`goiYPhanCong`/`menuCanGoiY`/`urCanTraForum` trong `tools/lib/*.mjs`; trường
MCP `ddUR[]` đổi tên thành `ycUR[]` (`render_review_report`, `get_review_dataset`); ba asset
`pm-deadline-review`, `pm-analyst`, `pm-ur-routing`; `data/qlda.json` mục `review.*`.

Bổ sung: `pm-analyst` giờ bắt buộc UR loại "tạo mới/sửa báo cáo" (đầu mục `09` hoặc nội dung
nhắc báo cáo/thống kê/bảng kê) phải mô tả đủ **đầu vào** (điều kiện lọc — ngày, kỳ, mã khách,
tài khoản… và nguồn lấy theo sổ cái/sổ kho/sổ thanh toán) và **đầu ra** (danh sách cột hiển
thị); thiếu bên nào thì ghi "Cần làm rõ" và cảnh báo PM, không tự suy diễn.

### Đã thêm — ADR-0002: FBO Designer tách thành repo riêng

`docs/adr/ADR-0002-fbo-designer-repo-split.md`. Extension VS Code kéo thả thiết kế form FBO
sẽ sống ở repo `Development/FboDesigner`, không nằm trong hub — vì extension bắt buộc có
dev-dependency, còn hub có hard rule zero npm dependency và tự định nghĩa là compiler chứ
không phải ứng dụng.

Ràng buộc đặt lên hub: `mcp/fbo/lib/encoding.mjs` về sau sẽ chuyển sang import `fbo-core` của
repo mới thay vì giữ bản riêng — chiều phụ thuộc một chiều, hub không bao giờ import ngược.
Cho tới lúc đó, **hai bản encoding song song** là nợ có ý thức, không phải trạng thái đúng.

Hai file `assets/skills/erp/erp-view-design/references/` (`reference-render-pipeline.md`,
`reference-item-value.md`) từ nay mang thêm vai trò **đặc tả nguồn** cho repo kia: code lệch
đặc tả thì sửa code.

### Đã thêm — nội hoá bộ rule team FastBusiness

Bộ quy tắc dùng chung của team (CodeGraph/Cypher + SQL format + an toàn AI) được bóc thành
asset của hub thay vì giữ nguyên văn. Nguyên tắc bóc: **giữ ý định, đổi bề mặt** — không tạo
asset nào trỏ vào tool hub không có, không tạo asset trùng thứ đã tồn tại.

- **Ba rule mới**, đều `severity: hard`:
  - `erp-edit-tooling` — sửa file nguồn qua Edit/StrReplace, không ghi đè bằng shell. Hai lý
    do độc lập: người dùng phải duyệt được diff, và `sed -i`/`Set-Content` phá Windows-1258 +
    CRLF + BOM của XML nguồn.
  - `erp-sql-schema-check` — soi bảng nguồn **và** bảng đích bằng `query_sql { object }` trước
    khi viết `INSERT`/`UPDATE`/`SELECT`. Ca đắt không phải cột không tồn tại (SQL Server báo
    ngay) mà cột tồn tại nhưng khác nghĩa hoặc khác độ dài.
  - `erp-js-naming` — biến local JS snake_case khớp tên field. Luật đọc được bằng grep:
    tên khớp thì một lần `search_content` ra hết; camelCase làm nhánh đó tàng hình.
- **`erp-sql-style` v4** — bổ sung phần format team có mà hub thiếu: trần ~120 ký tự/dòng,
  `CASE WHEN` tách nhánh, dynamic SQL format nhiều dòng, tham số proc mỗi cái một dòng, và
  §11 mới "sửa SQL đã có": reformat KHÔNG đổi alias / thứ tự tham số / kiểu / điều kiện lọc,
  cộng checklist bốn chỗ phải rà khi thêm một trường (struct `#temp`, mọi `INSERT`, `SELECT`
  output, search/paging).
- **`erp-navigation-lookup` v2** — thêm `references/query-intent-map.md`: 14 template Cypher
  của CodeGraph dịch sang tool call `4ai-fbo`. 13/14 có tương đương; template 10 (aggregate)
  thì **không**, và file nói thẳng là không thay vì gợi ý ước lượng. Kèm mục "nguyên tắc
  KHÔNG chuyển được": lệnh cấm `LIKE`/`ILIKE` là chuyện riêng của KùzuDB, SQL Server có
  `LIKE` và dùng được.

**Xung đột đã chốt.** Tài liệu team viết `DECLARE @ngay_ct smalldatetime`; `erp-sql-style` §1
bắt tham số/biến proc bằng tiếng Anh (`@Period`, `@DateFrom`). Giữ tiếng Anh — snake_case chỉ
áp cho JS phía client. Ranh giới ghi tường minh ở cả hai rule để lần sau không phải xử lại.

**Không thêm asset cho ba mục đã có chỗ đứng**: "không deploy proc khi chưa hỏi" nằm ở
`erp-sql-access` (`allowWrite` phải nêu nguyên văn câu lệnh để duyệt) và checklist cuối
`erp-sql-style`; format `JOIN`/`IF BEGIN` nằm ở `erp-sql-style` §2.3; catalog tên hàm JS theo
convention FBO nằm ở `erp-js-implement`.

### Đã gỡ — quét dead code toàn repo

Dựng hai bộ đếm chạy trên mọi `.mjs` thật (`tools/`, `mcp/`, `src/`, `tests/`) thay vì đọc bằng
mắt: một đếm export **không có người gọi ngoài file khai nó**, một tìm **binding import khai rồi
không dùng**. Bộ thứ nhất lọc thêm một bước — chỗ nhắc tên nằm trong comment không tính là dùng,
vì đó chính là kiểu code chết nhìn qua tưởng sống.

Kết quả: 55/262 export không có người gọi ngoài, nhưng **chỉ 5 cái chết thật**; 50 cái còn lại là
code đang chạy, chỉ thừa từ khoá `export`. Không đụng nhóm 50 đó — đổi chúng là churn, không phải
dọn rác.

- **Xoá**: `ledgerDataRoot` (alias `@deprecated`, 0 chỗ gọi) ở `tools/lib/assets.mjs`;
  `DDL_KINDS` ở `tools/lib/ddl.mjs`; `setPath` ở `tools/lib/json.mjs`.
- **Bốn import thừa**: `mcpPath` (`tools/4ai.mjs`), `fs` (`tools/lib/report.mjs`), `setPath`
  (`tools/lib/writer.mjs`), `os` (`tests/test-review-report-build.mjs`).
- **Quét lặp tới điểm dừng.** Gỡ `setPath` khỏi import của `writer.mjs` làm chính `setPath` trong
  `json.mjs` thành mồ côi — chạy lại bộ đếm mới thấy. Lặp tới khi cả hai bộ đếm trả 0.
- **Bốn file dữ liệu mồ côi cũng xoá** (quyết định của chủ repo sau khi được nêu ra):
  `data/fbo-capability.json`, `data/fbo-database.json`, `data/fbo-folders.json`,
  `data/license.json`. Không dòng code nào nạp bất kỳ file nào trong số đó.
  `data/` giờ còn đúng thứ có người đọc: `fbo-ddl.json`, `graph-schema.json`,
  `holidays-vn.json`, `qlda.json`, `qlda.local.json`, `graph/`.
- **Dọn theo ba chỗ trỏ tới chúng**: `.gitignore` bỏ dòng `data/license.json` (gộp phần
  còn lại thành một mục `*.pem`); `docs/experience-engine/GRAPH-IN-DATABASE.md` viết lại
  đoạn "từ vựng đóng" cho khỏi trỏ vào file không còn, kèm ghi chú vì sao chúng biến mất;
  `tests/test-state-root.mjs` đổi fixture từ `license.json` sang `qlda.local.json` — test
  đó đo `stateFile()` nói chung, dùng tên file của một hệ thống đã gỡ là gây hiểu nhầm.

### Đã gỡ — giấy phép, và tinh giản bề mặt MCP xuống 14 tool

- **Giấy phép đi hẳn.** Sau khi đường đóng gói plugin bị gỡ (mục ngay dưới), hàng rào này không còn chỗ
  nào cưỡng chế: `isSourceHub()` trả `true` với mọi bản clone, mà clone là cách duy nhất dùng
  4AI. Giữ nó chỉ là giữ một cơ chế không bao giờ chạy.
  Xoá `mcp/fbo/lib/license.mjs`, `tools/lib/license-cli.mjs`, `data/license-public-keys.json`,
  `tests/test-license.mjs`; gỡ cổng `requireLicense()` ở `mcp/fbo/server.mjs` và hàm
  `chanGiayPhep()` chặn `graph`/`report`/`serve`/`playbook` trong `tools/4ai.mjs`; gỡ lệnh
  `4ai license`; `doctor` và `setup` bỏ khối trạng thái giấy phép.
  *(`data/license.json` trên máy này là file cục bộ đã gitignore — để nguyên, không ai đọc nữa.)*
- **`stateRoot()` / `FBO_DATA_ROOT` giữ nguyên.** Nó vẫn là chỗ ở của `data/qlda.local.json`
  và `ledger/`; chỉ có phần prose nhắc "giấy phép" là được viết lại.
- **MCP: 20 tool → 14.** Bốn tool bị gỡ ngoài hai tool license, chọn theo số lần corpus
  `assets/` thực sự bảo model gọi chúng:
  - `plan_report` / `execute_report` — corpus nhắc đúng 3 lần và **cả 3 đều là câu cấm dùng**
    (`assets/commands/pm/pm-review.md`, `assets/skills/pm/pm-deadline-review.md`). Việc báo cáo
    tự do đã có `query_sql`; việc báo cáo UR đã có `render_review_report`.
  - `playbook_add` / `playbook_search` — **0 tham chiếu** trong toàn bộ corpus. CLI
    `4ai playbook add|edit|search` giữ nguyên, nên kho kinh nghiệm không mất; cái mất là đường
    ghi/tra từ bề mặt không có shell (chat/Cowork).
- **Đường báo cáo tự do bị gỡ cả tầng dưới.** Sau khi hai tool MCP đi, cụm module đứng sau
  chúng không còn ai gọi, nên xoá luôn: `src/workflows/report-workflow.mjs`,
  `src/database/metadata-resolver.mjs`, `query-plan.mjs`, `query-prompt-builder.mjs`,
  `query-validator.mjs`, `query-executor.mjs`, và `tests/test-report-pipeline.mjs`.
  Thư mục `src/workflows/` không còn; `src/database/` chỉ còn `qlda-metadata.mjs` — file
  này ở lại vì `loadQldaConfig`/`isPmPlaceholder` có hơn 30 chỗ gọi ngoài.
  Kiểm bằng đồ thị import trước khi xoá: `report-workflow` không còn importer nào, năm
  module kia chỉ có `report-workflow` gọi — một cụm đóng, không cạnh nào đi ra ngoài.
- **`qlda-metadata.mjs` cắt hai phần ba.** Bốn export `detectQldaDomain`, `isQldaProgram`,
  `buildQldaMetadata`, `DOMAIN_THRESHOLD` sinh ra chỉ để phục vụ `metadata-resolver`, nên
  chết theo nó — cùng bộ helper riêng (`DOMAIN_SIGNALS`, `derivedSignals`,
  `pickPrimaryTable`, `pushColumns`, `buildBusinessRules`…). Cắt từ mốc
  `// --- domain detect` tới hết file: **493 → 152 dòng**. Phần sống là đúng hai export
  `loadQldaConfig` và `isPmPlaceholder` cùng lớp overlay `qlda.local.json` của chúng.
  Import `stripAccents` rụng theo; header file viết lại cho khớp việc còn làm.
- **`mcp/servers.json`** bỏ `plan_report` và `license_status` khỏi `autoApprove`, bỏ ghi chú
  về cổng giấy phép.
- **Kiểm chứng**: `tools/list` của server trả đúng 14 tool; TOOLS và HANDLERS khớp 1-1, không
  tool nào thiếu handler và không handler nào thừa; `check` 0 lỗi; `doctor` và `setup` chạy
  sạch, không còn mục Giấy phép.

### Thêm — rule `erp-sql-script-location`: file .sql ra ngoài thư mục program

Chuẩn bảo mật do chủ dự án chốt: thư mục program là **thư mục web chạy trên internet**, một file
`.sql` nằm trong đó phát tán toàn bộ cấu trúc bảng và logic proc qua một URL đoán được. Trước đây
`erp-sql-expert` có nói "không ghi vào thư mục chương trình khách" nhưng chỗ ghi thì để ngỏ —
*"nơi người điều phối chỉ định"* — nên thực tế agent ghi thẳng vào workspace đang mở, mà workspace
đang mở **chính là** program.

Rule mới (hard, always) chốt đường dẫn:

    D:\Fast Script\{TenDuAn}\App      -- script chạy trên database nghiệp vụ
    D:\Fast Script\{TenDuAn}\Sys      -- script chạy trên database hệ thống

`{TenDuAn}` là đoạn **áp chót** của program path, không phải đoạn cuối và không phải tên thư mục
workspace: `\\172.168.5.14\CustomerPro\FBO\TFR-SP21\SP21\` → `TFR-SP21` là tên dự án, `SP21` là phiên bản.
Rule nhấn mạnh phải ghi bằng **đường dẫn tuyệt đối** — ghi tương đối là rơi thẳng vào program.

Áp vào 6 asset đang sinh hoặc giao `.sql`: `erp-sql-expert`, `erp-einvoice-customize` (+reference),
`erp-einvoice-nd70-implement`, `erp-category-create`/`database.md`, `erp-voucher-data-lookup`/`reference-mcp.md`.

### Sửa — `erp-deploy-auditor` (v2): đường dẫn manifest có `\` đầu dòng, script đọc ngoài program

- **Đường dẫn web bắt đầu bằng `\`.** `SP21\App_Data\Controllers\Dir\ARTran.f` là **sai**;
  `\SP21\App_Data\Controllers\Dir\ARTran.f` là **đúng** — bên PROD dán vào gốc bản triển khai,
  thiếu `\` thì đường dẫn thành tương đối và giải ra sai chỗ. Gốc là **đoạn cuối** của program path.
- **Bỏ mô tả gốc đường dẫn cũ.** Doc ghi "tên thư mục cuối của programPath, **thường là `Web`**" —
  cấu trúc thật là `…\TFR-SP21\SP21\`, đoạn cuối là mã phiên bản chứ không phải `Web`.
- **Script đọc ở `D:\Fast Script\<TenDuAn>\{App|Sys}`**, không còn đọc `Script\` cạnh program.
- **Thấy `.sql` dưới program là LỖI.** Quét `Glob **/*.sql`; có kết quả thì mở đầu báo cáo bằng mục
  `✘ LỖI` **trước cả khối manifest**, không đưa file đó vào manifest và không dùng nó làm nguồn câu
  lệnh. Agent read-only nên không tự di chuyển, không tự xoá.
- Ràng buộc đường dẫn: từ "một phép biến đổi" thành **hai** — `.xml`→`.f`, và cắt phần đầu program
  path còn `\<PhienBan>\…`.

### Sửa — quét tool ma và id chết trên toàn bộ asset ERP

Bắt đầu từ bốn chỗ nợ lại của hai đợt trước, nhưng quét bằng script đối chiếu **mọi** tên kiểu
`tool_name` trong `assets/**` với 20 tool thật đọc từ `mcp/fbo/lib/tools.mjs` — ra thêm bốn tool ma
nữa và một reference sai tham số từ đầu tới cuối.

**Tool không tồn tại, đã gỡ khỏi 6 file:**

| Tên ma | Nhắc ở | Đường thật |
|---|---|---|
| `generate_sql_for_fields` | `erp-hddv-migrate`, `erp-voucher-data-lookup` | đặc tả `ddl` `kind: "them-cot"` cho `tools/lib/ddl.mjs`, hoặc proc `fsd_addFields` |
| `search_lmdb_fields` · `generate_field_from_lmdb` | `erp-voucher-data-lookup` | `describe_controller` · `search_content` |
| `get_field_info` · `add_clientscript_to_field` · `add_function_to_script` | `erp-hddv-migrate`, `erp-js-implement` | khai `<clientScript>` trên `<field>`, thân hàm trong Include Javascript — không có tool sinh hộ |
| `query_radar` (+ Kuzu/FBOGraph, `build_cmd`, `reference_file`) | `erp-history-search` | `4ai graph build` + skill `pm-graph-maintain` |

`search_qlyc` **giữ nguyên** — nó vốn đã tự khai là thuộc MCP khác chưa được khai trong hub, kèm
chỉ dẫn phải làm gì khi không có. Đó là ghi chú đúng, không phải lỗi.

**Sai tham số:** `reference-mcp.md` của `erp-voucher-data-lookup` mô tả `query_sql` bằng
`type=0/1/2` + `query`, và `resolve_entities` bằng `file_path`/`entities`/`list_all`/`force_reload`
— **không tham số nào trong số đó tồn tại**. Thật là `program` + `object`/`sql`, và
`program` + `path` + `name` + `includeContent`. Viết lại cả file theo schema thật, thêm bảng các
tool còn lại hay dùng trong luồng và mục `allowWrite`. `reference-trace-files.md` của
`erp-history-search` dính cùng lỗi `file_path` + `query_type=1`, sửa luôn.

**Id asset chết** (sót từ đợt chuẩn hoá đặt tên): `fbo_style_sql` → rule `erp-sql-style` (5 chỗ),
`fbo_get_data_one_voucher` → skill `erp-voucher-data-lookup`.

**`StrReplace`** — không phải tên tool của phương ngữ nào; hub compile ra bốn dialect nên đổi
thành mô tả trung lập "sửa theo từng khối, không rewrite cả file" (`erp-einvoice-customize`,
`erp-einvoice-nd70-implement`, `erp-category-create`).

**Một chỗ ngược luật:** `erp-hddv-migrate` bước 9 dặn "bảng partition giữ `$` (`m32$` not `m32`)",
trong khi `addColumn()` **từ chối** spec có `$` rồi tự sinh vòng lặp `LIKE 'm32$%'` áp ALTER cho mọi
partition. Sửa lại kèm ghi chú `phanVung: false` cho bảng đơn — thiếu cờ đó thì vòng lặp khớp không
bảng nào và script chạy êm ru mà chẳng thêm gì.

Version: `erp-einvoice-customize` v2 · `erp-einvoice-nd70-implement` v2 · `erp-hddv-migrate` v2 ·
`erp-history-search` v2 · `erp-js-implement` v2 · `erp-voucher-data-lookup` v3.

### Sửa — `erp-category-create` (v2): đối chiếu với corpus và với bề mặt MCP thật

Skill dạy validation danh mục bằng template tự soạn, chưa đối chiếu với danh mục đang chạy. Chín
chỗ sai, trong đó ba chỗ làm hỏng dữ liệu hoặc không chạy được:

- **`Updated` dùng sai giá trị.** Skill bảo `WHERE` theo `$col.OldValue`; thực tế `Updated` chạy
  **sau** khi dòng đã ghi nên khoá trên đĩa đã là giá trị mới — mọi danh mục thật đều
  `where {pk} = @{pk}` (`zcdmlhdv.xml`, `Item.xml`, `LotVoucherBalance.xml` khoá 5 cột). Theo skill
  cũ thì câu update trúng 0 dòng. `OldValue` trong `Updated` chỉ để dọn **bảng liên quan**.
- **Cấm `LIKE` là cấm ngược.** Idiom chuẩn của mã danh mục là check **lồng nhau** bằng
  `like rtrim(…) + '%'` hai chiều — mã FBO phân cấp theo tiền tố nên `VT` và `VT01` không được cùng
  tồn tại. Chính `description` của skill đã ghi "trùng **và lồng**" trong khi thân skill cấm.
- **`generate_sql_for_fields` không tồn tại.** `4ai-fbo` có 20 tool, không có tool này. Đường tạo
  bảng đúng là cấp đặc tả `ddl` cho `tools/lib/ddl.mjs`; `query_sql` chặn mọi câu ghi trừ
  `allowWrite: true`. Skill cũ bảo chạy `CREATE TABLE` qua `query_sql` — mâu thuẫn thẳng với
  `erp-table-propose` v4 ("không chạy bất kỳ lệnh DDL nào, không tạo sẵn bảng trên DB khách").

Sáu chỗ còn lại:

- **Thiếu hẳn `Deleting`.** 463 file Dir có command này; không có nó là cho phép xoá một mã đang
  được chứng từ tham chiếu. Thêm pattern D kèm `@$deleteConflict`.
- **Thiếu luật `zc`.** Bảng danh mục customize bắt buộc tiền tố `zc` — `danhMucTable()` từ chối
  spec thiếu. View customize là `zv`; sản phẩm chuẩn không có `zv` nào, view join của nó là `v*`.
- **Thiếu chỗ SQL nằm.** 626/629 file `Dir/*.f` có commands `<Encrypted>` — không đọc, không sửa
  được. SQL chữ thường chỉ ở bản customize `.xml`. Đây là điều kiện tiên quyết của cả B3.
- **Structure file không bắt buộc.** 42/599 bảng Dir có; danh mục `zc` đang chạy thật thì không.
  File rỗng ruột, mang `lastupdate`/`user`, tự khai "do not modify" — dấu hiệu do ứng dụng ghi.
- **`%s1` mới là dạng chuẩn**, kể cả khi chỉ một placeholder (232 lần, so với 72 lần `%s` trần).
- **`StrReplace` không phải tên tool nào** — đổi thành mô tả trung lập theo phương ngữ.

Thêm vào reference: gán cột audit bằng `select @datetime0 = …` trong `Inserting` (không phải
`update`); khối `<script>` với cặp `active$`/`close$` nối từ `Loading`/`Closing`; entity giữa CDATA
phải `]]>&k;<![CDATA[`; `fsd_StringToTable` trả `_id` + `val`.

Nguồn đối chiếu: corpus `FBISP24` và `mcp/fbo/lib/tools.mjs`, `tools/lib/ddl.mjs`.

Còn nợ: `generate_sql_for_fields` vẫn được nhắc trong `erp-hddv-migrate` và
`erp-voucher-data-lookup`; `StrReplace` vẫn còn ở `erp-einvoice-customize` và
`erp-einvoice-nd70-implement`.

### Sửa — `erp-view-design` (v2): bám vào đường render XML → HTML thật

Skill mô tả layout theo XSD và suy luận, chưa đối chiếu với tầng render và với corpus. Bảy chỗ
sai hoặc thiếu, tất cả đều đổi cách sửa file:

- **`height` không đặt chiều cao vùng main** — main co theo nội dung; `height` áp cho tab không
  chứa Grid, tab có Grid lấy `field@rows`. Bỏ ghi chú về biến thể typo `heigth`: corpus không có
  lần nào.
- **`&TabHeightFomula;` là giá trị `height` phổ biến nhất** (564 view, gần như toàn bộ ở
  `Filter/`). Đổi chiều cao màn hình lọc = khai đè `LineCounter`/`ExtensionCounter` **trước** dòng
  nạp `Include/TabHeightFomula.ent`, không gõ px vào `height`.
- **Độ dài pattern không phải bất biến.** Ngắn hơn số cột thì pad `-` (rất phổ biến), dài hơn thì
  **bị cắt** — cắt trúng một `1` là mất control không báo. Bất biến thật: số `1` = số token, và
  mọi `1` phải rơi trong số cột.
- **`.Footer` không phải vùng footer** — cùng đường render với `.Description` (đọc `<footer>`, rơi
  về `<header>`); vùng footer do `categoryIndex="-1"` quyết định. `[field].` chấm rỗng đọc thành
  Input, không phải footer. Thêm ba typo có thật trong corpus: `.Desciption` (95 lần) và họ hàng.
- **Vùng của một hàng suy từ `categoryIndex` của field**, không từ thứ tự `<item>`; thứ tự tab là
  thứ tự khai, không sort theo index.
- **`<item value="0">` trong `<field><items>` là lựa chọn dropdown**, không phải layout — gần một
  phần tư số thẻ `<item>` trong `Dir/`+`Filter/` thuộc loại này.
- **Tên trong `[]` so nguyên văn**: `%l` là một phần của tên (`[ten_tk%l]`), và tên có thể chính
  là entity (`[&k;]`).

Thêm `references/reference-render-pipeline.md`: bảng ánh xạ XML → thẻ HTML, ba hệ quả của
`table-layout:fixed` (bề rộng bảng = tổng px, không có width cho một ô, nội dung dài bị cắt), và
mục "cái gì bị bỏ khi render" — hàng toàn field `hidden` không được phát ra, đó là câu trả lời
cho "khai field rồi mà không thấy đâu".

Nguồn đối chiếu: `DevWorkFlow/docs/04-DESIGNER_PLATFORM.md` và corpus `FBISP24` (646 file `Dir/`,
2.102 file `Filter/`).

### Đã gỡ — đường đóng gói plugin (Claude Code + Cursor)

- **Lý do.** Kế hoạch phân phối hub này dưới dạng plugin không gom đủ thành phần để chương
  trình chạy được ở đầu người cài. Giữ một đường đóng gói không dùng tới nghĩa là mỗi lần sửa
  asset lại phải dựng lại hai gói và commit 374 file output — chi phí thật cho một artifact
  không ai cài.
- **Xoá khỏi repo**: `plugins/4ai/`, `plugins/4ai-cursor/`, `.claude-plugin/marketplace.json`,
  `.cursor-plugin/marketplace.json`, `tools/lib/emit/plugin.mjs`,
  `tools/lib/emit/cursor-plugin.mjs`.
- **Compiler còn bốn phương ngữ**, không phải sáu. `TARGETS` trong `schema.mjs` bỏ `plugin` và
  `cursor-plugin`; `paths.mjs` bỏ hai `case` ở `emitPaths()` và `mcpPath()`; `sync.mjs` bỏ
  `PACKAGE_TOOLS` — mọi target giờ nhận bản MCP đã giải `{{HUB}}`, không còn nhánh giữ token.
- **`emit/common.mjs` bỏ phần chép runtime vào gói** — `RUNTIME_DIRS`, `RUNTIME_EXCLUDE`,
  `runtimeFiles()`, `bareCommand()`, `signRuntime()` và bảng `COMMENT_SYNTAX` chỉ có hai
  emitter kia gọi. `assets.mjs` bỏ luôn `descriptionRaw`/`bodyRaw`: chúng tồn tại chỉ để gói
  phân phối không đóng cứng danh tính PM của máy build.
- **`targets.json`** bỏ hai target `plugin` / `plugin-cursor` (và cặp field `pluginName`,
  `pluginVersion`); `mcp/servers.json` bỏ hai tool khỏi mảng `targets`.
- **Giấy phép và `stateRoot()` giữ nguyên.** Chúng là tầng runtime, không phải tầng đóng gói —
  gỡ chúng là một quyết định khác, chưa lấy. Hệ quả cần biết: `isSourceHub()` luôn đúng khi
  chạy từ repo, nên hàng rào giấy phép hiện không cưỡng chế ở đâu cả.
- **Docs theo sau**: `README.md` (mục Cài đặt còn đúng một đường clone + `sync`; xoá mục *Dựng
  lại plugin*), `BETA.md`, `docs/TARGET-MATRIX.md` (bảng còn bốn cột), `docs/ASSET-FORMAT.md`,
  `docs/NAMING-MIGRATION.md`.
- **Kiểm chứng**: `check` 0 lỗi; `sync --dry-run` hai lần liên tiếp cho kết quả giống nhau,
  0 created / 0 updated trên target `4ai`; `test-setup.mjs` bỏ nhóm assert về `.mcp.json` của
  gói, còn lại vẫn PASS.

### Thêm — agent `erp-deploy-auditor`: manifest mang qua PROD

- **Vấn đề.** Cuối một đợt customize, danh sách hiện vật phải copy qua PROD được gom bằng trí
  nhớ: controller nào đã sửa, câu lệnh SQL nào phải chạy. Program của khách không phải git
  repo nên không có `git status` để đối chiếu, và bỏ sót một câu `alter` chỉ lộ ra lúc PROD
  chạy sai.
- **Nguồn sự thật là bản ghi phiên làm việc**, không phải mtime. Ba nguồn theo thứ tự: danh
  sách file phiên chat để lại, ledger entry của đợt việc, rồi filesystem — nhưng filesystem
  chỉ dùng để *xác nhận* đường dẫn có thật, không để *phát hiện*. Quét mtime bị build, deploy
  và antivirus làm nhiễu, và một manifest thừa file nghĩa là PROD nhận thứ chưa ai duyệt.
- **Phần Web ghi đuôi `.f`.** DEV sửa `Dir\Customer.xml`, PROD nhận bản compile, nên manifest
  ghi `Web\App_Data\Controllers\Dir\Customer.f`. Thân include `.txt`, `.rpt`, `.xsd` giữ
  nguyên đuôi vì không có bản compile tương ứng.
- **Phần SQL xuất câu lệnh, không xuất tên file** — hai heading `Script App` / `Script Sys`,
  câu lệnh chép nguyên văn từ `Script\App\NN <Stored|Function|Data>.sql` và
  `Script\Sys\NN.sql` có sẵn, giữ đúng thứ tự số vì đó là thứ tự phụ thuộc. Agent không được
  tự viết câu lệnh: thay đổi SQL không có script thì rơi vào mục *Cần xác nhận*.
- **Read-only** — không `Edit`, không `Write`, không chạy script; đúng role `auditor` trong
  danh sách đóng của `docs/NAMING.md`.
- **`erp-agent-routing` (v2)** thêm một dòng định tuyến. Không có nó thì rule hard đó vẫn nói
  chỉ có sáu cửa, và không ai gọi tới agent mới.


### Thêm — skill `erp-retrieve-implement`: nối dây nút Lấy dữ liệu (Retrieve)

- **Vấn đề.** Hub đã có `erp-voucher-data-lookup`, nhưng nó bắt đầu từ *sau* khi màn hình lọc
  đã mở: ánh xạ cột, `fsdSttRecRef`, proc `BeforeAfterUpdate`. Phần đứng trước — khai
  `<button command="Retrieve">`, đánh số `commandArgument`, viết `case` trong
  `on$…$ExecuteCommand`, chọn giữa SingleForm và MultiForm — chưa được viết ở đâu, nên mỗi
  lần thêm một nguồn lấy số liệu là một lần đọc lại file mẫu từ đầu.
- **Ranh giới giữa hai skill.** `erp-retrieve-implement` lo **nối dây** (ba tầng: toolbar →
  script dispatch → Filter → Single/MultiForm); `erp-voucher-data-lookup` lo **số liệu**.
  Người thêm một `menuItem` vào nút đã có chỉ cần nửa đầu và không bao giờ cần nửa sau — đúng
  ranh giới tách theo `docs/NAMING.md`.
- **Bốn file `references/`**: `toolbar-menu.md` (button một nguồn vs `menuItems`, separator ăn
  một `commandArgument`, hậu tố `$$<px>`), `script-dispatch.md` (bộ ba
  `load$`/`dispose$`/`ExecuteCommand`, hai guard `View` + `validFields`), `filter-single.md`
  (`_looking` + `add_loading`, memvar sang Lookup), `filter-multi.md` (mẫu SQL `Inserting`
  chuẩn với `@vcNumber`/`@vcID`, `OtherCopyField`, `#t` id trong MultiGrid).
- **Bất biến được nêu thành mục riêng**: điều kiện trong `{Src}Lookup` và trong `{Src}MultiGrid`
  phải giống nhau. Lệch thì NSD chọn được trong lookup nhưng màn hình sau trả rỗng, và không
  có thông báo lỗi nào — triệu chứng đắt nhất của luồng này.
- **Không thêm `kind: agent`.** Retrieve là một quy trình, không phải một vai; `docs/NAMING.md`
  cấm đặt quy trình thành agent. Thay vào đó `erp-xml-expert` (v2) tách bảng định tuyến thành
  hai dòng — nối dây và số liệu — trỏ về hai skill.
- **Neo trên code thật**: `Include\XML\SVDetailRetrieve.txt` và
  `Include\XML\SeparateInvoice.SVDetailRetrieveToolbar.txt` (cùng một nút ở hai cấu hình), họ
  file `SVOrder*` / `SVIssue*`, callback `on$&Identity;Filter$Retrieve$QueryComplete` xác minh
  qua `Include\XML\AutoLotForm.xml`.
- **Mục *Vùng đối chiếu* chép nguyên ba khai báo XML vào thân skill** — một nguồn, hai nguồn,
  ba nguồn — thay vì trỏ tới file mẫu. Lý do: `.f` mã hoá không đọc được, và chương trình của
  khách có thể chưa có bản `.xml` customize nào để mà mở; đọc version cũ thì so được ngay
  đang ở dạng nào. Đổi lại, B2 chỉ còn bảng luật, không lặp XML.
- **Đường dẫn dùng `{SysID}`, không phải mã chứng từ.** File controller đặt theo `sysid`
  (`wcommand`), còn `dmct.ma_ct` là thứ NSD nói — `Grid\SVDetail` là màn hình của `SVTran`,
  mã ct `HDA`. Skill nêu phân biệt này ở đầu và trỏ `erp-glossary-reference` cho bảng ánh xạ.

### Đổi — chuẩn hoá đặt tên toàn bộ 67 asset

- **Vấn đề.** Tiền tố asset mọc tự phát: `fbo-`, `pm-`, `4ai-`, và một asset mang tên cá
  nhân hoá (`my-style-sql`). Hai id viết bằng tiếng Việt (`fbo-tim-qua-khu`,
  `fbo-nd252-ty-gia-hq`) vi phạm chính quy ước "identifier tiếng Anh" của repo. Agent đặt
  theo tầng kỹ thuật (`fbo-backend`, `fbo-frontend`) chứ không theo vai, nên đọc tên không
  biết nó được phép làm gì. Không có chỗ nào cưỡng chế, nên mỗi asset mới lại lệch thêm.
- **`docs/NAMING.md`** — quy ước: ba scope (`4ai` hub, `erp` cho FBO+FBI gộp, `pm` dự án
  khách), scope là segment đầu của `id` và bằng luôn `domain` và bằng tên thư mục. Mỗi kind
  một pattern: rule `<scope>-<domain>-<concern>`, skill `<scope>-<object>-<capability>`,
  agent `<scope>-[<specialty>-]<role>`, command `<scope>-<action>[-<object>]`.
- **Cưỡng chế bằng code, không bằng lời nhắc.** `validateNaming` trong `schema.mjs` với
  `SCOPES` / `SKILL_CAPABILITIES` / `AGENT_ROLES` là danh sách đóng; `NAMING_ENFORCED` phủ
  mọi kind nên sai tên là ERROR chặn sync. `4ai new` từ chối in skeleton cho id sai chuẩn —
  asset lệch không ra đời được ngay từ đầu.
- **Ba asset rời kind `agent`** vì chúng là quy trình chứ không phải vai. Cũ → mới:
  regulatory-rollout → skill `erp-rollout-execute`; release-handover → skill
  `pm-handover-author`; deadline-review → skill `pm-deadline-review` (id giữ nguyên).
  Đánh đổi: chúng không còn chạy trong context riêng.
- **Slash command đổi tên** — bảng đầy đủ trong `docs/NAMING-MIGRATION.md`. Hình dạng:
  lệnh hub về scope `4ai` (`/4ai-sync`, `/4ai-doctor`, `/4ai-skill-create`), lệnh ERP về
  scope `erp` (`/erp-screen-find`, `/erp-diff-review`, `/erp-sql-query`). `/pm-status` và
  `/pm-review` giữ nguyên vì đã đúng chuẩn.
- **Hai field metadata mới**: `status` (`draft`/`active`/`deprecated`) và `owner`. Không thêm
  `kind: hook` — hub chưa có primitive đó.
- **Ghi nhận chưa xử lý**: `docs/ASSET-FORMAT.md` và `docs/TARGET-MATRIX.md` được `CLAUDE.md`
  khai là nguồn chuẩn cao nhất nhưng không tồn tại trong repo.

### Thêm — từ điển thuật ngữ Fast ERP: sub-agent `erp-glossary-expert` + corpus `erp-glossary-reference`

- **Vấn đề.** Yêu cầu của khách viết tắt theo thói quen kế toán Việt Nam (`LSX`, `PXK`, `NCC`,
  `NXT`), Fast lại đặt mã 3 ký tự và tên tiếng Anh riêng, còn code thì gọi bằng `sysid`
  controller. Ba lớp tên cho cùng một thứ, không có chỗ nào nối chúng lại — mỗi lần gặp một
  mã lạ là một lần tra tay từ đầu, và đoán sai `sysid` từ `ma_ct` là lỗi lặp lại.
- **`assets/skills/erp/erp-glossary-reference.md` + `references/`** — ba file từ điển,
  quét từ DB thật của một chương trình FBI SP2422, không phải soạn từ trí nhớ:
  - `vouchers.md` — 122 loại chứng từ từ `dmct` (db app) ghép `wcommand` (db sys): mã ↔ tên
    tiếng Việt ↔ tên tiếng Anh (`dmct.ten_ct2`, tên chính Fast đặt) ↔ `sysid` controller ↔
    bảng header (`m_phdbf`) và chi tiết (`m_ctdbf`), nhóm theo 16 phân hệ. Kèm mục cặp
    "kế hoạch/thực tế" (`PXA` vs `PXH`) và mã trùng dễ nhầm.
  - `naming.md` — quy tắc đặt tên đo trên toàn db (14.635 bảng, 312 `dm*`): tiền tố bảng
    `dm`/`ph`/`ct`/`cttt`/`ctgt`/`bim`/`$log`, tiền tố cột kèm tần suất thật (`ma_` 108.278
    lần, `sl_`, `tk_`, `tien_`), hậu tố `2` = bản tiếng Anh, `_nt` = ngoại tệ, quy ước `sysid`
    (`*Tran`, `W*Tran` kho thực tế, `BI*` mua hàng), phân kỳ `$yyyyMM`.
  - `abbreviations.md` — viết tắt người dùng gõ ↔ mã Fast ↔ English, có cột **Nguồn** phân
    biệt "đọc từ DB" với "cách gọi nghiệp vụ" để không ai lỡ đem cách gọi tắt vào code.
- **`assets/agents/erp/erp-glossary-expert.md`** — sub-agent read-only (`tools` không có
  Edit/Write). Tra từ điển tĩnh trước, chỉ gọi tool khi từ điển thiếu hoặc câu hỏi gắn với
  một program cụ thể. Báo cáo bắt buộc có mục *Nguồn & độ tin* (ghi rõ đã xác minh trên
  program nào) và *Entry đề xuất bổ sung* — đó là cơ chế để từ điển lớn dần mà vẫn qua duyệt.
- **Giới hạn đã ghi rõ trong asset**: từ điển là ảnh chụp SP2422. Khách chạy SP khác hoặc đã
  customize `dmct` thì phải xác minh lại bằng `resolve_vouchercode` / `query_sql` trên đúng
  program, và agent buộc phải nói ra điều đó thay vì khẳng định suông.

### Thêm — lớp định nghĩa cấp program: `erp-program-config-lookup`, bắt đầu bằng `Options.xml`

- **Vấn đề.** Controller không tự khai mặt nạ định dạng; nó viết `dataFormatString="@quantityInputFormat"`
  rồi trỏ ra `App_Data\Controllers\Options\Options.xml`. Đọc controller mà không biết lớp này
  thì không biết giá trị thật là gì, và không biết sửa ở đâu.
- **`assets/skills/erp/erp-program-config-lookup.md`** — mục lục cả họ file cấu hình trong
  `Options\` (22 mục), mỗi mục ghi rõ **đã lập tài liệu** hay **chưa lập tài liệu** — chỗ để
  các định nghĩa program sau này nối vào. Kèm quy trình 4 bước khi gặp một khai báo lạ
  (đọc `.xsd` trước, đọc `xmlns`, tìm chỗ dùng thật, so giữa các program) và tiêu chuẩn để
  một file được coi là đã lập tài liệu.
- **`{REFDIR}/options-xml.md`** — đặc tả `Options.xml`, dựng từ file thật chứ không từ ví dụ:
  - Cấu trúc đọc từ `Options.xsd`: `var/@name` là `xs:key` (cấm trùng), `@type` chỉ nhận
    `String`/`Numeric`/`DateTime`/`Variant`, nút con `header`/`expresion` theo `xs:sequence`.
  - **Cú pháp tham chiếu: `@<name>`, chỉ trong thuộc tính `dataFormatString`** — đã quét
    `Grid`/`Structure`/`Filter`/`List`/`Lookup`, không thuộc tính nào khác nhận nó.
  - 29 mặt nạ định dạng kèm giá trị và **số lần dùng đo được** (`datetimeFormat` 3394,
    `foreignCurrencyAmountViewFormat` 2221…), 12 mã số giới hạn độ dài field.
  - Quy tắc Input↔View: hai bản khác nhau đúng một ký tự (`##0` vs `###`) — Input giữ số 0,
    View giấu số 0. Tiền VND không có số lẻ, tiền ngoại tệ có 2 số lẻ.
  - **So 4 program** (FBI SP2422/SP2421/SP24, FBO SP2264): 29 mặt nạ giống hệt, nhưng nhóm mã
    số thì không — SP2264 có thêm `112`, và `111` là `014` thay vì `018`. Nên không copy file
    này giữa các khách.
  - Bẫy có thật: `Filter\zcSyncSaMoPN1Filter.f:60` dùng `@exchangeRateFormat` — **không có
    var nào tên đó**; field `hidden="true"` nên chưa ai thấy hỏng.
- **`erp-glossary-expert` + `erp-glossary-reference`** nối sang lớp mới: cụm bắt đầu bằng `@` hoặc là
  tên file trong `Options\` thì agent nạp `erp-program-config-lookup` thay vì corpus thuật ngữ.

#### Nửa thứ hai — bảng `options` và quan hệ chiếu ra file

Lớp cấu hình cấp program có **hai nửa**, không phải một: file lo *hiển thị thế nào*, bảng
`options` (db app) lo *phần mềm cư xử thế nào*. Skill đổi thành mục lục cả hai.

- **`{REFDIR}/options-table.md`** — 512 tùy chọn trải 17 phân hệ (GL chiếm 169), khoá tra cứu
  là `name` (duy nhất toàn bảng, 512/512) chứ không phải `stt` (trùng trong cùng phân hệ),
  khuôn tra chuẩn `select rtrim(val) from options where name = '...'` với chỗ dùng thật, 9 họ
  tiền tố tên, và công thức tìm các dòng khách đã đổi khỏi mặc định (`val <> defaul`).
- **Truy được cơ chế nối hai nửa.** Cột `options.xmlformat` chứa bản đồ chiếu, nguyên văn
  `Options{quantityInputFormat:%s}{quantityViewFormat:<CASE CHARINDEX('.', %s) ...>}Report{roundQuantity:<...>}`.
  Kiểm chứng đầu-cuối: `m_ip_sl.val` = `# ### ### ##0.00` → `Options.xml/quantityInputFormat`
  khớp từng ký tự; `m_round_sl.val` = `2` → `Report.xml/roundQuantity` `<header v="2"/>` khớp.
- **Sửa một kết luận sai ở lần trước.** `options-xml.md` từng ghi `HourInputFormat`/`HourViewFormat`
  "phá quy tắc `0`↔`#`". Sai — luật sinh thật nằm trong `xmlformat`: có dấu thập phân thì
  `REPLACE(val,'0.','#.')`, không thì `REPLACE(val,'0','#')`. Áp vào `#000.00` ra đúng `#00#.00`.
  Đã thay đoạn suy đoán bằng luật có nguồn.
- **Phát hiện trôi giữa hai nguồn.** Trên chương trình đã đo, 3/12 mặt nạ định dạng lệch nhau
  giữa bảng và file (`m_ip_cs` ≠ `CapacityNumberInputFormat`, `m_ip_diem` ≠ `markInputFormat`,
  `m_ip_gio` ≠ `HourInputFormat`). Hậu quả không đối xứng: lưới đọc file, SQL trong
  `Include`/`Message` đọc bảng — cùng một con số hiện hai kiểu.
- **Ghi rõ hai chỗ chưa biết** thay vì đoán: ý nghĩa cột `attribute` (0/1, không tương quan
  sạch với `sysvar` hay `inputmask`), và thời điểm engine chạy bước chiếu `xmlformat` ra file
  (`xmlformat` không được tham chiếu từ bất kỳ controller nào).

### Thêm — catalog Form/Grid API và token runtime, bóc từ tài liệu FBOR2SP19.1

Nguồn: *"Hướng dẫn lập trình FBOR2SP19.1"* (ThắngLV, FHN, 2023). Bỏ mục III.1 (công cụ) và
mọi link `kb.fast.com.vn` theo yêu cầu — link đã chết.

- **`erp-js-api-reference` v2 + `{REFDIR}/form-grid-api.md`.** Skill này trước đây tự khai *"không có
  catalog API chính thức trong hub"*; giờ có: 21 hàm/thuộc tính Form, ~50 của Grid, 12 sự kiện
  vòng đời controller (`Loading`/`Scattering`/`InitExternalFields`/`Inserting`…), cú pháp biểu
  thức `[trường]:=[a]*[b]` dùng trong `assignExpression`/`sum`/`allocate`/`validRowExpression`.
- **Đối chiếu SP19.1 → SP2422 thay vì chép suông.** Đếm số file trong `Controllers\Include\`
  của một chương trình FBI SP2422 dùng từng tên hàm: 17/18 còn sống (`getItemValue` 246 file,
  `_getColumnOrder` 214, `parentForm` 186…). **`assignAggregate` = 0 file trên toàn bộ
  `Controllers\`** — đã biến mất khỏi SP2422, việc của nó do `executeAggregate` đảm nhiệm.
  Ghi rõ trong catalog là đừng viết vào code mới.
- **`erp-glossary-reference` + `{REFDIR}/runtime-tokens.md`** — 13 biến session SQL và 16 biến
  cookie. Bảy `@@` token đã thấy dùng thật trong mã SP2422 (`@@unit`, `@@language`, `@@userID`,
  `@@queryParameter`, `@@table`, `@@stt_rec`); phần còn lại đánh dấu nguồn là tài liệu.
  Kèm hai bẫy chính tả có thật: `@@copping` hai chữ `p`, và `@@language` tài liệu ghi `V`/`E`
  hoa nhưng code so bằng chữ thường.

### Sửa — `PH81` không phải tên bảng; `naming.md` và `vouchers.md` từng để người đọc hiểu nhầm

Mục III.5.1 của tài liệu nói bảng chứng từ phân kỳ có dạng `M81$yyyyMM`/`D81$yyyyMM`/
`I81$yyyyMM`/`C81$000000`. Kiểm trên DB thật thì **bảng `PH81` và `CT81` không tồn tại** —
`m81$202601` và `c81$000000` thì có; toàn db chỉ có 13 bảng tên `ph*`.

- `dmct.m_phdbf`/`m_ctdbf` là **tên logic thời DBF**, không phải luôn là tên bảng. Dạng **có
  số** (`PH81`, `PH31`) ⇒ bốn bảng vật lý `m`/`d`/`i`/`c` + `$yyyyMM`; dạng **toàn chữ**
  (`PHSX`, `PHDM`, `DMTS`) ⇒ đúng là tên bảng, không phân kỳ.
- Xác nhận chéo trong controller: `Grid\APDetail.f:21` khai `table="d31$000000"` và dòng 24
  khai `<partition table="c31$000000" prime="d31$" inquiry="i31$"/>`, trong khi `dmct` của
  `PN1` ghi `m_phdbf = PH31`.
- Bổ sung vai trò bốn bảng (`M` chung · `D` chi tiết · `I` tìm kiếm · `C` truy vấn), khuôn
  `$000000` không chứa dữ liệu, và yêu cầu tạo index cho tất cả khi thêm loại chứng từ mới.
- Nhóm toàn chữ chỉ tồn tại nếu phân hệ đó được triển khai: `dmct` khai `PHT1`, `PHWO`,
  `PHDC1`, `PHEX` nhưng bảng không có vì khách không dùng phân hệ TX/SF/CF.
- Thêm vào `naming.md`: một màn hình phải khai ở **cả** `wcommand` **và** `command` (db sys),
  `sysid` hai bảng phải giống nhau, `type = 'D'` cho danh mục và rỗng cho báo cáo.
- Ghi nhận một giới hạn của tool: `search_content { in: "js" }` trả 0 ngay cả với truy vấn
  `"function"` trên chương trình đã thử — **kết quả rỗng ở đó không phải bằng chứng không tồn
  tại**. Đã ghi vào cả `erp-js-api-reference` lẫn catalog.

### Sửa — corpus trả lời sai "sổ kho là bảng nào": `ct70` đã lỗi thời, đúng là `r70$yyyyMM`

Người dùng hỏi *"sổ kho là bảng nào"* và nhận về `ct70`. Sai — `ct70`/`ct90` là di sản, bảng
chính thức là `r70$yyyyMM`/`r90$yyyyMM`; sổ cái là `r00$yyyyMM` chứ không phải `ct00`.

Đo trên một chương trình FBI SP2422 để xác minh trước khi sửa:

| | Kiểu | Số lượng | Dữ liệu |
|---|---|---|---|
| `r00$…` `r70$…` `r90$…` | phân kỳ theo tháng | **37 bảng mỗi loại** | `r00$202608` có 40 dòng |
| `ct00` | không phân kỳ | 1 | 40 dòng, **trùng đúng nội dung** `r00$202608` |
| `ct70` `ct90` | không phân kỳ | 1 mỗi cái | **0 dòng** |

Và không có SQL nào trong `Controllers\` nhắc tới `ct00`/`ct70`/`ct90`; stored procedure ghép
tên động `'r70$' + @period`. Viết `FROM ct70` thì câu lệnh chạy nhưng luôn trả 0 dòng — sai im
lặng, không có thông báo lỗi nào.

- **Luật mới, phát biểu chung:** hai bảng cùng định nghĩa thì bản **tách kỳ** (`$yyyyMM`) là
  bản chính thức, bản không hậu tố là di sản. Ghi ở `erp-glossary-reference` → `naming.md`, và
  nâng thành ràng buộc cứng trong rule `erp-sql-style` §7.2b (bảng Dùng / KHÔNG dùng).
- **Nối vào luật "tên logic ≠ tên bảng" đã có.** `CT00`/`CT70`/`CT90` trong `dmct.m_phdbf` là
  giá trị từ điển, cùng loại với `PH81` — bảng thật là `r00`/`r70`/`r90` + `$yyyyMM`. Bảng ánh
  xạ trong `naming.md` nay có thêm dòng này.
- **Sửa 4 file:** `naming.md`, `vouchers.md` (cảnh báo ngay ở phần chú giải, vì cột Header của
  122 dòng bên dưới là giá trị `dmct` thật, không sửa), `erp-sql-reference/business-tables.md`
  (đảo `r*` lên trước, đánh dấu `ct*` lỗi thời), và mục lục `erp-sql-reference.md`.
### Sửa — `SP` là "sản phẩm", không phải "Service Pack"; và cách đọc mã phiên bản

`abbreviations.md` đang ghi *"SP = Service Pack"*. Sai. `SP` viết tắt của **"sản phẩm"**, và
mã `ma_pbsp` là bốn đoạn ghép lại chứ không phải một chuỗi liền.

    FBO   R2   SP   2422
     │     │    │    └── số hiệu phiên bản
     │     │    └─────── "sản phẩm"
     │     └──────────── thiết kế vòng 2 (tuỳ chọn; `HRM` cũng là đoạn tuỳ chọn)
     └────────────────── dòng sản phẩm

**Quy tắc số: mỗi chữ số là một thành phần, đệm `0` cho đủ bốn.** `SP24` = 2.4.0.0 ·
`SP242` = 2.4.2.0 · `SP2422` = 2.4.2.2 · `SP224` = 2.2.4.0 · `SP10` = 1.0.0.0. Hệ quả dễ đảo
ngược nhất: **`SP24` mới hơn `SP224`** dù ít chữ số hơn.

- Ghi ở `erp-glossary-reference` → `abbreviations.md`, mục *Đọc mã phiên bản sản phẩm*, kèm
  22 mã gặp thật đo trên `nbdmda`.
- **Ba dạng không khớp quy tắc, ghi là chưa chốt** thay vì tự quy đổi: `FBOSP22621` có **5 chữ
  số** trong khi quy tắc chỉ cho bốn thành phần; `FBOR2SP20.1` và `FBOR2SP225.5` mang **dấu
  chấm thật** (đường dẫn FABICO lại ghi `R2SP2255` không chấm); và VITRAC có
  `ma_pbsp = FBOR2SP224` nhưng `ten_da` ghi **"(SP22.4)"** — người viết đọc hai chữ số đầu
  thành major `22`, ngược quy tắc.
- **Bẫy mới ghi lại:** `ma_pbsp` và đường dẫn program **lệch nhau được**. BELGACAM khai
  `FBOHRMSP2261` nhưng program ở `CustomerPro\FBI\BELGACAM\SP2261` — mã nói FBO, đường dẫn nói
  FBI. Lấy dòng sản phẩm theo đường dẫn thật.
- `pm-program-lookup` (v2) nối sang mục giải mã — đó là nơi người ta nhận `sp` lần
  đầu từ `list_programs`.

### Thêm — hai agent theo TẦNG: `erp-sql-expert` và `erp-xml-expert`, cùng rule định tuyến

Tri thức FBO đã đủ (21 skill, 631 KB) nhưng **không có cửa vào**: 10 agent hiện có đều hình
dạng *việc* (explorer, customizer, reviewer, glossary), không cái nào là *người phụ trách một
tầng*. Hỏi một câu backend thì không ai được gọi, model tự chọn giữa 21 skill — đúng cơ chế đã
đẻ ra câu trả lời "sổ kho → `ct70`".

- **`erp-sql-expert`** — proc, function, bảng, sổ, tùy chọn nghiệp vụ. Giá trị chính là **thứ tự
  nạp bắt buộc**: `naming.md` (chốt bảng nào) → `options-table.md` (tùy chọn có đổi bảng
  không) → grep `fsd-objects`/`functions`/`procedures` (logic đã có chưa) → mới áp
  `erp-sql-style` và viết. Có Write để giao file `.sql`, nhưng **cấm** `allowWrite` trên
  `query_sql` và cấm ghi vào thư mục chương trình khách.
- **`erp-xml-expert`** — controller XML, layout, lưới, JavaScript. **Read-only có chủ đích**:
  thiết kế cách làm rồi giao `erp-builder` thi hành. Bảng tra "việc nào → skill nào", và
  tách rõ hai skill JS: cần **tên hàm** → `erp-js-api-reference`, cần **dựng luồng** → `erp-js-implement`.
- **`erp-agent-routing`** (rule, `always: true`, `severity: hard`) — mảnh làm cho hai agent
  thật sự được gọi. Vào thẳng `4ai-context.md`. Nêu bảng định tuyến đủ 7 lối, và hai bẫy: nạp
  skill thay cho gọi agent (mất ba bước tra cứu đứng trước), và giao nhầm tầng ("lưới hiện sai
  định dạng số" nghe như frontend nhưng mặt nạ có thể đến từ bảng `options`).
- Việc chạm **cả hai tầng** phải giao cả hai theo thứ tự rồi hợp nhất — cấm một agent đoán hộ
  phần của tầng kia.
- `erp-explorer` (v2) và `erp-builder` (v2) khai thêm ranh giới: explorer trả lời *"nó ở
  đâu"*, không trả lời *"làm thế nào"*; customizer là người thi hành bản thiết kế do hai agent
  tầng giao xuống.

**Kiến trúc giữ nguyên phân vai**: agent cầm *thứ tự và kỷ luật*, skill cầm *nội dung*. Không
đổ knowledge vào thân agent — `assets.mjs:277` chỉ cho `kind: skill` mang `references/`, và
531 KB reference sẽ không có chỗ nào để sống.

### Thêm — 5 quy ước SQL mới vào rule `erp-sql-style` (v3), rút từ một ca review thật

Đối chiếu `zc_AutoClosingQuantityWIP.sql` với rule thì rule còn thiếu năm chỗ. Bổ sung, mỗi
mục kèm cặp SAI/ĐÚNG lấy từ chính file đó:

- **§3.1 — đệm chuỗi dùng `ff_PadL`/`ff_PadR`.** `RIGHT(SPACE(16) + RTRIM(x), 16)` là viết lại
  hàm đã có; `ff_PadL(@cpItem varchar, @nLen tinyint)` nằm sẵn trong `functions.md`.
- **§3.2 — đã chuẩn hoá một lần thì không chuẩn hoá lại.** Giá trị đã đệm/cắt lúc nạp vào
  `#temp` thì lúc so sánh để **trần**; bọc lại `RTRIM` ở cả hai vế vừa vô nghĩa vừa giết index.
  Quy tắc: chuẩn hoá **ở biên**, so sánh **ở trong**.
- **§4.1 — `ISNULL` chỉ khi cột thật sự có thể NULL.** Cột đọc thẳng từ bảng `NOT NULL` không
  bao giờ NULL; `ISNULL` đúng chỗ là vế phải của `LEFT JOIN`. Bọc trong `WHERE` thì mất index
  y như `RTRIM`.
- **§4.2 — khử trùng bằng `GROUP BY`, không `DISTINCT`.** Cùng kết quả, nhiều đường thực thi
  hơn cho optimizer, và đọc rõ ý định hơn khi sau đó còn `SUM`/`MAX`.
- **§7.2 — `SELECT TOP 0` là BẮT BUỘC**, kể cả khi đã có `RIGHT JOIN … ON 1 = 0`. Hai thứ làm
  hai việc khác nhau: `RIGHT JOIN` bỏ ràng buộc `NOT NULL`/`IDENTITY`, `TOP 0` bảo đảm không
  đọc dòng nào. Ví dụ mẫu trong rule trước đây thiếu `TOP 0` — đã sửa.
- **§7.2a — struct `#temp` dựng TỪ BẢNG THẬT.** Cột đã có ở bảng nghiệp vụ thì mượn kiểu từ đó;
  gõ tay `CAST('' AS CHAR(16))` là tự chép lại độ dài, sai một ký tự là cắt cụt dữ liệu.
- Checklist §11 cập nhật theo cả sáu mục.

### Thêm — danh mục `fsd_*`: 29 đối tượng, lớp tiện ích của bộ phận lập trình

`erp-sql-reference` có `ff_`/`fs_`/`Fast*`/`ds_`/`rs_` nhưng **không có `fsd_*`** — trong khi
code customize gọi chúng liên tục (`fsd_GetSQLInsert`, `fsd_StringToTable`, `fsd_addFields`).

`{REFDIR}/fsd-objects.md` — 29 đối tượng quét từ db thật, đủ chữ ký và kiểu trả về, nhóm theo
việc: sinh câu lệnh · chuỗi và danh sách · sinh mã tăng dần · ngày và kỳ · DDL và bảng tạm ·
gộp nhóm và phân quyền. Nêu rõ đây là **lớp customize**, không phải sản phẩm chuẩn — program
khách khác có thể thiếu, phải kiểm trước bằng `query_sql { object }`.

Một bẫy có thật ghi lại: **`fsd_InsertGroupMulti` và `fsd_InsertGroupMuti` cùng tồn tại**, chữ
ký giống hệt, tên khác nhau đúng một chữ `l`. Lỗi gõ đã lên production và không sửa được vì có
code đang gọi bản sai — phải copy nguyên văn tên từ chỗ đang chạy.

### Chốt — `r70` là sổ kho hoá đơn, `r90` là sổ kho thực tế; và `r90` phụ thuộc `m_instock_split`

Chỗ "chưa chốt" nêu ở mục trên đã có câu trả lời, kèm mã nguồn proc báo cáo NXT làm bằng chứng.
`procedures.md` từng ghi "`r70` tồn hiện thời / `r90` tồn luân chuyển" — sai, đã sửa.

- **Vai trò:** `r70$yyyyMM` = kho **hoá đơn** (sổ sách), `r90$yyyyMM` = kho **thực tế**. Quy ước
  `@DataType` trong proc báo cáo: **1 = thực tế, 2 = hoá đơn**.
- **Phát hiện quan trọng hơn: `r90` chỉ có dữ liệu khi `options.m_instock_split = '1'`.**
  Xác minh trên DB — phân hệ IN, mô tả *"Tách tồn kho sổ sách và thực tế"*, mặc định `1`. Tắt
  tùy chọn đó thì cả hai luồng dồn vào `r70` và `r90` rỗng. Đó là lý do proc chuẩn viết
  `IF @DataType <> 1 OR NOT EXISTS(SELECT 1 FROM options WHERE name = 'm_instock_split' AND val = '1')`
  — vế `OR` là nhánh cho khách không tách sổ, hỏi tồn thực tế vẫn phải lấy từ `r70`.
  Chỉ `FROM r90$…` là trả 0 dòng, không báo lỗi.
- **Nâng thành ràng buộc cứng** trong rule `erp-sql-style` §7.2c, kèm khuôn code đầy đủ và nhắc
  `FastBusiness$Report$GetPhysicsKey` → `@xKey` → `GetCheckKey` cho nhánh thực tế.
- **`options-table.md` lấy đây làm ví dụ mẫu** cho luận điểm của cả trang: tùy chọn nghiệp vụ
  không chỉ đổi cách hiển thị, nó đổi **dữ liệu nằm ở bảng nào**.
- **Ghi thêm một quy ước tên:** trong họ `m_instock_*`, hậu tố `2` = bản dành cho tồn **thực tế**
  (`m_instock_check2`, `m_instock_view2`, `m_instock_process2`) — **khác** nghĩa của hậu tố `2`
  ở tên cột (`ten_ct2` = bản tiếng Anh). Cùng con số, hai quy ước.
- Làm rõ mô tả `FastBusiness$Report$GetPhysicsKey` trong `procedures.md` (trước đây chỉ ghi
  "Báo cáo — GetPhysicsKey").

### Sửa — rà vai trò 27 skill: phụ thuộc MCP sai, tham chiếu chết, thiếu neo phạm vi

Rà toàn bộ corpus tìm chỗ chồng vai, lồng nhau, sai kind/domain. Năm nhóm đã xử lý.

- **6 skill khai sai phụ thuộc MCP.** Thân chúng gọi `query_database`, `get_xml_entities` —
  tool của server `user-fastbusiness-mcp`, không phải `4ai-fbo` mà hub khai. Lỗi lọt vào lúc
  migrate: `requires: [4ai-fbo]` đúng cú pháp nên `check` cho qua, vì check chỉ xác minh id
  tồn tại trong `servers.json`, không đọc thân file. Đã đổi sang tool thật của `4ai-fbo`:
  `query_database type=0/1` → `query_sql { object }`, `get_xml_entities` → `resolve_entities`,
  `read_local_file` → `read_source`, `file_path` (Web.config) → `program`. 9 file, 6 skill.
- **`search_qlyc` không có tương đương** — `erp-history-search` xoay quanh nó. Không bịa cấu hình
  server; thay vào đó cảnh báo ngay đầu skill rằng tool này nằm ngoài hub, và **cấm** thay thế
  bằng `query_sql` tự chế trên `nbphyc` (phân tích một UR là việc của `pm-analyst`).
- **UR từng có hai chủ.** `pm-ur-routing` (rule luôn-nạp) giao mọi việc UR cho `pm-analyst`,
  trong khi `erp-history-search` tự nhận "bắt buộc đọc trước". Rule thắng, skill bị bỏ qua. Đã
  tách nhánh trong rule: **một UR cụ thể** → `pm-analyst`; **lịch sử "đã ai làm chưa"** →
  `erp-history-search`, tra xong quay lại `pm-analyst` để phân tích.
- **`erp-skill-author` dạy sai giới hạn.** Nó ghi "Description ≤1024 ký tự" trong khi
  `schema.mjs` bắt ≤200 — làm theo là bị `check` chặn. Sửa thành ≤200, nói rõ nó **bổ sung**
  `4ai-asset-author` chứ không thay thế và khi mâu thuẫn thì `4ai-asset-author` thắng.
  Gỡ link máy-cục-bộ `~/.cursor/skills-cursor/…` và hai tên skill không tồn tại.
- **7 skill dựng mới không neo vào khách.** `erp-category-create`, `erp-hddv-migrate`,
  `erp-voucher-data-lookup`, `erp-view-design`, `erp-report-create`, `erp-report-pivot-create`,
  `erp-einvoice-customize` nhắc ledger/scope/program **0 lần** — dạy dựng màn hình mà không
  hỏi của khách nào và không để lại vết. Thêm "Bước 0 — Neo vào khách" vào cả bảy, trỏ về
  `erp-program-scope` và `pm-ledger-discipline`.
- **Tham chiếu chết.** `fbo-procedure-create-report` không tồn tại nhưng được `erp-report-create` và
  `erp-report-pivot-create` trỏ tới; đã thay bằng reference thật. Hai tên còn treo
  (`fbo-einvoice-nd70-identity`, `fbo-nd252`) là hai skill đang kẹt ngoài hub — đánh dấu rõ
  tại chỗ trỏ thay vì để dangling im lặng.
- **Bỏ H1 trùng ở 12 asset migrate.** Emitter tự sinh `# {title}`, thân vẫn giữ H1 gốc nên
  mọi file emit ra có hai H1. Đã cắt.

### Đổi — `erp-sql-style` từ `skill` thành `rule` (v2)

Thân nó mở đầu bằng *"AI Agent **BẮT BUỘC** áp dụng khi viết proc/query mới hoặc sửa SQL hiện
có"* — đó là định nghĩa của rule, không phải skill. Skill chỉ nạp theo yêu cầu nên chữ "BẮT
BUỘC" trước đây không có hiệu lực nào.

Nay `kind: rule`, `severity: hard`, `globs: ["**/*.sql", "**/App_Data/Controllers/**"]` — phủ
cả file `.sql` rời lẫn SQL nhúng trong controller. Cursor emit ra `.cursor/rules/erp-sql-style.mdc`
tự gắn theo path thay vì một skill chờ được gọi. Bỏ `requires: [4ai-fbo]` (nó không gọi tool
nào), thêm `see-also: erp-sql-access`. Sync tự prune bản skill cũ ở ba target.

### Sửa — 148 file 4AI sinh ra chưa mang chữ ký; nay có, và có chốt chặn

Bất biến "file do 4AI sinh ra đều phải ký" mới chỉ đúng với file corpus. Đo bằng cách chạy cả
sáu emitter rồi soi từng file: **832 file text, 148 không có banner** — không cái nào là `.md`
(corpus vẫn sạch), toàn bộ là **payload runtime chép nguyên văn vào hai gói plugin**:
`tools/lib/*.mjs`, `mcp/**`, `tools/templates/*.html|css`. Chúng được commit vào repo, nên ai
mở `plugins/4ai/tools/lib/4ai-sync.mjs` sẽ không có gì báo rằng đó là bản chép và sửa vào đó sẽ bị
ghi đè ở lần sync sau.

- **`signRuntime(rel, content)` trong `emit/common.mjs`** — chọn cú pháp comment theo đuôi
  file: `//` cho `.mjs/.js/.cjs/.ts`, `/* */` cho `.css/.scss`, `<!-- -->` cho
  `.html/.htm/.xml/.xsd`. Gọi ở đúng hai chỗ chép runtime (`plugin`, `cursor-plugin`).
- **Shebang giữ nguyên dòng 1.** `tools/4ai.mjs`, `mcp/fbo/server.mjs`, `mcp/fbo/selftest.mjs`
  mở đầu bằng `#!` — banner chèn vào **sau** dòng đó, không phải trước. Đã kiểm cả ba bằng
  `node --check` trên bản đã ký.
- **JSON/JSONL không bao giờ bị chèn** — chèn comment vào là phá parser. Chữ ký của chúng đã
  nằm sẵn ở `.4ai/manifest.json` (đường dẫn + sha256 từng file). 30 file còn lại thuộc nhóm này.
- **Chốt chặn trong `sync.mjs`**, chạy sau emitter và trước writer: file text nào không thuộc
  nhóm JSON/JSONL mà thiếu chuỗi `GENERATED BY 4AI` thì sync **dừng với exit 1**, in tối đa 10
  đường dẫn. Đã xác minh guard không phải code chết — tắt tạm `signRuntime` thì nó bắt đúng 58
  file của target `plugin` và chặn sync.

Kết quả: 148 → 30 file chưa ký, và 30 file đó là nhóm không mang được comment.

### Thêm — gộp 12 skill viết tay trong `~/.cursor/skills` vào hub

Trước đây hai nguồn chạy song song: hub sinh ra một bộ skill, và một bộ khác viết tay thẳng
trong Cursor mà Claude Code không bao giờ thấy. Gộp về một nguồn.

- **12 skill vào `assets/skills/erp/`** kèm 42 file reference: `erp-category-create`,
  `erp-hddv-migrate`, `erp-skill-author`, `erp-view-design`, `erp-einvoice-customize`,
  `erp-einvoice-nd70-implement`, `erp-report-create`, `erp-report-pivot-create`, `erp-history-search`,
  `erp-voucher-data-lookup`, `erp-js-implement`, `erp-sql-style`.
- **Đổi tên hai id** cho hợp `pattern` kebab-case của schema: `fbo_js_skill` →
  `erp-js-implement`, `fbo_get_data_one_voucher` → `erp-voucher-data-lookup`. Mọi tham chiếu
  chéo trong thân đã đổi theo.
- **Viết lại toàn bộ `description`.** Bản gốc dùng block scalar `>-` — `fm.mjs` không hỗ trợ —
  và dài tới ~450 ký tự, quá hạn 200. Rút gọn giữ nguyên phần "mở khi nào".
- **Phẳng hoá reference.** `assets.mjs` chỉ nhận `references/<name>.md` một cấp, nên
  `tran-recipes/APTran.md` → `tran-recipes-APTran.md`; link trong thân đổi sang token
  `{REFDIR}`. Sửa luôn một link chết có sẵn trong bản gốc (`tran-recipes/README.md`).

### Thêm — `disable-model-invocation` cho kind `skill`

`erp-report-create`, `erp-report-pivot-create`, `erp-voucher-data-lookup` là quy trình dài, chỉ nên chạy khi
người dùng gọi đích danh. Field mới khai trong `schema.mjs` (bool, chỉ hợp lệ với `skill`) và
được bốn emitter có khái niệm skill frontmatter ghi xuống: `claude`, `cursor`, `plugin`,
`cursor-plugin`. Không đụng `vscode`/`antigravity` vì hai dialect đó không có primitive tương
đương. Đúng một dòng thêm vào mỗi emitter, `schema.mjs` vẫn là nơi duy nhất tên field tồn tại.

### Chưa gộp — hai skill mang payload file nguồn

`fbo-einvoice-nd70-identity` (25 file) và `fbo-nd252` (Script/, Web/) chở theo **file nguồn
FBO thật** — `.ent`, `.txt`, `.xml`, `.sql` để chép vào chương trình khách. Cơ chế reference
của hub không nhận được chúng: `REFERENCE_RE` chỉ khớp `.md` một cấp, và `writer.mjs` cưỡng
chế UTF-8 không BOM + LF — áp lên file nguồn FBO là làm hỏng đúng thứ chúng phải giữ nguyên
(xem `erp-xml-encoding`). Cần quyết định kiến trúc trước, không lách.

### Sửa — `query_sql` cắt cụt thân proc; `find_controller` sập khi gọi sai tham số

- **Thân proc bị vỡ vụn thành nhiều "row", mỗi row một dòng.** `objectSql()` trước đây chỉ
  `SELECT definition FROM sys.sql_modules` — cột `nvarchar(MAX)`. Hai lớp hỏng cộng dồn:
  sqlcmd cắt ÂM THẦM cột kiểu độ dài thay đổi ở 256 ký tự (`-y` mặc định, không tắt được vì
  xung khắc với `-W`), và mỗi CR/LF trong thân proc bị `execSql()` (tách stdout theo dòng)
  hiểu nhầm thành một row riêng. Đo trên ca thật (`fsd_SyncPOSHD1`, 11.756 ký tự, 12 dòng):
  trả về đúng 12 row, mỗi row một dòng — `rows[0].definition` chỉ còn dòng khai báo tham số
  đầu tiên (39 ký tự), 11 dòng thân hàm còn lại nằm rải rác không ai đọc.
  - Vá bằng đúng khuôn mẫu đã có ở `tools/lib/forum.mjs` cho `frpost.noi_dung`: cắt mảnh
    `NVARCHAR(4000)` tường minh (thoát luật cắt của `-y`, chỉ áp cho kiểu MAX) rồi ghép lại ở
    JS. Khác forum.mjs ở một điểm: đây là MÃ NGUỒN nên không thay CR/LF/TAB bằng dấu cách —
    mã hoá tạm bằng ký tự vùng riêng tư Unicode (U+E000..U+E002) trước khi cắt, phục hồi lại
    sau khi ghép ở `ghepDinhNghiaObject()` (tools.mjs). Giữ nguyên tab/xuống dòng của proc gốc.
  - `query_sql` tự nâng `maxRows` hiệu lực lên tối thiểu `OBJECT_DEF_MAX_CHUNKS` (32 mảnh =
    128.000 ký tự) khi dùng `object:` trên proc/function — không thì bước chống cắt ở tầng
    SQL lại bị chính `SET ROWCOUNT` của `maxRows` mặc định (50) cắt tiếp mất một nửa.
  - Đã kiểm trên DB thật của một chương trình khách: `fsd_SyncPOSHD1` trả đủ 11.756 ký tự,
    đúng byte-for-byte tab/newline, kết thúc đúng ở `END`; nhánh table/view (không đụng
    chunking) và `sql:` tự viết không đổi hành vi.
- **`find_controller` (và mọi tool có `required`) sập với lỗi JS thô khi gọi sai tên tham số.**
  `server.mjs` gọi thẳng `handler(HUB, params.arguments)`, chưa từng validate theo
  `inputSchema` đã khai trong `TOOLS` — dù mọi tool đều khai `required`/
  `additionalProperties: false`. Gọi `find_controller` với `name` thay vì `query` khiến
  `args.query` là `undefined`, rồi `stripAccents(undefined)` ném
  `Cannot read properties of undefined (reading 'normalize')` — không nói được tham số nào
  sai, người gọi phải đoán.
  - Thêm `validateArgs(toolName, args)` (tools.mjs) chạy TRƯỚC handler, dùng chính
    `inputSchema` làm nguồn thật: kiểm `required` (coi `''` là thiếu, khớp cách các handler
    khác đã tự kiểm) và `additionalProperties: false`. Áp dụng cho cả 20 tool, không riêng
    `find_controller` — lỗi hệ thống, không phải lỗi một tool.
  - Lỗi giờ rõ ràng: `` Tool `find_controller` thiếu tham số bắt buộc: `query`. Tham số hợp
    lệ: `program`, `query`, `folder`, `limit`. ``

### Thêm — script SQL gợi ý sinh tự động từ nội dung UR

- **Yêu cầu nào đụng lược đồ thì LUÔN có script.** Mục "Gợi ý tạo bảng / thêm cột" trước đây đọc
  `u.ddl`/`u.ghiChuDdl` — hai trường chỉ có khi NGƯỜI gõ tay vào payload, mà đường sinh tự động
  không bao giờ điền. Kết quả: mục đó rỗng ở **mọi** báo cáo máy dựng, kể cả khi UR nói thẳng
  "Thêm trường Mã vụ việc". `tools/lib/ddl-suggest.mjs` đọc nội dung UR và sinh đặc tả `ddl`.
  Đo trên NBT: 8 UR đụng lược đồ → 5 script chạy được ngay, 3 script có chỗ trống được đánh dấu.
- **Ba dữ kiện đều tra từ CHÍNH chương trình khách, không có hằng số nào của hub:**
  - HỌ BẢNG — đọc thuộc tính `table` trên thẻ gốc controller (`Dir/<sysid>`, `.xml` thắng `.f`).
    `PRTran → m91$000000`, `FATran → dmts`.
  - KIỂU CỘT — đếm cột cùng tên đang tồn tại rồi lấy kiểu áp đảo: `ma_vv varchar(16)` có ở 2.965
    bảng, `ma_bp varchar(16)` ở 3.875, `so_dd varchar(32)` ở 314.
  - CỘT ĐÃ CÓ CHƯA — có rồi thì việc thật là đưa trường lên form, không phải ALTER; script nói
    thẳng để không báo nhầm giờ công.
- **`addColumn` phân biệt bảng phân vùng và bảng đơn.** Hai dạng cùng tồn tại trong một dự án
  (`m91$` có 38 bảng · `dmts` là bảng đơn). Vòng lặp `LIKE 'dmts$%'` khớp KHÔNG bảng nào, nên
  script cũ sẽ chạy êm ru mà không thêm cột nào và không ai biết.
- **Chỉ soi cụm đã được định vị, không quét nhãn trên toàn văn.** Ca thật đầu tiên gặp phải:
  "Thêm trường Mã vụ việc: lấy từ danh mục vụ việc, **đặt dưới Mã phí**" — `Mã phí` là mốc vị trí
  trên form, quét toàn văn thì nó thành một câu `ALTER TABLE` thừa.
- Nhãn trường không có trong từ điển `NHAN_COT` vẫn ra script khung với `<TEN_COT>` chứ không rơi
  vào im lặng — mức đó mới là mức quan trọng nhất về quy trình. Chỗ chưa chốt liệt kê NGAY TRÊN
  script, vì một script có `<HO_BANG>` mà không ai cảnh báo thì rất dễ bị copy chạy thẳng.
- Phạm vi gồm cả **XN**, không riêng DD: XN nghĩa là "đã xác nhận chuyển lập trình" — đúng lúc
  lập trình viên cần script nhất.
- Đọc controller qua `readSource()` (Windows-1258 / UTF-8-BOM) chứ không `readFileSync('latin1')`
  — tên màn hình tiếng Việt trong script từng ra rác.

### Sửa — chấm kinh nghiệm bằng NHỊP (UR/năm), không bằng số đếm thô

- **Số UR nhiều phần lớn vì làm lâu, không vì rành.** Đo trên roster FSD: TRUONGHM 9.547 UR
  trong 271 tháng, HUYNQ 1.786 UR trong 37 tháng — chênh thâm niên **bảy lần**, nên mọi bảng
  đếm thô về bản chất là bảng xếp hạng thâm niên. Cả bốn tiêu chí đếm (hiện vật · menu · đầu
  vào · chủ đề) nay chia cho số năm có mặt trong dữ liệu yêu cầu (`MIN/MAX(nbphyc.ngay_nhap)`).
  - Mảng mẫu in đổi hẳn thứ hạng: TRUONGHM 275 UR (12,2/năm) → **HUYNQ 176 UR (57,1/năm)**.
    Trên UR thiết kế mẫu in của NBT, HUYNQ từ ngoài top 3 lên **hạng 1 với 210 điểm**.
  - Sàn mẫu số `sanNamThamNien = 2`: thâm niên dưới 2 năm vẫn tính bằng 2, để người mới vài
    tháng không ăn nhịp khổng lồ vì cửa sổ thời gian quá ngắn.
  - Sàn bão hoà quy về cùng đơn vị (`baoHoaSoUr / sanNamThamNien`). Chấm nhịp mà so với
    `baoHoaSoUr = 3` — đơn vị UR — thì cả bảng tụt sát 0.
  - Người thiếu dữ liệu thâm niên dùng **trung vị** của những người có, KHÔNG rơi về số đếm thô:
    so 300 với 40 là thổi phồng gấp bội và luôn đứng đầu, mà lỗi đó im lặng.
- **Hiện vật HIẾM không bị phép chia làm hỏng** — đã kiểm riêng vì đây là chỗ dễ vỡ nhất. Người
  duy nhất từng đụng `zcrptInventoryFGoods` (1 UR trong 8,2 năm) tụt từ 33 xuống 8,2 điểm nhưng
  **vẫn đứng đầu**, vì bậc bằng chứng xếp trước điểm. Đánh đổi phải nói rõ: với hiện vật chỉ có
  1–4 UR trong toàn kho, xếp theo nhịp nhiễu — trên UR danh mục chỉ tiêu ngân sách, người làm
  2 UR trong 3,1 năm vượt người làm 4 UR trong 8,2 năm.
- `nhanSu.thamNien` là khối dữ kiện mới (`sqlThamNien`). Thiếu nó thì tiêu chí chấm bằng số đếm
  như cũ và `thieuDuLieu` nói thẳng là "đang xếp theo thâm niên".

### Thêm — chiều CHỦ ĐỀ cho node Request, và meta để tra ngược

- **`node_Request` có meta tra cứu.** Trước đây node chỉ mang `stt_rec`, `fcode1`, `noi_dung`,
  `tg_dk_th`, `ma_lt1` — tức chỉ tra được khi ĐÃ biết `stt_rec` cần tra, nên kho 31.010 UR đã
  tích luỹ (nguồn kinh nghiệm duy nhất của phòng) không tìm ngược ra được. Thêm `menu_id`,
  `sysid`, `hienVat`, `maDaumuc`, `chuDe`. Năm prop này KHÔNG phá luật "quan hệ không lặp thành
  property": luật đó cấm chép xuống thứ đã có cạnh mang (Project, Status), còn đây là chính nội
  dung của Request, không node nào khác sở hữu.
  - Đã cân nhắc thêm cột `noiDungTim` chép sẵn bản không dấu rồi **bỏ**: `noi_dung COLLATE
    Latin1_General_CI_AI LIKE N'%ngan sach%'` cho không đúng thứ đó, không cần nhân đôi 31 nghìn
    dòng văn xuôi.
  - Hai đường ghi node Request (`4ai report` và `4ai graph experience`) dùng CHUNG một hàm
    `metaRequest()`. Trước đó là hai object literal chép tay và đã lệch sẵn — đường kinh nghiệm
    không ghi `tg_dk_th`.
- **`tools/lib/topics.mjs` — từ điển chủ đề đóng.** 13 mảng nghiệp vụ (ngân sách, mẫu in, phân
  quyền, tài sản/CCDC, kế thừa, import, thuế, tỷ giá, pháp lý…). Rút từ `noi_dung` bằng từ khoá,
  cộng `ma_daumuc` cho hai nhãn chắc chắn (`02` → mẫu in, `06` → danh mục). CỐ Ý không khớp chữ
  "danh mục" tự do: câu tả trường nào cũng có nên nhãn đó sẽ dính vào mọi UR — đúng cái bẫy đã
  gặp ở `menu_id = 01.00.00` và hiện vật `Post01`.
- **Tiêu chí 4 khi chấm ứng viên: đã làm nhiều UR CÙNG MẢNG.** Nguồn là `node_Request.chuDe`,
  đọc bằng `sqlKinhNghiemChuDe()`. Cộng điểm (mặc định 50), **không nâng bậc bằng chứng** — chủ
  đề rộng (đo trên NBT, `vu-viec-phi` dính 13/24 UR) nên cho nó nâng bậc thì gần như ai cũng lên
  bậc 1 và cột độ tin cậy hết phân biệt được.
- **`4ai graph topics` — backfill nhãn cho node đã có.** Chạy theo lô 500, mốc "đã xử lý" nằm
  trong chính dữ liệu (`chuDe IS NULL`) nên ngắt giữa chừng rồi chạy lại là tiếp đúng chỗ cũ. Lượt
  đầu gắn nhãn cho **30.985 node**: mẫu in 3.716 · kế thừa 3.110 · vụ việc/phí 1.364 · import
  1.361 · danh mục 1.151 · tài sản 917 · HĐĐT 850 · ngân sách 651 · phân quyền 601.
- **Người được hướng dẫn playbook chỉ đích danh hiện trên mục phân công.** `nguonLt` của một
  hướng dẫn khớp UR là một khẳng định của NGƯỜI, và nó nói được thứ không phép đếm nào nói được:
  đo trên dữ liệu thật, người rành mẫu in đứng **thứ năm** trong bảng đếm đầu mục `02`
  (TRUONGHM 419 · HUYNQ 364 · CUONGTQ 314 …), người rành ngân sách đứng **thứ ba** trong bảng đếm
  UR ngân sách. Đếm UR đo khối lượng, không đo tay nghề — nên tên này hiện RIÊNG, **không cộng vào
  điểm**: trộn khẳng định tay vào thang đếm được là mất dấu cái nào là cái nào.
- Mục phân công hiện thêm **nhãn mảng** của từng UR, để PM thấy hệ thống đang đọc yêu cầu đó
  thuộc mảng gì trước khi tin bảng xếp hạng bên dưới.

### Sửa — `query_sql` là tool của CHƯƠNG TRÌNH KHÁCH, QLDA và đồ thị chỉ còn env + local

- **Mô tả tool khiến agent tưởng `query_sql` dành riêng cho QLDA nên không gọi nó.** Câu mở đầu
  cũ ("Chạy SQL trên database của program") không nói program nào, trong khi mọi ví dụ quanh nó
  đều là QLDA — máy có sẵn MCP database khác thì agent chọn cái kia. Nay mô tả nói thẳng ngay câu
  đầu: đây là đường tra database của **chương trình khách**, dùng cho mọi dự án, kết nối đọc từ
  `Web.config` của chính program và **không phải khai cấu hình gì trước**. Field `program` cũng có
  description riêng thay vì `{ type: 'string' }` trống.
- **Ba nguồn kết nối tách bạch, nói ra đủ ở cả ba nơi agent đọc** (mô tả tool, rule
  `erp-sql-access`, `mcp/servers.json`): program khách → Web.config của chính nó; QLDA → env
  `QLDA_APP_CONNECTION`/`QLDA_SYS_CONNECTION` rồi `data/qlda.local.json`; đồ thị 4AI → env
  `GRAPH_4AI_CONNECTION` rồi `graphConnectionString`, và không tra qua `query_sql`.
- **Bỏ chốt cuối Web.config của QLDA** (`databases.qlda.resolveOrder` mất hai bước `webConfig`).
  Rớt về Web.config nghe thì tiện, nhưng nó nối vào một server có thể KHÁC server đã khai ở env —
  truy vấn vẫn chạy, vẫn ra số, chỉ là ra từ chỗ khác; kiểu hỏng chỉ lộ sau khi đã tin vào số
  liệu. Nay chưa khai thì `thieuKetNoiQlda()` dừng và chỉ đúng khoá phải điền, đúng file phải sửa
  (`duongDanQldaLocal()`), kèm câu nhắc rằng chương trình khách KHÔNG dính lỗi này.
- **`nguonKetNoi()` trả thêm `'chưa khai'`** cho đúng trạng thái mới, và `doctor` có gợi ý riêng cho
  nó — trước đây nó trả `'Web.config'`, tức là chẩn đoán báo "ổn" cho đúng cấu hình mà nay mọi
  truy vấn QLDA đều dừng. `query_sql` cũng thôi in cứng "phân giải từ Web.config nội bộ" trong
  `note`: nó gọi `nguonKetNoi()` để nói đúng nguồn thật của lần chạy đó.
- Hợp đồng bảo mật không đổi: tất cả những chỗ trên chỉ nói **tên nguồn** và **tên khoá**, không
  bao giờ giá trị. `tests/test-sql-conn.mjs` cập nhật theo hành vi mới và vẫn kiểm điều đó.

### Sửa — Cursor: skill thôi bị hạ xuống rule

- **Cursor có primitive Skill thật, 4AI vẫn map `kind: skill` → `rules/<id>.mdc`.** Mapping đó
  đúng lúc viết emitter — khi ấy thứ gần nhất với skill là `.mdc` rule mang `description` +
  `alwaysApply: false` (Cursor gọi là *Agent Requested rule*): agent đọc description rồi tự
  quyết nạp thân. Nay Cursor auto-discover `.cursor/skills/` và `~/.cursor/skills/` với đúng
  layout `<id>/SKILL.md` của Claude Code, nên giữ mapping cũ là ép sai primitive.
  - Bằng chứng thấy ngay trên máy dev: `~/.cursor/` đã có `skills/` (19 skill FBO viết tay)
    và `skills-cursor/` (skill Cursor tự ship, kèm manifest). Cursor còn ship sẵn hai skill
    tên `create-skill` và `migrate-to-skills`.
  - Xác nhận bằng tài liệu: `cursor.com/docs/context/skills` (đường dẫn, frontmatter
    `name`/`description`/`paths`, và **`references/` là thư mục đi kèm được hỗ trợ chính thức,
    "loaded on demand"**) và `cursor.com/docs/reference/plugins` (`skills/` trong gói plugin
    cũng auto-discover, mỗi thư mục con có `SKILL.md`).
- **Doctrine và rule VẪN là rule**, không đổi. Chúng cần `alwaysApply`/`globs` — cơ chế kích
  hoạt mà skill không có; đổi chúng thành skill là mất phần "luôn nạp". Sự phân biệt
  rule-vs-skill của hub giờ chiếu đúng sang Cursor thay vì bị san phẳng.
- **Reference đi kèm skill hết dạng lưu vong.** Trước đây với Cursor chúng rơi vào
  `rules/references/<id>/` — thư mục Cursor chỉ quét `.mdc`, nên ba file `.md` nằm đó không có
  gì nạp. Nay vào `skills/<id>/references/`, đúng chỗ Cursor đọc, và `referenceDir()` tự khớp
  vì nó vốn phân nhánh theo `SKILL.md` — không phải sửa thêm dòng nào.
- Ảnh hưởng khi sync: 12–13 skill chuyển từ `rules/*.mdc` sang `skills/<id>/SKILL.md`, file
  `.mdc` cũ bị prune sạch (chúng nằm trong manifest). Áp cho cả target `cursor` sống lẫn gói
  `plugins/4ai-cursor/`, nên người cài qua marketplace và người clone+sync vẫn thấy cùng một
  trải nghiệm.

### Thêm — skill mang được `references/`, và danh mục SQL dùng chung của SP2422

- **Hub nhận một hình dạng asset mới: skill có phụ lục.** File đặt ở
  `assets/skills/<domain>/<id>/references/<tên>.md`, là markdown trần — không frontmatter,
  không id, không version riêng. `loadAssets()` tách chúng khỏi luồng validate asset (nếu
  không, chúng rơi vào luật "đường dẫn phải là `assets/<kind>/<domain>/<id>.md`" và làm đỏ
  `check`), rồi gắn vào skill chủ. Ba lỗi được cưỡng chế: reference không có skill chủ, chủ
  không phải kind `skill`, và chủ khai `always: true` — cái cuối vì reference tồn tại để nạp
  THEO YÊU CẦU; gắn nó vào một asset luôn-nạp là bơm cả danh mục vào mọi phiên.
- **Token `{REFDIR}` trong thân skill.** Layout reference khác nhau theo dialect vì primitive
  khác nhau: nơi skill là THƯ MỤC (`skills/<id>/SKILL.md`) thì reference nằm trong đó; nơi
  asset là MỘT FILE (`rules/<id>.mdc`) thì phải tự tạo thư mục đặt tên theo id
  (`rules/references/<id>/`), nếu không hai skill cùng thư mục ghi đè reference của nhau.
  `forEmit()` thay token bằng đường dẫn tương đối đúng của từng dialect, nên thân asset viết
  một lần vẫn trỏ đúng ở cả sáu emitter. Cùng một object được dùng cho `emitPaths` lẫn nội
  dung file — hai bên không thể tính ra hai đường dẫn khác nhau.
- **Skill `erp-sql-reference`** — danh mục quét từ chương trình FBO chuẩn SP2422 qua
  `query_sql`: 221 function (`ff_`, `Fast*`, `df_`), 747 stored procedure (`fs_`, `Fast*`,
  `ds_`, `rs_`; đã loại 31 `dt_*` của SQL Server), 93 bảng `sys*` ở cả db `app` và `sys`.
  Mỗi thủ tục kèm cờ tác dụng phụ `IUDTX` (có `INSERT`/`UPDATE`/`DELETE`/`CREATE TABLE`/`EXEC`
  trong thân). SKILL.md cố ý ngắn — chỉ nói file nào chứa gì và mở khi nào, để skill khác
  không gánh 250 KB danh mục.
  - Ý nghĩa suy từ tên + chữ ký + tên tham số, **không phải từ đọc thân**, và mọi file nói
    thẳng điều đó ở đầu. Đủ để chọn đúng đối tượng cần tra, chưa đủ để khẳng định hành vi.
  - Cờ `IUDTX` là kết quả quét văn bản, không phải phân tích luồng: cờ `X` che mất mọi thứ
    SQL động bên trong làm, nên `-----` không phải bảo chứng "chỉ đọc".
  - Mã nhóm chứng từ (`fs_Post<XX>Tran`, `Voucher$*Update$<XX>`) chỉ khai những mã có bằng
    chứng đủ mạnh; mã còn lại ghi rõ là chưa xác nhận, trỏ về `dmct`/`sysvouchertype` thay
    vì đoán.

### Sửa — cờ `-----` nói dối về 124 đối tượng mã hoá; phục hồi chữ ký cho cả 124

- **`-----` không phân biệt "không ghi" với "không đọc được".** 124 đối tượng khai
  `WITH ENCRYPTION`: `sys.sql_modules.definition` là `NULL`, nên phép quét `IUDTX` không
  thấy gì và trả về `-----` — đúng cái ký hiệu dùng cho "thân chỉ đọc". Người đọc bảng sẽ
  kết luận ngược hoàn toàn. Nay chúng mang dấu **⊗** cạnh tên và cột Ghi ghi `mã hoá`, kèm
  một dòng legend nói rõ hai thứ khác nhau ở đâu.
- **Tên tham số của nhóm này bị thay bằng `@_0`, `@_1`…** nên chữ ký trong metadata vô dụng.
  Phục hồi được **cả 124** — 858/1135 vị trí tham số có tên — từ bốn nguồn, ghi rõ nguồn
  từng cái: script nguồn chưa obfuscate trong SourceCollection (`A`), và chỗ gọi thật —
  token runtime `@@id`/`@@master`/`@@refresh`… trong controller XML, hoặc tên biến của thủ
  tục gọi nó (`B`). Vị trí nào không có bằng chứng thì **giữ nguyên `@_N`**; mỗi đối tượng
  kèm một lời gọi thật chép nguyên văn — tên chỉ là diễn giải của nó.
  - **Nguồn `D` — bản giải mã thân lệnh** (người dùng cung cấp) là thứ đóng lại toàn bộ
    khoảng trống. Nó KHÔNG trả lại tên gốc: obfuscate xảy ra TRƯỚC khi mã hoá nên thân
    giải mã vẫn mang `@_0`. Giá trị nằm ở chỗ khác — đọc được thân thì suy tên từ CÁCH
    DÙNG: cột nào được gán, token `REPLACE(@sql, '@cFileGroup', @_1)`, hay tên khai ngay
    trong `sp_executesql @sql, N'@u int, @v char(3)', @_1, @_0`. Cả 58 chữ ký khớp tuyệt
    đối với metadata SP2422, nên áp được thẳng.
  - **Cờ tác dụng phụ của 58 đối tượng này giờ là số đo thật**, hậu tố `ᴰ`, thay cho
    `mã hoá`. Vài cái lệch hẳn so với phỏng đoán theo tên: `FastBusiness$Query$DrillDown`
    và `FastBusiness$CheckSum` hoá ra **chỉ đọc**, còn `FastBusiness$Post$Loading` —
    nghe như một thủ tục đọc — thật ra là `IUDTX`.
  - Hai quy luật họ, mỗi cái đặt tên cho hàng chục vị trí: đuôi chuẩn của họ `ds_*` là
    `(clientCode, extension)` — đối chiếu được với `ds_SystemGetLookup`, thủ tục cùng họ
    KHÔNG mã hoá và còn nguyên tên; và đuôi `(language, userID, admin)` của họ
    `$Fields$`/`$Filters$`/`$Config$`, trong đó `char(1)` luôn được so với `'V'`.
  - Chữ ký từ SP khác chỉ được áp khi **số tham số VÀ dãy kiểu khớp tuyệt đối** với SP2422;
    17 đối tượng có script nhưng chữ ký đã đổi giữa các SP nên bị loại, không lấy tên bừa.
  - `Decryption_22_5.5_app.sql` (377 KB, tưởng là mỏ vàng) hoá ra là bản ĐÃ obfuscate — cho
    thân lệnh nhưng vẫn `@_N`. Chỉ 5 đối tượng có script còn tên thật.
  - `sys.sql_expression_dependencies` bỏ sót lời gọi nằm trong SQL động; phải quét text
    (`syscomments.text LIKE`) mới ra. Quét một tên mỗi lần — ghép nhiều `LIKE` là timeout.
  - Đã tìm và không thấy gì ở `App_Data\Controllers\Templates\Upload` (mọi bản SP). Quét
    toàn bộ SourceCollection (không chỉ nhánh SP24) moi thêm được 4 đối tượng nữa từ các
    bản SP18–SP22.7 — `App$Voucher$View`, `App$GetSalesPrice`, `App$Dynamic$GenData`,
    `System$GetAccessRight`.
  - 58 thủ tục còn mù phần lớn là `ds_*` — API tầng trình bày do runtime web gọi thẳng, nên
    bằng chứng không nằm trong SQL lẫn XML. Sáu thủ tục họ `$Config$`/`$Fields$`/`$Filters$`
    thì được gọi qua cơ chế **dispatch bằng chuỗi tên**
    (`@e = '<tên proc>' + char(254) + '<hậu tố>'`), nên XML có nhắc tên mà không lộ tham số —
    mục *Họ dispatch* ghi lại cơ chế này.
  - Quét 120 file `.dll` trong `bin\` của chương trình chuẩn (cả UTF-8 lẫn UTF-16):
    không có chuỗi tên đối tượng nào. Đường này ghi lại là đã đóng, khỏi thử lại.
  - Phiếu điền tay `docs/fbo-sql-encrypted-worksheet.md` đã lập rồi xoá — bản giải mã về
    trước khi cần dùng tới. Thứ tự tìm kiếm rút ra được ghi lại trong SKILL.md: **xin bản
    giải mã trước**, ba đường còn lại chỉ là bù khi không có nó.
  - Ba đối tượng mã hoá NHƯNG vẫn còn tên tham số thật được tách thành mục riêng — trước đó
    bị gộp vào diện "chưa suy được", trong khi chữ ký của chúng dùng được ngay.

### Sửa — báo cáo rà soát: ba chỗ kết luận sai

- **`tlks_yn = 1` không còn được coi là "đã có căn cứ".** `nbphyc.trang_tlks` là ô tự do và người
  lên UR gõ vào đó TÊN LOẠI tài liệu làm căn cứ, không chỉ số trang (đo trên dữ liệu thật: 963
  dòng `BBLV`, 998 dòng `XNKH`, 963 dòng `PL`). Câu SQL thứ năm đọc `sysfileinfo` — đính kèm cấp
  dự án (`nbdmda`) lẫn cấp UR (`nbphyc`) — rồi `evidence.mjs` đối chiếu ĐÚNG loại đã khai. Ca thật
  bắt được: một dự án có duy nhất một file TLKS trong khi năm UR ở DD đều khai căn cứ là BBLV; luật
  "không có tài liệu nào" không bắt được ca đó. Ba vế cùng đúng — UR ở `DD`, không tra ra tệp đúng
  loại, giai đoạn chưa tick `xac_nhan_da_hen_yn` — thì cột **Đề xuất** hiện `TA` kèm lý do. Trước
  đây cột này luôn là `—` ở mọi báo cáo sinh tự động, vì `deXuat` chỉ đọc từ payload viết tay.
  - Câu SQL đính kèm nhận DANH SÁCH KHOÁ, không nhận `where`: bản nhét `where` vào subquery chạy
    tức thì trên một dự án nhưng **timeout** trên phạm vi cả LTQL (`sysfileinfo` 44 nghìn dòng,
    `RTRIM()` hai đầu chặn index).
  - Kết luận "thiếu tài liệu" luôn kê kèm kho đính kèm hiện có, để PM kiểm lại được thay vì phải tin.
- **Xếp hạng ứng viên: bậc bằng chứng thắng điểm phạt tải.** Điểm kinh nghiệm là thang TƯƠNG ĐỐI
  (chia cho người dẫn đầu, mẫu số tối thiểu `baoHoaSoUr`) còn phạt tải là số TUYỆT ĐỐI (−15/UR,
  trần −60) — hai thang không cùng đơn vị. Người duy nhất từng làm đúng một hiện vật được
  `1/3 × 100 = 33,3` rồi bị trừ thẳng 60, thành âm điểm và rơi xuống DƯỚI những người không có một
  bằng chứng nào (0 điểm). Đo được trên dữ liệu thật: hai báo cáo mà đúng một người từng làm, top 3
  gợi ý ra toàn người chưa từng chạm tới. Nay xếp `bacBangChung` trước, điểm sau — tải chỉ phân định
  GIỮA những người cùng có kinh nghiệm. Bảng bày luôn phép trừ (`−26,7 (33,3 − 60 tải)`) để con số
  âm đứng đầu không đọc như báo cáo hỏng, và nói thẳng khi KHÔNG ứng viên nào từng làm phần đó.
- **`hienVat` được chép sang payload.** `datasetToPayloads()` bỏ quên trường này, nên toàn bộ khối
  `nhanSu.kinhNghiemHienVat` là dữ liệu chết và mọi UR âm thầm rơi về thang `menu_id` — chính thang
  mà `review-dataset.mjs` ghi rõ chỉ phân giải được 1/25 trên dữ liệu thật.
- **Hướng dẫn playbook không còn khớp qua menu gộp.** `menu_id` dạng `NN.00.00` là rổ cấp phân hệ,
  không định vị một màn hình — đo trên chính một lượt chạy thật, `01.00.00` gánh 632 UR của riêng
  một người. Một hướng dẫn về "đánh số thứ tự cho browse danh mục" neo ở `01.00.00` đã bị gắn vào
  một UR xin thêm tuỳ chọn loại khách khỏi báo cáo bán hàng. `laMenuGop()` chặn neo đó ở CẢ hai
  đầu — `ghepVaoUr()` bỏ qua khi ghép, `kiemEntry()` từ chối khi ghi — vì nhận nó lúc ghi là hứa
  một đường tra cứu không tồn tại. Bù lại, thêm đường khớp qua `hienVat` (danh sách `sysid` rút từ
  chính nội dung UR), bắt được cả UR đụng nhiều màn hình cùng lúc.

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
