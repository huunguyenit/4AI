# Recommendation Algorithm

Mô tả **thuật toán đang chạy thật** trong `tools/lib/assignee.mjs` + `tools/lib/staffing.mjs`,
theo đúng khung mục yêu cầu gốc đòi hỏi (Input/Normalization/Feature Extraction/Similarity/Hard
Constraints/Scoring/Confidence/Ranking/Explainability), cộng phần **mở rộng Phase A** (chưa code,
xem IMPLEMENTATION-PLAN.md).

Toàn bộ phần "đang chạy thật" bên dưới là tài liệu hoá lại code có sẵn — không phải thiết kế mới.

## 1. Input

Hàm vào: `goiYNguoiTiepNhan(u, nhanSu, trongSo, pmCode)`

| Tham số | Nguồn | Bắt buộc |
|---|---|---|
| `u` (UR/WorkItem) | Một dòng `nbphyc`, cần `menu_id`; nên có `bar`, `noi_dung`, `maDaumuc[]`, `luongDuLieu.nguon[]` | menu_id bắt buộc để chấm tiêu chí 1 |
| `nhanSu.ungVien[]` | `buildNhanSu()` → roster từ `userinfo2` (status=1, đúng bộ phận) | Không có thì suy từ chính 3 nguồn dữ kiện dưới |
| `nhanSu.lichSuMenu[]` | `sqlLichSuMenu()` → `COUNT(nbphyc)` nhóm `(ma_lt1, menu_id)` | Thiếu → tiêu chí 1 = 0 cho tất cả |
| `nhanSu.taiTrong[]` | `buildTaiTrong()` → suy TỪ CHÍNH dataset đang rà soát, không hỏi SQL riêng | Thiếu → tiêu chí 2 = 0 cho tất cả |
| `nhanSu.dongGopDauVao[]` | `sqlDongGopDauVao()` → `COUNT(nbctdaumuc)` nhóm `(ma_lt, menu_id)`, chỉ mã đầu vào | Chỉ cần khi UR là báo cáo đầu ra |
| `trongSo` | `data/qlda.json → review.phanCong`, ghi đè `TRONG_SO_MAC_DINH` | Optional |
| `pmCode` | PM của dự án (`pmCuaDuAn()`) | Optional — thiếu thì PM không tự động được thêm vào tập ứng viên |

## 2. Normalization

- **Khoá người**: mọi so khớp qua `khoaNguoi()` = lowercase. Lý do: 4 nguồn tới từ 3 bảng khác
  nhau, cách viết hoa/thường không thống nhất (`ThanhNM` cạnh `NV07`, có dòng toàn thường).
- **Tên hiển thị chính tắc**: `tenChinhTac()` map ngược từ lowercase về đúng cách viết trong
  roster — người KHÔNG còn trong roster (đã off/chuyển phòng) trả về `''` và bị loại tự động.
- **Danh sách PM**: `danhSachPm()` tách `nbdmda.ma_lt1/2/3` (có thể là mảng hoặc chuỗi
  `"A, B"`) — so sánh nguyên chuỗi sẽ không bao giờ khớp.
- **Tiếng Việt không dấu**: `boDau()` dùng để so khớp `bar` (tên phân hệ) và từ khoá tự do
  trong `noi_dung`.

## 3. Feature Extraction (3 tiêu chí, đúng thứ tự ưu tiên PM đã chốt)

**Tiêu chí 1 — kinh nghiệm đúng phân hệ** (`kinhNghiemTheoMenu`)
Cộng dồn `so_ur` mọi dòng lịch sử khớp phân hệ với UR đang xét, qua `khopPhanHe()`:
- Khớp `menu_id` trước (chắc chắn nhất — dữ liệu thật: mỗi menu_id chỉ gắn đúng 1 `bar`).
- Không khớp menu_id thì thử khớp `bar` (tên phân hệ) không dấu.
- **CỐ Ý không khớp theo `sysid`** (controller) — một controller có thể phục vụ nhiều phân hệ
  khác hẳn nhau (ví dụ đo được trên DEMO1: sysid `Customer` đứng sau cả "Danh mục khách hàng"
  lẫn "Danh mục nhà cung cấp" — AR và AP là hai nghiệp vụ khác nhau).

**Tiêu chí 2 — tải trọng** (`taiTrongTheoNguoi`)
Không phải feature cộng điểm, mà là PHẠT: `phat = min(so_ur_toi_han × phatMoiUrToiHan, phatToiDa)`.
`so_ur_toi_han` gộp cả quá hạn lẫn sắp tới hạn — quá hạn không được coi nhẹ hơn.

