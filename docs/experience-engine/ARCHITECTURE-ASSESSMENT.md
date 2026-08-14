# Architecture Assessment — "Experience & Contribution Engine"

Bước 1 theo yêu cầu: đọc kiến trúc hiện tại trước, chưa implement gì. Kết luận nằm ngay ở đầu vì nó quyết định toàn bộ các bước sau.

## 0. Kết luận sớm

Yêu cầu gốc mô tả một **Enterprise Experience & Contribution Engine** cho một "hệ thống quản trị dự án" tổng quát — có bảng Member/Project/WorkItem/Skill/Domain riêng, REST API, database mở rộng cho recommendation, và lộ trình tới team staffing + ML.

Repo này **không phải hệ thống đó**. Theo `CLAUDE.md`: 4AI là compiler cấu hình trợ lý AI cho FBO/FBI — zero npm dependency, không host app, không có database Member/Project/WorkItem của riêng nó. Phần "quản trị dự án" trong repo là **CLI + MCP tooling đọc trực tiếp database ERP đang chạy** (`nbdmda`, `nbphyc`, `userinfo2`...), không sở hữu dữ liệu nghiệp vụ.

Quan trọng hơn: **phần lõi của yêu cầu — recommendation engine có bằng chứng, có giải thích, có confidence, xếp hạng ứng viên cho một work item — đã tồn tại và đang chạy**, ở dạng hẹp hơn nhiều nhưng đúng tinh thần §41 của chính bản yêu cầu ("Core phải Deterministic/Testable/Explainable/Auditable"): `tools/lib/assignee.mjs` + `tools/lib/staffing.mjs`. Xây một hệ Member/Project/WorkItem song song sẽ vi phạm đúng nguyên tắc §1 mà bản yêu cầu tự đặt ra: "Không tạo duplicate entity nếu repository đã có abstraction tương đương."

Khuyến nghị ở cuối tài liệu: **mở rộng hệ đang có**, không dựng nền tảng generic mới.

## 1. Kiến trúc hiện tại

- **Bản chất**: compiler (`node tools/4ai.mjs check|sync`) sinh config cho 4 dialect trợ lý AI, cộng thêm bộ CLI/MCP hỗ trợ PM rà soát yêu cầu FBO. Không phải web app, không có process chạy nền, không có DB schema riêng cho nghiệp vụ.
- **Zero dependency**: `TextDecoder('windows-1258')`, `node:util.parseArgs`, `node:fs.globSync`, `node:crypto.createHash` — không package.json, không npm install.
- **Không có database Member/Project/WorkItem của 4AI**. "Project" = `nbdmda` (ERP), "WorkItem/Request" = `nbphyc`/`nbctdaumuc` (ERP), "Member" = `userinfo2` (ERP, DB hệ thống QLDA). 4AI chỉ **đọc** các bảng này qua `runSql`/`query_sql`, không bao giờ ghi (`Không có đường nào từ đây tới UPDATE nbphyc` — nguyên văn comment trong `assignee.mjs`).
- **Nguồn thật riêng của 4AI** là file JSONL versioned trong git (`data/graph/*.jsonl`, `ledger/<ma_da>/graph.jsonl`) — không phải bảng SQL. SQL Server graph (DB đồ thị 4AI) chỉ là **chỉ mục dựng lại được**, xoá không mất gì. Đây là nguyên tắc auditability đã có sẵn, đúng tinh thần §38-39 của bản yêu cầu.
- **`writer.mjs`** là nơi duy nhất ghi file; **`schema.mjs`** là nơi duy nhất khai tên field. Không có REST API nào trong repo — bề mặt gọi vào là CLI (`tools/4ai.mjs`) và MCP tool (`mcp/fbo/server.mjs`).

## 2. Thành phần tái sử dụng được (map thẳng vào các mục trong yêu cầu)

