# Implementation Plan — Phase A

Theo hướng đã chốt ở [ADR-0001](../adr/ADR-0001-experience-engine-scope.md): mở rộng
`assignee.mjs`/`staffing.mjs` đang chạy, không dựng nền tảng mới. Phase A đóng gap "không biết
gợi ý có đúng không" — nhưng bằng **quan sát**, không phải bằng cách hỏi PM.

## Ràng buộc quyết định thiết kế

Bản nháp đầu của Phase A yêu cầu PM tự tay thêm dòng JSONL vào `data/graph/` rồi commit. Sai,
vì thực tế vận hành:

- **Repo không sống liên tục** — không có process chạy nền, không theo dõi realtime.
- **PM duyệt trên web QLDA**, không mở repo, không chạy script SQL, không commit gì.
- **Mọi thứ 4AI sinh ra là dashboard định hướng**, không phải hệ thống ghi nhận nghiệp vụ.

Một cơ chế đòi hành động mà người dùng không bao giờ làm sẽ vĩnh viễn rỗng. Nên đổi hoàn toàn
nguyên tắc: **quan sát kết quả, không hỏi xác nhận**.

## Cơ chế: quan sát qua hai lần chạy

Sự thật về việc phân công đã nằm sẵn ở `nbphyc.ma_lt1`, và `4ai report` vốn đã đọc bảng đó mỗi
lần chạy. Không cần thêm nguồn dữ liệu nào, không cần ai gõ gì:

```
Lần chạy hôm nay   UR-123 ở DD chưa giao → gợi ý NV01 (87.5đ)
                   ↓ snapshot vào ledger cục bộ (tự động)
PM vào web QLDA, giao cho PM01        ← 4AI không biết, không cần biết
                   ↓
Lần chạy hôm sau   dataset cho thấy ma_lt1 = PM01
                   ↓ đối chiếu snapshot cũ → 'khac' (override)
                   ↓ tỉ lệ chấp nhận + người hay được chọn thay hiện lên dashboard
```

Write xảy ra như **tác dụng phụ của việc PM vốn đã làm** (chạy report để xem dashboard), và kết
quả đọc được ở **chính chỗ PM vốn đã nhìn** (trang tổng quan).

## Đã triển khai

| Việc | File | Ghi chú |
|---|---|---|
| Hash trọng số (`policyVersion`) | [tools/lib/assignee.mjs](../../tools/lib/assignee.mjs) | `sha256(canonical(trongSo)).slice(0,8)`, gắn vào kết quả gợi ý — biết thứ hạng đó sinh từ bộ trọng số nào |
| Module quan sát | [tools/lib/recommendation-log.mjs](../../tools/lib/recommendation-log.mjs) | `snapshotGoiY` · `logArtifact` · `doiChieu` · `tongHop`. **Không tự ghi đĩa** — trả mô tả file, `writer.mjs` ghi, đúng hard rule của hub |
| Nối vào pipeline | [tools/lib/review-report.mjs](../../tools/lib/review-report.mjs) → `vongHocGoiY()` | Chạy trong `buildReviewReportFiles` nên **cả CLI `4ai report` lẫn MCP `render_review_report`** đều có, không cần bề mặt riêng |
| Hiển thị | [tools/lib/report.mjs](../../tools/lib/report.mjs) → section `hieu-qua-goi-y` | Tỉ lệ trúng Top-1 + người hay được chọn thay |
| Test module | [tests/test-recommendation-log.mjs](../../tests/test-recommendation-log.mjs) | 22 assertion |
| Test end-to-end | [tests/test-review-report-build.mjs](../../tests/test-review-report-build.mjs) | Mô phỏng hai lần chạy cách nhau một ngày, PM giao người khác ở giữa |

**Lưu tại** `ledgerRoot()/recommendations.jsonl` — cùng nơi report HTML đang ghi
(`mcpDataRoot/4ai/ledger/`), ngoài git, sống sót qua update plugin. **Không** phải
`data/graph/*.jsonl` (git-tracked, cần commit, sẽ đẻ diff mỗi ngày cho thứ không ai review) và
**không** phải SQL Server.

## Quyết định phụ và lý do

- **Hỏng ở vòng học không được làm mất báo cáo.** `vongHocGoiY()` bọc try/catch trả rỗng — log
  là dữ liệu phụ trợ, báo cáo mới là thứ PM cần sáng nay.
- **Chạy report hai lần trong ngày không đẻ dòng trùng** — khoá theo `stt_rec|ngayGoiY`.
- **`ma_lt1` mang mã PM vẫn tính là chưa giao** — dùng lại `laChuaPhanCong()` của báo cáo, không
  đẻ định nghĩa thứ hai.
- **UR chưa giao không vào mẫu số tỉ lệ** — báo cáo chạy sớm không phải là gợi ý sai.
- **`tiLeTrung = null` khi chưa có gì đã quyết**, không phải `0` — 0 nghĩa là trượt sạch.
- **Không có `overrideReason`.** Đây là thứ thật sự mất khi bỏ cơ chế hỏi PM: động cơ nằm trong
  đầu PM, không nằm trong `nbphyc`. Dashboard nói thẳng "không suy đoán động cơ" thay vì đoán
  một lý do nghe hợp lý — đúng nguyên tắc "không bịa" của `assignee.mjs`.

## Đã revert khỏi bản nháp

`RecommendationFeedback` node kind, edge `HAS_FEEDBACK`, và
`data/graph/recommendation-feedback.jsonl` — đã bỏ khỏi `data/graph-schema.json`. Skill
`pm-recommendation-feedback` (hướng dẫn PM viết tay) cũng đã xoá. Đồ thị git-tracked giữ nguyên
vai trò cũ: kiến thức đã xác minh, ít thay đổi, đáng commit và review bằng `git diff`.

## Cập nhật sau khi đồ thị chuyển vào DB (lược đồ v3)

Toàn bộ mục trên mô tả Phase A khi log gợi ý còn nằm ở file cục bộ. Điều đó **đã đổi**: hub
được nhiều người dùng, file cục bộ không chia sẻ được, nên log gợi ý giờ là node
`RecommendationLog` trong đồ thị (scope = mã dự án). Xem
[GRAPH-IN-DATABASE.md](./GRAPH-IN-DATABASE.md) và CHANGELOG.

Nguyên tắc thì giữ nguyên và đã chứng minh đúng qua cả sáu bước: **quan sát, không hỏi**.
PM duyệt trên web QLDA; hệ thống đọc lại `nbphyc.ma_lt1` ở lần chạy sau và tự suy ra kết cục.
Không có bước nào đòi PM thao tác trong repo.

## Chưa làm

- Chưa có dữ liệu thật — cần PM chạy report qua vài chu kỳ mới có gì để đo.
- Chưa dùng dữ liệu này để **tự động chỉnh trọng số**. Có ý thức: vài chục mẫu không đủ để
  suy ra trọng số tốt hơn, và tự động chỉnh sẽ làm gợi ý đổi hành vi mà không ai biết vì sao.
  Hiện tại dữ liệu chỉ để PM NHÌN và tự quyết có sửa `data/qlda.json` hay không.
- Phase B (team-level view) chưa bắt đầu.