**Tiêu chí 3 — đóng góp UR đầu vào liên quan** (`dongGopDauVaoLienQuan`, CHỈ áp khi UR là báo
cáo đầu ra) — nhận diện báo cáo đầu ra qua `nhanDienBaoCaoDauRa()`, xem §4.

## 4. Similarity — nhận diện Input/Output và khớp phân hệ

Đây là phần tương ứng §11 "Relevant Contribution" của yêu cầu gốc, nhưng **deterministic
tuyệt đối, không có similarity mờ (không vector/embedding)**. Thứ tự ưu tiên khi phân loại một
UR là đầu vào hay đầu ra (`nhanDienBaoCaoDauRa`):

1. **Payload khai tường minh** (`laBaoCaoDauRa: boolean`) — thắng tuyệt đối.
2. **Đầu mục công việc** (`nbctdaumuc.ma_daumuc`) — tín hiệu THẬT do BA/PM ghi nhận, đo được
   trên dữ liệu thật (30976/31660 dòng có `ma_lt`). Mã `01/03/06/07` = đầu vào, `02/09` = đầu
   ra. **Thắng tuyệt đối** khi có ít nhất một mã đã phân loại, kể cả khi từ khoá tự do trong
   `noi_dung` gợi ý điều ngược lại (ví dụ UR sửa màn hình "Bảng kê thuế đầu ra, đầu vào" — đó
   là TÊN MÀN HÌNH, không phải UR tạo báo cáo mới; nếu chỉ có đầu mục 01/06 thì vẫn là đầu vào
   dù `noi_dung` chứa chữ "bảng kê").
3. **Từ khoá tự do** trong `noi_dung` (regex `DAU_RA_RE`, so khớp không dấu) — chỉ dùng khi
   UR chưa có đầu mục phân loại được (ví dụ UR draft chưa lưu DB).

Khớp phân hệ (`khopPhanHe`) dùng CHUNG một hàm cho cả tiêu chí 1 và tiêu chí 3 — đảm bảo tính
đối xứng: "đã từng làm phân hệ này" và "đã đóng góp đầu vào cho phân hệ này" phải cùng định
nghĩa "phân hệ này" là gì.

## 5. Hard Constraints (loại thẳng, không vào bước chấm điểm)

- `userinfo2.status != '1'` → không nằm trong roster → không được xét.
- `userinfo2.ma_bo_phan != <dept đang rà soát>` → tương tự.
- Không có constraint "workload/leave" tách riêng như §17-18 yêu cầu gốc — hiện tại chỉ có
  status/dept là hard, còn lại (kể cả tải trọng cao) là SOFT (phạt điểm, không loại thẳng).
  Đây là gap có ý thức: workload hiện tại là scoring factor, không phải gate — nếu PM muốn
  "không bao giờ gợi ý người đang quá tải X UR", đó là thay đổi CHÍNH SÁCH cần PM chốt trước
  khi đổi code, không tự suy đoán.

## 6. Scoring

```
điểm_kinh_nghiệm = tương_đối(so_ur_menu, mốc_dẫn_đầu_trong_tập_ứng_viên, baoHoaSoUr) × diemMenu
điểm_đầu_vào     = tương_đối(so_ur_đầu_vào, mốc_dẫn_đầu, baoHoaSoUr) × diemDauVao   (chỉ nếu là báo cáo đầu ra)
phạt_tải         = min(so_ur_tới_hạn × phatMoiUrToiHan, phatToiDa)
điểm cuối         = điểm_kinh_nghiệm + điểm_đầu_vào − phạt_tải
```

`tương_đối(soUr, mốc, sàn) = min(soUr / max(mốc, sàn), 1)` — chấm THEO TƯƠNG QUAN với người
dẫn đầu **trong chính tập ứng viên đang xét** (không phải toàn bộ dữ kiện lịch sử — người đã
rời phòng vẫn còn trong `lichSuMenu` nhưng không được dùng làm mốc, kẻo cả phòng bị chấm thấp
so với người không còn nhận việc được nữa). `baoHoaSoUr` là SÀN của mẫu số: người duy nhất từng
làm menu đó 1 lần không ăn trọn điểm chỉ vì không có ai để so.

Trọng số mặc định (`TRONG_SO_MAC_DINH`, ghi đè được qua `data/qlda.json → review.phanCong`):

