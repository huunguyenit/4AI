# AI Report Query Flow — Planner Architecture

Kiến trúc luồng xử lý yêu cầu báo cáo trong **4AI**, expose qua MCP server `4ai-fbo`.

---

## 1. Nguyên tắc

Mục tiêu: **ngăn ngôn ngữ tự nhiên biến thành SQL chạm database mà không qua đối chiếu schema.**

Điểm mấu chốt: thứ gọi `plan_report` **luôn luôn đã là một agent LLM** (Claude Code, claude.ai
qua MCP connector, Cursor). Nhét thêm một lần gọi LLM nữa bên trong tool là chồng hai lớp cho
cùng một việc "hiểu câu tiếng Việt rồi viết SQL" — tốn thêm API key, chi phí và độ trễ mà
không thêm độ chính xác. Vì vậy **pipeline này không chứa LLM nào**.

Phần thật sự khó không phải viết SQL, mà là **biết đúng bảng/cột/enum của domain**. Phần đó
là code thuần (`metadata-resolver.mjs` + `qlda-metadata.mjs`) đọc từ `data/qlda.json`. Tool
giao kết quả đó lại cho agent dưới dạng prompt hoàn chỉnh.

```text
Yêu cầu ngôn ngữ tự nhiên
     ↓
Metadata Resolver (resolveMetadata)      ← phân giải domain: qlda | fbo
     ↓
Query Plan (createQueryPlan)
     ↓
Query Prompt Builder (buildQueryPrompt)
     ↓
[plan_report trả prompt về cho AGENT GỌI TOOL]
     ↓
Agent tự viết câu SELECT
     ↓
SQL Validator (validateSql)              ← đối chiếu ĐÚNG metadata của plan
     ↓
Query Executor (executeQuery)            ← read-only, allowWrite: false
     ↓
Kết quả
```

Ranh giới **Planner ≠ Executor** giữ nguyên: `plan_report` thuần đọc cấu hình, không chạm
database; `execute_report` chỉ chạy SQL đã qua `validateSql` đối chiếu với metadata đã chốt ở
bước plan — không nhận metadata do caller tự đưa vào.

---

## 2. Phân giải domain

Hai domain, hai nguồn schema hoàn toàn khác nhau. Chọn nhầm là sai bảng ngay từ bước đầu.

| Domain | Chủ thể | Nguồn schema | Dữ liệu nằm ở |
|---|---|---|---|
| `qlda` | Dự án · yêu cầu (UR) · hạn hoàn thành | `data/qlda.json` | DB nội bộ `QLDA_APP` |
| `fbo` | Nghiệp vụ trong chương trình khách | Chỉ mục SQLite của program | DB của khách |

`resolveDomain()` xét theo thứ tự:

1. `context.domain` do người gọi ép — tôn trọng, không đoán lại.
2. `programPath` trùng `databases.qlda.path` → `qlda`.
3. Chấm điểm từ khoá **không dấu** trên yêu cầu nguyên bản. Trọng số 2 = một mình đủ kết
   luận (`han hoan thanh`, `tlks`, tên bảng `nbphyc`…); trọng số 1 = từ chung, cần ≥ 2 tín
   hiệu (`yeu cau`, `phong`, `hoan thanh`, mã bộ phận `FSD`…). Ngưỡng: 2 điểm.

Tín hiệu suy thêm từ chính `qlda.json` (tên bảng, lookup, mã bộ phận, mã dự án) nên thêm dự
án mới vào config là bộ nhận diện tự mở rộng.

**Vùng mù mờ.** Keyword tiếng Việt không phủ hết mọi cách diễn đạt — điểm nằm giữa 0 (chắc
`fbo`) và ngưỡng (chắc `qlda`) không được tự chốt. `plan_report` trả `NEED_CLARIFICATION`
kèm lý do và điểm, yêu cầu caller (agent LLM — bên duy nhất thật sự "hiểu" câu tiếng Việt
trong pipeline này) gọi lại kèm `domain` tường minh, thay vì âm thầm đoán sai. Xem
`resolveDomain` (`metadata-resolver.mjs`) và `detectQldaDomain` (`qlda-metadata.mjs`).

> **Quan trọng**: "yêu cầu/UR" là khái niệm QLDA nội bộ, **độc lập với từng khách**. Hỏi
> "yêu cầu của phòng FSD" trong khi truyền `program=DEMO1` vẫn phải ra domain `qlda` —
> `nbphyc` không nằm trong chỉ mục của bất kỳ chương trình khách nào.

---

## 3. Metadata QLDA

`buildQldaMetadata()` dịch `data/qlda.json` thành metadata. **Không hardcode tên cột** — thêm
cột vào config là module tự nhận.

```js
{
  domain: 'qlda',
  source: 'data/qlda.json',
  primaryTable: 'nbphyc',          // chọn theo từ khoá; createQueryPlan lấy làm source
  tables: [...],                   // 4 bảng khai đủ cột + 10 lookup fieldsKnown: false
  fields: [...],                   // ~178 cột kèm type, label, PK, NOT NULL, lookup, spare
  relationships: [...],            // foreignKey · childGrid · attachment
  businessRules: [...],            // queryCaveats + enum + spareSlots + rule dùng chung
  enums: { trangThaiYeuCau: {...} },
  fieldAliases: {...},             // urFieldMap: khái niệm UR → cột nbphyc
  deniedTables: ['nbdmserver'],
  deniedColumns: ['nbdmda.server', 'nbdmda.xuser', ...],
  connection: { program, database: 'QLDA_APP', ... },   // KHÔNG BAO GIỜ chứa chuỗi kết nối
}
```

### Bảo mật cột credential