| Có sẵn | File | Map vào mục nào trong yêu cầu |
|---|---|---|
| Recommendation engine cho 1 work item | `tools/lib/assignee.mjs` — `goiYNguoiTiepNhan()` | §9 Recommendation Engine, §10 Scoring (3 tiêu chí có trọng số, config được), §18 Hard constraint vs soft (roster `status=1` là hard, phần còn lại soft) |
| Evidence gathering / experience data | `tools/lib/staffing.mjs` — `buildNhanSu()` | §7-8 Experience + Evidence, §12 Input Ownership (tiêu chí 3: ai đóng góp UR đầu vào liên quan), §17 Availability (tải trọng suy từ chính dataset, không tin tưởng mù) |
| Confidence, không bịa dữ liệu | `assignee.mjs` — `doTinCay: 'cao'/'thấp'`, `thieuDuLieu[]` | §29 Confidence, §30 Cold start (một phần — chưa có declared-skill fallback) |
| Explainability | `chiTiet`, `lyDo[]` trên mỗi candidate | §22 Explainability — mỗi lý do trỏ tới bằng chứng thật (số UR, menu, nguồn) |
| Test theo scenario, không phải CRUD | `tests/test-assignee.mjs`, `tests/test-staffing.mjs` (>70 assertion) | §34 Testing — đúng phương pháp yêu cầu đề nghị: "A có 5 task tương tự phải thắng B chỉ có SQL chung chung" |
| Policy version / trọng số configurable | `data/qlda.json → review.phanCong` | §10, §39 (một phần — chưa snapshot version theo từng lần chạy) |
| Domain hierarchy, evidence versioned theo mốc | `data/graph-schema.json` (Capability/CapabilityVerdict theo `ma_pbsp`) | §14 Domain hierarchy (dùng cây menu/bar thay vì cây ERP domain thủ công), §39 Versioning (dùng SP version thay vì policy version) |
| Presentation / UI requirement | `report.mjs`, `render_review_report` (MCP tool) | §36 — dashboard HTML đã hiện candidate + score + lý do + độ tin cậy |
| AI không quyết định trực tiếp | Không có LLM call nào trong `assignee.mjs`/`staffing.mjs` | §26-27 — core đã deterministic đúng như spec đòi hỏi, không cần sửa gì để đạt yêu cầu này |

## 3. Gap thật (so với 43 mục của yêu cầu)

- **Phạm vi hẹp hơn nhiều**: chỉ trả lời "ai nên nhận UR NÀY", không có team staffing (§19), không có knowledge-continuity query kiểu "Tuấn nghỉ thì ai hiểu code của Tuấn" (§20), không có collaboration graph (§21).
- **Không có PM feedback loop**: recommendation hiện trong report nhưng **không ghi lại** PM đã chọn ai, có override không, lý do gì, outcome ra sao (§24-25). Đã grep toàn repo — không có field `override`/`outcome`/`feedback` nào liên quan tới assignment. Đây là gap thật, đáng làm nhất.
- **Không có RecommendationRun snapshot**: mỗi lần gợi ý không được lưu lại thành bản ghi độc lập kèm policy version — hiện tại chỉ có HTML report tức thời (§38 một phần).
- **Domain là menu/bar của FBO**, không phải cây ERP domain tổng quát (Inventory/Sales/Purchasing) như ví dụ trong yêu cầu — đúng với thực tế: 4AI phục vụ một phòng lập trình FBO cụ thể, không phải toàn công ty đa domain.
- **Không có growth/delivery mode** (§32), không có cơ chế chống thiên vị/xoay vòng (§31) — chưa cần vì đội hình nhỏ (roster mẫu trong test chỉ 3-4 người).
- **Không có Skill/Role/Domain entity tách biệt Member** — định danh chỉ là `ma_nv`/`ma_lt1` (string key từ `userinfo2`), không có taxonomy skill riêng.

## 4. Integration point nếu mở rộng

