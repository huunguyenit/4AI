# ADR-0001: Mở rộng assignee/staffing hiện có thay vì dựng Experience & Contribution Engine tổng quát

- Trạng thái: Chấp nhận
- Ngày: 2026-08-13
- Khách/Phạm vi: hub 4AI (không riêng khách nào — ảnh hưởng tới toàn bộ pipeline rà soát UR)

## Bối cảnh

Có yêu cầu xây một "Enterprise Experience & Contribution Engine" tổng quát: entity
Member/Project/WorkItem/Skill/Domain/Contribution riêng, REST API, database mở rộng cho
recommendation, PM feedback loop, và lộ trình tới team staffing + học lại từ quyết định PM.

Đọc lại kiến trúc hiện tại (xem `docs/experience-engine/ARCHITECTURE-ASSESSMENT.md`) cho thấy:
4AI là compiler zero-dependency, không sở hữu database nghiệp vụ riêng — "Member/Project/
WorkItem" đã tồn tại sẵn trong DB ERP đang chạy (`userinfo2`, `nbdmda`, `nbphyc`,
`nbctdaumuc`). Và phần lõi của yêu cầu — recommendation có bằng chứng, có giải thích, có
confidence, xếp hạng ứng viên cho một work item — **đã chạy thật**, ở `tools/lib/assignee.mjs`
+ `tools/lib/staffing.mjs`, có >70 assertion test (`tests/test-assignee.mjs`,
`tests/test-staffing.mjs`), và đã tích hợp vào báo cáo HTML PM dùng hằng ngày.

Gap thật duy nhất đáng kể: không có PM feedback loop (không ghi lại PM đã chọn ai so với gợi ý,
override vì sao, outcome ra sao).

## Quyết định

Chúng tôi sẽ **mở rộng hệ recommendation đang có** (`assignee.mjs`/`staffing.mjs`) theo hai
pha nhỏ thay vì dựng một nền tảng Experience & Contribution Engine tổng quát mới:

- **Phase A**: đo gợi ý có trúng không bằng **quan sát**, không bằng cách hỏi PM — snapshot gợi
  ý mỗi lần chạy report vào ledger cục bộ, lần chạy sau đối chiếu với `nbphyc.ma_lt1` để tự suy
  ra PM đã giao cho ai. Không đổi kiến trúc, không thêm dependency, không đòi PM thao tác gì.
- **Phase B**: view tổng hợp nhiều work item (team-level), tái dùng `goiYNguoiTiepNhan()` lặp
  qua từng UR — không cần entity mới.

Chúng tôi sẽ **không** tạo bảng Member/Project/WorkItem/Skill/Domain generic, không thêm REST
API, không thêm vector/embedding search, không thêm ML pipeline ở giai đoạn này.

## Hệ quả

**Được**: không vi phạm hard rule zero-dependency của hub; không trùng lặp ba nguồn dữ liệu
cùng lúc (ERP sống + capability graph đã có + entity mới); giữ nguyên tính chất
deterministic/testable/auditable đã có; đóng được gap thật (feedback loop) với chi phí nhỏ.

**Mất**: không có team staffing tối ưu đa chiều (coverage/redundancy/bus factor — §19 yêu cầu
gốc), không có knowledge-continuity graph ("ai hiểu code của người vừa nghỉ" — §20), không có
collaboration graph (§21), không có growth/delivery mode (§32), không có cơ chế chống thiên vị/
xoay vòng tự động (§31). Đây là đánh đổi có ý thức, phù hợp quy mô hiện tại (một phòng lập
trình FBO, roster vài chục người).

**Ràng buộc phát sinh**: mọi nguồn bằng chứng mới cho scoring phải là câu SQL read-only trên DB
ERP đang chạy (không ghi). Dữ liệu quan sát (snapshot gợi ý) nằm ở ledger cục bộ, KHÔNG vào
`data/graph/*.jsonl` — đồ thị git-tracked giữ nguyên vai trò "kiến thức đã xác minh, đáng
review bằng git diff", không nhận dữ liệu sinh mỗi ngày. Lý do PM đổi người không quan sát được
nên không ghi nhận — chấp nhận mất thông tin đó thay vì suy đoán. Nếu sau này quy mô đổi hẳn
(nhiều phòng, nhiều domain khác biệt, cần team staffing thật sự), quyết định này cần một ADR
mới thay thế, không sửa đè ADR này.