| Trọng số | Giá trị | Ý nghĩa |
|---|---|---|
| `diemMenu` | 100 | tiêu chí 1 — chiếm ưu thế khi có lịch sử |
| `diemDauVao` | 60 | tiêu chí 3 — chỉ áp cho báo cáo đầu ra |
| `phatMoiUrToiHan` | 15 | trừ mỗi UR sắp/đã tới hạn đang gánh |
| `phatToiDa` | 60 | trần phạt — tải nặng không xoá sạch lợi thế kinh nghiệm |
| `baoHoaSoUr` | 3 | sàn mẫu số |
| `soGoiY` | 3 | số ứng viên trả về mỗi UR |

## 7. Confidence

Đo bằng **LOẠI bằng chứng**, không phải bằng điểm số — điểm cao chỉ nhờ "đang rảnh" (không có
lịch sử) vẫn là phỏng đoán yếu:

- `cao` — có lịch sử đúng menu/phân hệ (`kn` tồn tại).
- `trung-binh` — không có lịch sử menu nhưng có đóng góp đầu vào liên quan (`dv` tồn tại).
- `thap` — không có bằng chứng nào, chỉ xếp theo tải trọng.

Thiếu nguồn dữ kiện nào thì `thieuDuLieu[]` NÊU RÕ tên nguồn thiếu (không im lặng trả rỗng) —
ví dụ `lichSuMenu (tiêu chí 1 — kinh nghiệm menu)`.

## 8. Ranking

```
sort by: điểm DESC, rồi số_UR_tới_hạn ASC (người rảnh hơn thắng khi hoà điểm),
         rồi mã_nhân_viên ASC (tie-break ổn định, không phụ thuộc thứ tự Map)
```

Trả về top `soGoiY` (mặc định 3).

## 9. Explainability

Mỗi candidate có `lyDo[]` — câu Tiếng Việt trỏ thẳng tới bằng chứng, không diễn giải mơ hồ:
`"đã làm 6 UR cùng menu"`, `"đóng góp 4 UR đầu vào liên quan (dmvt)"`,
`"đang gánh 2 UR sắp tới hạn"`. Cộng `chiTiet` (số thô: `diemMenu, diemDauVao, phatTaiTrong,
soUrCungMenu, soUrDauVao, soUrToiHan, soUrDangMo`) để PM tự kiểm tra lại nếu nghi ngờ.

## 10. Mở rộng Phase A (chưa code — thiết kế)

### 10.1 Policy versioning

Chưa có field version trên output. Đề xuất: `policyVersion` = hash ngắn (8 hex, SHA-256 qua
`node:crypto`, đã có sẵn trong bề mặt dependency cho phép) của object `trongSo` đã merge —
KHÔNG cần một bảng version thủ công, tự sinh từ chính giá trị trọng số đang dùng. Ghi kèm mỗi
`RecommendationRun` (xem DOMAIN-MODEL.md §2). Khi trọng số đổi, hash đổi theo — so sánh hai run
khác `policyVersion` là biết ngay lý do gợi ý khác nhau.

### 10.2 Feedback loop — quan sát, không hỏi

`goiYNguoiTiepNhan()` **không đổi** — vẫn thuần hàm, không ghi gì; chỉ trả thêm `policyVersion`.

Vòng học nằm ở [`tools/lib/recommendation-log.mjs`](../../tools/lib/recommendation-log.mjs) và
được gọi trong `buildReviewReportFiles()`:

1. **Snapshot** gợi ý của lần chạy này (`snapshotGoiY`) → mô tả file (`logArtifact`) → `writer.mjs` ghi.
2. **Đối chiếu** (`doiChieu`) snapshot các lần trước với `nbphyc.ma_lt1` trong dataset hiện tại
   — PM đã giao trên web QLDA, hệ thống chỉ đọc kết quả, không ai phải xác nhận gì.
3. **Tổng hợp** (`tongHop`) → tỉ lệ trúng Top-1 và người hay được chọn thay → hiện trên
   dashboard tổng quan.

Đây là §35 (Simulation/Evaluation — Top-1 acceptance rate) của yêu cầu gốc, đo trên dữ liệu vận
hành thật thay vì tập mô phỏng. **Không** dùng để tự động chỉnh trọng số: vài chục mẫu không đủ
để suy ra trọng số tốt hơn, và tự động chỉnh sẽ làm gợi ý đổi hành vi mà không ai biết vì sao.
Điều chỉnh trọng số vẫn là PM sửa tay `data/qlda.json → review.phanCong`.