- Sửa trọng số/thêm tiêu chí chấm điểm → `tools/lib/assignee.mjs`, hàm thuần, không chạm DB — an toàn để mở rộng.
- Thêm nguồn bằng chứng mới (vd lịch sử code review, PR) → `tools/lib/staffing.mjs`, nhưng **mọi nguồn mới là một câu SQL mới trên DB ERP sống** (DB nghiệp vụ và DB hệ thống QLDA), phải qua `runSql`/MCP `query_sql`, **read-only tuyệt đối** — không có ngoại lệ.
- Ghi lại PM feedback/outcome → theo đúng pattern đã có ở `data/graph/effort-samples.jsonl`: **chỉ ghi khi PM xác nhận**, dạng JSONL append-only, git-diffable — không tự động suy luận rồi ghi.
- Team-level staffing (nhiều work item cùng lúc) → file mới cùng tầng với `staffing.mjs`, gọi lặp `goiYNguoiTiepNhan()` cho từng UR rồi tổng hợp — không cần kiến trúc mới.
- AI/LLM layer (nếu cần trích xuất WorkProfile từ văn bản yêu cầu tự do) → đã có pattern `tools/lib/prompt.mjs` (sinh prompt từ payload) làm điểm khởi đầu; core scoring vẫn đứng ngoài, đúng §26.

## 5. Rủi ro nếu làm đúng-y-như-văn-bản yêu cầu

- **Vi phạm zero-dependency**: bất kỳ vector DB, ML framework, web framework nào đều cần bàn trước (`CLAUDE.md` hard rule) — và chính §41 của yêu cầu cũng tự cấm điều này ("đừng thêm vector database chỉ vì có AI").
- **Không có REST server**: §23 giả định `POST /recommendations/work-items/{id}` — repo không có app server nào để gắn route vào. Map đúng phải là MCP tool hoặc CLI subcommand, theo đúng pattern `render_review_report`/`4ai report` đã có.
- **Bảng Member/Project/WorkItem generic sẽ trùng lặp ba thứ cùng lúc**: bảng ERP sống (`nbdmda`/`nbphyc`/`userinfo2`), và capability graph đã có (`data/graph-schema.json`). Đây là vi phạm trực tiếp nguyên tắc §1 mà chính yêu cầu đặt ra đầu tiên.
- **`customer-program` target không bao giờ được ghi** — không liên quan trực tiếp vì recommendation chỉ đọc, nhưng nhắc lại vì bất kỳ thiết kế "lưu profile" nào cũng phải nằm trong DB riêng của 4AI (DB đồ thị 4AI) hoặc JSONL, tuyệt đối không phải DB khách.

## 6. Khuyến nghị hướng đi

Không dựng nền tảng generic song song. Thay vào đó, coi đây là **mở rộng có chọn lọc** trên hệ đã có:

**Phase A (nhỏ, không phá kiến trúc, đóng gap thật lớn nhất)**
- Thêm ghi nhận PM feedback: `RecommendedMember` vs `ActualAssignedMember` vs `OverrideReason` vs `Outcome`, dạng JSONL append-only theo PM xác nhận (giống `effort-samples.jsonl`).
- Thêm snapshot mỗi lần gợi ý (`RecommendationRun`-lite): trọng số dùng, ứng viên, điểm — đủ để trả lời "sao hôm đó gợi ý khác hôm nay" khi trọng số đổi.

**Phase B (khi Phase A đã chạy và có dữ liệu thật)**
- Team-level view: tổng hợp gợi ý qua nhiều UR đang mở của một dự án — không cần entity mới, chỉ cần hàm tổng hợp trên `goiYNguoiTiepNhan()`.

**Không làm** (trừ khi PM yêu cầu tường minh sau khi đọc tài liệu này): Member/Skill/Domain schema tổng quát, REST API, vector/embedding search, pipeline ML — quy mô thực tế (một phòng lập trình, roster vài chục người) không cần, và làm sẽ vi phạm hard rule của hub.

---

*Các bước tiếp theo của yêu cầu gốc (Domain Design, Algorithm Design, ADR, Implementation Plan, code Phase 1-2, test, sample dataset) chưa thực hiện — chờ xác nhận hướng đi ở mục 6 trước khi viết tiếp, đúng chỉ dẫn "Không được bắt đầu implementation ngay" trong chính yêu cầu.*