`nbdmda` lưu `server` / `xuser` / `xpass` / `db_sys` dạng varchar thường. Ba lớp chặn:

1. Cột bị **loại khỏi `metadata.fields`** ngay lúc dựng → không bao giờ vào prompt.
2. Business rule **cố tình không nêu tên** các cột đó (rule đi thẳng vào prompt; nhắc tên là
   tự tay đưa chúng trở lại). Tên chỉ còn ở `metadata.deniedColumns` cho tầng máy.
3. `validateSql` chặn **fail-closed** theo `deniedColumns`, khớp tên cột ở bất kỳ đâu trong
   câu SQL, có alias hay không.

Bảng `nbdmserver` bị chặn hẳn qua `deniedTables`.

---

## 4. SQL Validator

| # | Kiểm | Mã lỗi |
|---|---|---|
| 1 | Bắt đầu bằng `SELECT` / `WITH` | `NOT_READ_ONLY` |
| 2–7 | Chặn INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/EXEC | `FORBIDDEN_*` |
| 8 | Mọi bảng trong **FROM và JOIN** phải có trong metadata; bảng cấm chặn hẳn | `UNKNOWN_TABLE` · `FORBIDDEN_TABLE` |
| 9 | Tham chiếu `alias.column` đối chiếu metadata theo bảng alias trỏ tới | `UNKNOWN_FIELD` |
| 9b | Cột trong `deniedColumns` — chặn fail-closed | `FORBIDDEN_COLUMN` |
| 10 | `JOIN` phải có `ON` | `INVALID_JOIN` |
| 11 | Aggregate kèm cột phi tổng hợp phải có `GROUP BY` | `INVALID_GROUP_BY` |
| 12 | Hàm tổng hợp không được rỗng | `INVALID_AGGREGATION` |
| 13 | Giới hạn dòng — cưỡng chế ở Query Executor (`maxRows`) | — |

Bảng `fieldsKnown: false` (danh mục lookup chưa khai cột) được bỏ qua ở bước 9 thay vì báo sai.

> **Giới hạn đã biết**: validator dựa trên regex, không phải parser SQL (ràng buộc zero
> dependency của hub). Đủ cho SQL viết theo khuôn `buildQueryPrompt`; subquery làm nguồn hay
> CTE nhiều tầng có thể né được bước 8–9. Không phải validator SQL tổng quát.

---

## 5. MCP Integration

### `plan_report` — thuần đọc, autoApprove được

```json
{ "request": "Báo cáo yêu cầu đã hoàn thành hôm nay của phòng FSD", "program": "DEMO1" }
```

Trả về `{ status, planId, domain, domainReason, primaryTable, metadata, queryPlan, prompt, nextStep }`.
Không gọi LLM, không chạm database.

Domain mù mờ (xem §2) → trả `{ status: 'NEED_CLARIFICATION', domainReason, detection, questions }`
thay vì plan — không có `planId`, gọi lại `plan_report` kèm `domain: "qlda" | "fbo"`.

### `execute_report` — chạm DB, **không** autoApprove

```json
{ "planId": "plan_...", "sql": "SELECT ... FROM nbphyc y WHERE RTRIM(y.bp_lt) = 'FSD'" }
```

Validate theo metadata của plan → chạy read-only. Sai schema trả `VALIDATION_FAILED` kèm mã
lỗi, không có gì chạm database.

---

## 6. Cấu trúc prompt

`buildQueryPrompt` render schema dạng **bảng phẳng** thay vì JSON — cùng lượng thông tin,
gọn hơn ~54% token và đọc lướt được.

1. `SYSTEM` — viết một câu SELECT, chỉ dùng schema bên dưới
2. `CONTEXT` — domain, lý do nhận domain, bảng chính, nơi chạy
3. `SCHEMA` — bảng (kèm PK, purpose, cờ chưa-khai-cột) và cột (type, label, PK, lookup, spare)
4. `RELATIONSHIPS` — foreignKey · childGrid · attachment
5. `ENUMS` — mã viết tắt kèm nghĩa đầy đủ *(chỉ khi có)*
6. `ÁNH XẠ KHÁI NIỆM → CỘT` — `urFieldMap` *(chỉ khi có)*
7. `BUSINESS RULES`
8. `SQL RULES` + `BƯỚC TIẾP THEO`

---

## 7. Ví dụ end-to-end

```javascript
import { planReport, executeReport } from './src/workflows/report-workflow.mjs';

const plan = await planReport('Báo cáo yêu cầu đã hoàn thành hôm nay của phòng FSD');
// plan.domain === 'qlda', plan.primaryTable === 'nbphyc'
// plan.prompt chứa schema nbphyc + enum trạng thái (HT = "Hoàn thành, chờ test")

// Agent đọc plan.prompt rồi tự viết SQL:
const sql = `
  SELECT COUNT(*) AS so_luong
  FROM nbphyc y
  WHERE RTRIM(y.bp_lt) = 'FSD'
    AND CONVERT(date, y.ngay_ht) = CONVERT(date, GETDATE())`;

const result = await executeReport(plan.planId, sql);
// result.status === 'COMPLETED' | 'VALIDATION_FAILED'
```

---

## 8. Extension Points

1. **Domain mới** — thêm nhánh trong `resolveDomain()` + module dựng metadata tương ứng.
2. **Metadata provider khác** — `resolveMetadata()` là điểm cắm duy nhất.
3. **Caller không phải AI** (cron, webhook) — nếu sau này cần, cắm LLM ở *tầng gọi tool*, không
   phải bên trong tool; pipeline này giữ nguyên vai trò cung cấp schema và cưỡng chế an toàn.
