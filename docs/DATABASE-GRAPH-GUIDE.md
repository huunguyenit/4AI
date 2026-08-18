# Hướng dẫn Database Graph 4AI

**Phiên bản schema:** 3  
**Loại database:** SQL Server Graph  
**Mục đích:** Quản lý năng lực FBO/FBI, phụ thuộc UR (yêu cầu), rà soát quyết định PM

## Tổng quan

Database graph này là **một đồ thị duy nhất** với **nhiều loại node** và **2 bộ loại cạnh** (domain + review). Thiết kế này cho phép trả lời những câu hỏi xuyên loại:

- "Đổi màn hình này thì yêu cầu (UR) nào chết?"
- "Yêu cầu này FBO đã làm được từ phiên bản SP nào?"
- "PM Review nào dựa trên CapabilityVerdict nào?"

---

## 1. Ba Tầng Thông Tin (Layers)

### 1.1 Tầng FACT (Dữ liệu gốc)

**Nguồn:** Chép từ DB QLDA hoặc chỉ mục FBO đã xác minh  
**Các loại node:**
- `Project` — Dự án
- `Phase` — Giai đoạn của dự án
- `Status` — Trạng thái của yêu cầu (13 giá trị cố định)
- `Request` — Yêu cầu khách (UR)
- `ScopeEvidence` — Bằng chứng phạm vi TLKS
- `Menu` — Mục menu trên thanh (Customize được)
- `Controller` — Chương trình điều khiển (Customize được)
- `Table` — Bảng dữ liệu (Customize được)
- `SpVersion` — Phiên bản sản phẩm (mốc thời gian)

### 1.2 Tầng DECISION (Suy luận/Đánh giá)

**Nguồn:** PM hoặc quy trình rà soát  
**Các loại node:**
- `PMReview` — Xét duyệt PM cho một UR
- `CapabilityVerdict` — Kết luận năng lực tại phiên bản SP
- `Capability` — Khái niệm về năng lực (ổn định)
- `ExperienceFact` — Hiện vật thực sự đụng vào trong một UR
- `RecommendationLog` — Gợi ý phân công UR
- `Playbook` — Hướng dẫn cách làm đã chứng minh

### 1.3 Tầng PLAN (Thực thi)

**Các loại node:**
- `ImplementationPlan` — Kế hoạch DDL cần thực hiện
- `EffortSample` — Mẫu giờ công PM đã duyệt

### 1.4 Nhãn Derived (KHÔNG lưu trữ)

Những nhãn sau được tính **lúc truy vấn**, không phải node:

| Nhãn | Cách tính |
|------|----------|
| "Quá hạn" | `hôm nay > Phase.deadline` AND `Status ∉ {HT, UP, ...}` |
| "Sắp tới hạn" | Tính từ Phase.deadline |
| "Chờ cổng PM" | Request HAS_STATUS Status{code: 'DD'} |
| "Ngoài TLKS" | ScopeEvidence.verdict = 'OUT' |

---

## 2. Các Loại Node Chi Tiết

### 2.1 Project (Dự án)

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `ma_da` (khoá) | NVARCHAR(64) | Mã dự án từ nbdmda.ma_da |
| `ten_da` | NVARCHAR(400) | Tên đầy đủ dự án |
| `ten_ngan` | NVARCHAR(400) | Tên viết tắt |
| `ma_pbsp` | NVARCHAR(64) | Mã phiên bản sản phẩm |
| `scope` | NVARCHAR(64) | Luôn là "system" hoặc mã dự án |
| `capNhatLuc` | DATETIME2 | Lần cập nhật cuối (audit) |
| `capNhatBoi` | NVARCHAR(64) | Ai cập nhật (audit) |

**Bảng SQL:** `node_Project`

---

### 2.2 Phase (Giai đoạn)

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `id` (khoá) | NVARCHAR(400) | Ghép `ma_da\|giai_doan_da` |
| `ma_da` | NVARCHAR(64) | Mã dự án |
| `giai_doan_da` | NVARCHAR(64) | Tên giai đoạn (P1, P2, ...) |
| `deadline` | SMALLDATETIME | Ngày kết thúc (MAX của ngay_ht) |
| `completionRequired` | BIT | 1 = bắt buộc hoàn thành |
| `noi_dung` | NVARCHAR(MAX) | Mô tả chi tiết giai đoạn |
| `scope`, `capNhatLuc`, `capNhatBoi` | (audit) | Cột kiểm toán |

**Bảng SQL:** `node_Phase`

---

### 2.3 Status (Trạng thái UR)

| Column | Kiểu | Ý nghĩa | Ví dụ |
|--------|------|---------|--------|
| `code` (khoá) | NVARCHAR(64) | Mã trạng thái | DD, HT, UP, KL |
| `ten` | NVARCHAR(400) | Tên trạng thái | "Đang kiểm định", "Hoàn thành" |
| `duyetYn` | BIT | 1 = trạng thái được duyệt chính thức |

**Bảng SQL:** `node_Status`

**Lưu ý:** 13 node Status cố định, chung cho tất cả dự án. Không tạo Status riêng theo dự án.

---

### 2.4 Request (Yêu cầu)

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `stt_rec` (khoá) | NVARCHAR(400) | Mã yêu cầu (RTRIM) từ nbphyc.stt_rec |
| `fcode1` | NVARCHAR(400) | Nhãn hiển thị (có thể đổi) |
| `noi_dung` | NVARCHAR(MAX) | Nội dung yêu cầu |
| `tg_dk_th` | DECIMAL(9,2) | Thời gian ước định (giờ) |
| `tg_ht` | SMALLDATETIME | Ngày hoàn thành thực tế |
| `ma_lt1` | NVARCHAR(64) | Mã người phụ trách (từ QLDA) |

**Bảng SQL:** `node_Request`

⚠️ **Quan trọng:** `ma_da`, `giai_doan_da`, `trang_thai`, `tlks_yn` **KHÔNG** là column — chúng là **quan hệ** (BELONGS_TO, IN_PHASE, HAS_STATUS, HAS_EVIDENCE).

---

### 2.5 ScopeEvidence (Bằng chứng phạm vi)

Dùng để kiểm chứng xem yêu cầu **nằm trong hay ngoài TLKS** (Tài liệu Kỹ Thuật Kinh Tế Xã Hội).

| Column | Kiểu | Giá trị | Ý nghĩa |
|--------|------|--------|---------|
| `id` (khoá) | NVARCHAR(400) | Sinh tự động | |
| `type` | NVARCHAR(64) | TLKS, BBTN, PhuLuc, Email | Loại tài liệu |
| `document` | NVARCHAR(400) | Tên tài liệu | Ví dụ "TLKS_giai1" |
| `page` | NVARCHAR(400) | Số trang | |
| `verdict` | NVARCHAR(64) | IN, OUT, NONE | `IN` = nằm trong TLKS; `OUT` = ngoài TLKS; `NONE` = ngoài và chưa tìm chứng minh |
| `note` | NVARCHAR(MAX) | Ghi chú | |

**Bảng SQL:** `node_ScopeEvidence`

---

### 2.6 Menu (Mục menu)

| Column | Kiểu | Scoped | Ý nghĩa |
|--------|------|--------|---------|
| `menu_id` (khoá) | NVARCHAR(400) | YES | Số hiệu menu (VD: 07.10.06) |
| `wmenu_id` | NVARCHAR(400) | | Mã menu trong hệ thống web |
| `bar` | NVARCHAR(400) | | Tên menu hiển thị (VD: "Hóa đơn bán hàng") |
| `bar2` | NVARCHAR(400) | | Tên menu phụ |
| `link` | NVARCHAR(400) | | Đường dẫn |
| `syscode` | NVARCHAR(64) | | Mã hệ thống |
| `sysid` | NVARCHAR(64) | | Khoá ngoại tới Controller |

**Bảng SQL:** `node_Menu`

**Lưu ý:** Menu có **scope** vì khách có thể customize cây menu.

**Ý đặc biệt:** Menu kết thúc bằng `.00.00` là **menu cha** (không phải màn hình cụ thể). Nhiều UR trỏ tới menu cha → cần xem `ExperienceFact` để biết hiện vật thật sự.

---

### 2.7 Controller (Chương trình điều khiển)

| Column | Kiểu | Scoped | Ý nghĩa |
|--------|------|--------|---------|
| `sysid` (khoá) | NVARCHAR(400) | YES | Tên controller (VD: CDTran) |
| `title` | NVARCHAR(400) | | Tiêu đề |
| `type` | NVARCHAR(64) | | Loại (form, report, ...) |
| `table` | NVARCHAR(400) | | Bảng chính |
| `entry` | NVARCHAR(400) | | Điểm vào |
| `customized` | BIT | | 1 = đã customize |

**Bảng SQL:** `node_Controller`

**Scoping rule:** 
- `system|CDTran` = Bản chuẩn (.f)
- `ACME|CDTran` = Bản customize của khách ACME (.xml) — **là một node khác**, không đè lên

---

### 2.8 Table (Bảng dữ liệu)

| Column | Kiểu | Scoped | Ý nghĩa |
|--------|------|--------|---------|
| `name` (khoá) | NVARCHAR(400) | YES | Tên bảng vật lý (kể cả partition) |
| `family` | NVARCHAR(64) | | Họ bảng |
| `so_hieu` | NVARCHAR(64) | | Số hiệu |
| `role` | NVARCHAR(64) | | master, detail, inquiry, config, danh-muc |

**Bảng SQL:** `node_Table`

---

### 2.9 SpVersion (Phiên bản sản phẩm)

Mốc thời gian của kho năng lực.

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `ma_pbsp` (khoá) | NVARCHAR(64) | Mã phiên bản (FBISP2422, SP229) |
| `product` | NVARCHAR(64) | FBO hoặc FBI |
| `ghi_chu` | NVARCHAR(MAX) | Ghi chú |

**Bảng SQL:** `node_SpVersion`

---

### 2.10 Capability (Năng lực)

Khái niệm ổn định về một năng lực (VD: "Báo cáo công nợ theo tuổi nợ").

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `id` (khoá) | NVARCHAR(400) | Slug do người đặt |
| `menuBar` | NVARCHAR(400) | Liên kết menu chính |
| `menu_id` | NVARCHAR(400) | Số hiệu menu |
| `sysid` | NVARCHAR(400) | Liên kết controller |
| `phanHe` | NVARCHAR(400) | Phần hệ |
| `nghiepVu` | NVARCHAR(400) | Nghiệp vụ |

**Bảng SQL:** `node_Capability`

**Quy tắc:** Thứ tự ưu tiên tra cứu: `menuBar` → `sysid` → `phanHe` → `nghiepVu`. Ít nhất phải có một.

---

### 2.11 CapabilityVerdict (Kết luận năng lực)

Kết luận của một năng lực tại **một phiên bản SP** (không sửa đè node cũ).

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `id` (khoá) | NVARCHAR(400) | Ghép `capabilityId\|ma_pbsp` |
| `capabilityId` | NVARCHAR(400) | Khoá ngoại tới Capability |
| `ma_pbsp` | NVARCHAR(64) | Mã phiên bản SP |
| `verdict` | NVARCHAR(64) | Kết luận |
| `source` | NVARCHAR(400) | Nguồn |
| `note` | NVARCHAR(MAX) | Ghi chú |

**Bảng SQL:** `node_CapabilityVerdict`

**Verdict values:**
- `co` = FBO đáp ứng sẵn, không cần customize
- `workaround` = Phải customize / đi đường vòng → cần `ImplementationPlan`
- `khong` = Vượt khả năng → cơ sở đề xuất trạng thái KL

---

### 2.12 PMReview (Xét duyệt PM)

Lưu **lịch sử** của mỗi lần PM xét một UR tại cổng DD.

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `id` (khoá) | NVARCHAR(400) | Sinh tự động |
| `verdict` | NVARCHAR(64) | XN, TA, KL |
| `reason` | NVARCHAR(MAX) | Lý do |
| `reviewer` | NVARCHAR(64) | Tên PM |
| `reviewedAt` | SMALLDATETIME | Ngày xét |

**Bảng SQL:** `node_PMReview`

**Ý đặc biệt:** "Hiện tại" = node có `reviewedAt` **lớn nhất**.

---

### 2.13 ImplementationPlan (Kế hoạch thực thi)

Hoá cấu trúc gợi ý DDL thay cho ghi chú tự do.

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `id` (khoá) | NVARCHAR(400) | Sinh tự động |
| `target` | NVARCHAR(64) | Table, Report, Danh-muc, Cot |
| `action` | NVARCHAR(64) | CREATE, ALTER |
| `template` | NVARCHAR(MAX) | Mẫu hoặc mô tả |
| `columns` | NVARCHAR(MAX) | Mảng tên cột (JSON) |
| `constraints` | NVARCHAR(MAX) | Ràng buộc (JSON) |
| `notes` | NVARCHAR(MAX) | Ghi chú |

**Bảng SQL:** `node_ImplementationPlan`

---

### 2.14 EffortSample (Mẫu giờ công)

Mẫu giờ công PM **đã duyệt**, dùng làm căn cứ đề xuất lần sau.

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `id` (khoá) | NVARCHAR(400) | Sinh tự động |
| `featureType` | NVARCHAR(64) | Loại tính năng (từ fbo-ddl.json) |
| `doKho` | NVARCHAR(64) | Mức độ khó |
| `trongTlks` | BIT | 1 = nằm trong TLKS; 0 = ngoài TLKS (cộng giờ) |
| `menu_id` | NVARCHAR(400) | Menu liên quan |
| `sysid` | NVARCHAR(400) | Controller liên quan |
| `gioCong` | DECIMAL(9,2) | Giờ công ước định |
| `ur_stt_rec` | NVARCHAR(400) | UR dẫn nguồn |
| `ma_da` | NVARCHAR(64) | Dự án |
| `duyetBoi` | NVARCHAR(64) | PM duyệt |
| `duyetVaoSp` | NVARCHAR(64) | Phiên bản SP |
| `ghiChu` | NVARCHAR(MAX) | Ghi chú |

**Bảng SQL:** `node_EffortSample`

---

### 2.15 ExperienceFact (Hiện vật thực sự đụng vào)

Ghi **một dòng cho MỖI hiện vật** mà một người thật sự đụng vào trong một UR.

| Column | Kiểu | Scoped | Ý nghĩa |
|--------|------|--------|---------|
| `id` (khoá) | NVARCHAR(400) | YES | Ghép `stt_rec\|loaiHienVat\|khoaHienVat` |
| `stt_rec` | NVARCHAR(400) | | UR |
| `ma_da` | NVARCHAR(64) | | Dự án |
| `ma_lt1` | NVARCHAR(64) | | Người phụ trách |
| `loaiHienVat` | NVARCHAR(64) | | chung-tu, bao-cao, menu, controller, table, danh-muc |
| `khoaHienVat` | NVARCHAR(400) | | Khoá hiện vật (menu_id, sysid, tên bảng, ...) |
| `tenHienVat` | NVARCHAR(400) | | Tên hiển thị |
| `hanhDong` | NVARCHAR(400) | | Hành động (LLM rút: "Thêm trường X") |
| `viTri` | NVARCHAR(400) | | Vị trí (LLM rút: "Tab Khác") |
| `truong` | NVARCHAR(MAX) | | Chi tiết trường (LLM rút) |
| `ngayHoanThanh` | SMALLDATETIME | | Ngày hoàn thành |
| `trangThaiNguon` | NVARCHAR(64) | | HT, DT, OK, UP |
| `nguon` | NVARCHAR(64) | | tu-dien, llm, daumuc, pm-nhap |
| `doTinCay` | DECIMAL(3,2) | | Độ tin cậy 0.0 - 1.0 |
| `duyetBoiPm` | BIT | | 1 = PM đã duyệt |

**Bảng SQL:** `node_ExperienceFact`

**Ý đặc biệt:**
- Một UR sinh ra **NHIỀU dòng** (một cho mỗi hiện vật thực)
- Khác với mô hình cũ (đếm theo `menu_id` của UR) ← menu cha nhiều khi sai địa chỉ
- Cột `hanhDong`, `viTri`, `truong` do LLM rút nên luôn ghi `doTinCay < 1` và `duyetBoiPm = 0` cho tới khi PM duyệt
- Chỉ tính kinh nghiệm từ UR **đã làm xong** (HT, DT, OK, UP)

---

### 2.16 RecommendationLog (Gợi ý phân công)

Ghi **một lần hệ thống gợi ý** cho một UR (chạy báo cáo 2 lần trong ngày = 1 node).

| Column | Kiểu | Scoped | Ý nghĩa |
|--------|------|--------|---------|
| `id` (khoá) | NVARCHAR(400) | YES | Ghép `stt_rec\|ngayGoiY` |
| `stt_rec` | NVARCHAR(400) | | UR |
| `ma_da` | NVARCHAR(64) | | Dự án |
| `menu_id` | NVARCHAR(400) | | Menu tham khảo |
| `ngayGoiY` | SMALLDATETIME | | Ngày gợi ý |
| `policyVersion` | NVARCHAR(64) | | Phiên bản chính sách |
| `chamTheo` | NVARCHAR(64) | | hien-vat, menu_id |
| `goiYTop1` | NVARCHAR(400) | | Gợi ý hàng đầu |
| `daGoiY` | NVARCHAR(MAX) | | Snapshot thứ hạng tại lúc gợi ý (JSON) |

**Bảng SQL:** `node_RecommendationLog`

**Ý đặc biệt:**
- `daGoiY` là **snapshot** của thứ hạng tại **lúc gợi ý** (không chấm lại sau)
- **KHÔNG lưu kết cục** (PM đã giao ai) — suy lúc truy vấn từ QLDA, nhờ vậy luôn chính xác với sự thật

---

### 2.17 Playbook (Hướng dẫn cách làm)

Ghi **cách làm được kiểm chứng**, viết cho người sẽ sửa dự án sau.

| Column | Kiểu | Scoped | Ý nghĩa |
|--------|------|--------|---------|
| `id` (khoá) | NVARCHAR(400) | YES | Ghép `stt_rec\|slug(tieuDe)` |
| `ma_da` | NVARCHAR(64) | | Dự án gốc (xuất xứ, không phải tra cứu) |
| `stt_rec` | NVARCHAR(400) | | UR dẫn nguồn |
| `tieuDe` | NVARCHAR(400) | | Tên hướng dẫn |
| `boiCanh` | NVARCHAR(MAX) | | Khi nào áp dụng được |
| `cachLam` | NVARCHAR(MAX) | | **Các bước làm thật** (bắt buộc) |
| `canhBao` | NVARCHAR(MAX) | | Chỗ dễ sai |
| `menu_id` | NVARCHAR(400) | | Menu (tra cứu, không phải xuất xứ) |
| `sysid` | NVARCHAR(400) | | Controller (tra cứu) |
| `bang` | NVARCHAR(400) | | Bảng (tra cứu) |
| `tags` | NVARCHAR(MAX) | | Nhãn tìm kiếm (JSON) |
| `nguonLt` | NVARCHAR(64) | | Mã lập trình viên gốc |
| `nhapBoi` | NVARCHAR(64) | | Người gõ vào |
| `ngayNhap` | SMALLDATETIME | | Ngày nhập |
| `doTinCay` | DECIMAL(3,2) | | Độ tin cậy (mặc định 1.0) |
| `duyetBoiPm` | BIT | | Mặc định 1 (khác ExperienceFact) |

**Bảng SQL:** `node_Playbook`

**Tra cứu cho dự án sau:** dùng `sysid` / `menu_id` / `bang` / `tags`, **KHÔNG** dùng `ma_da`.

---

## 3. Các Cột Kiểm Toán (Audit Columns)

Ba cột này **tự động thêm vào mọi bảng node**, không khai trong props:

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `scope` | NVARCHAR(64) | Scope sở hữu node |
| `capNhatLuc` | DATETIME2(0) | Timestamp cập nhật cuối |
| `capNhatBoi` | NVARCHAR(64) | Ai cập nhật cuối |

Cột này trả lời: "Dòng này của scope nào, ai ghi, lúc nào?" — bắt buộc khi nhiều người ghi chung.

---

## 4. Cơ Chế Scope

### Ý tưởng

Database được **nhiều người dùng ghi chung**. Để không đạp lên nhau:

- Mỗi node mang `scope` = `system` hoặc `<ma_da>`
- Hai node **khác nhau** nếu scope khác (dù key tự nhiên giống)

### Ví dụ

Controller `CDTran`:
- `system|CDTran` = Bản chuẩn (.f)
- `ACME|CDTran` = Customize của ACME (.xml)
- `XYZ|CDTran` = Customize của XYZ

Hai bản customi **KHÔNG** đè lên nhau.

### Lookup Rule

Tra cứu luôn hỏi **hai lần**:

1. Có node `<ma_da>|<khoá>` không?
2. Không có → rơi về `system|<khoá>`

### Node loại nào có scope?

Chỉ những loại này có `scoped: true`:

- `Menu` — Khách customize cây menu
- `Controller` — Khách customize controller
- `Table` — Khách thêm bảng/cột riêng
- `ExperienceFact` — Kinh nghiệm của dự án
- `RecommendationLog` — Gợi ý của dự án
- `Playbook` — Hướng dẫn tạo nên từ dự án

---

## 5. Hai Bộ Loại Cạnh (Edge Types)

### 5.1 Cạnh Domain (edgeTypes)

**Mục đích:** Tầng kỹ thuật/năng lực — quan hệ giữa Request và cấu trúc FBO.

**8 loại (cố định):**

| Loại | Câu hỏi | Ví dụ cạnh cho phép |
|------|--------|-------------------|
| `REQUIRES` | Cần cái gì trước? | Request → Request |
| | | Request → Capability |
| | | Capability → SpVersion |
| | | Request → Table |
| `DEPENDS_ON` | Thay đổi cái này ảnh hưởng cái gì? | Request → Request |
| | | Request → Controller |
| | | Controller → Table |
| | | Capability → Capability |
| `REFERENCES` | Đang tham chiếu đến đâu? | Request → Menu |
| | | Request → Controller |
| | | Request → Table |
| | | Capability → Menu |
| | | ImplementationPlan → Table |
| `USES` | Đang sử dụng cái gì? | Controller → Table |
| | | Request → Capability |
| | | Menu → Controller |
| `CALLS` | Thực thi/gọi cái gì? | Controller → Controller |
| | | Menu → Controller |
| `REPLACES` | Cái gì thay thế cái gì? | Request → Request |
| | | Capability → Capability |
| | | Controller → Controller |
| `IMPACTS` | Thay đổi ảnh hưởng đâu? | Request → Controller |
| | | Request → Table |
| | | Request → Menu |
| | | Controller → Menu |
| `RELATED_TO` | Liên quan nhưng chưa phân loại | Bất kỳ cạnh nào |

**Mỗi cạnh có properties:**

| Property | Kiểu | Ý nghĩa |
|----------|------|---------|
| `ghi_chu` | NVARCHAR(MAX) | Ghi chú |
| `nguon` | NVARCHAR(400) | tlks, pm-xac-nhan, suy-tu-controller, radar |
| `taoTuUr` | NVARCHAR(400) | UR sinh ra cạnh này |
| `doTinCay` | DECIMAL(3,2) | Độ tin cậy (nếu máy suy ra) |

### 5.2 Cạnh Review (reviewEdgeTypes)

**Mục đích:** Tầng rà soát/quyết định — khung một UR tại một thời điểm.

**13 loại (cố định):**

| Loại | Câu hỏi | Ví dụ cạnh |
|------|--------|----------|
| `BELONGS_TO` | Yêu cầu thuộc dự án nào? | Request → Project |
| `IN_PHASE` | Phát sinh ở giai đoạn nào? | Request → Phase |
| `HAS_STATUS` | Trạng thái hiện tại là gì? | Request → Status |
| `HAS_EVIDENCE` | Bằng chứng phạm vi là gì? | Request → ScopeEvidence |
| `HAS_PM_REVIEW` | PM đã xét ra sao? | Request → PMReview |
| `BASED_ON` | Quyết định dựa trên căn cứ nào? | PMReview → CapabilityVerdict |
| `MATCHES` | Yêu cầu khớp năng lực nào? | Request → Capability |
| `HAS_VERDICT` | Năng lực này có kết luận nào? | Capability → CapabilityVerdict |
| `HAS_EFFORT_SAMPLE` | Năng lực có mẫu giờ công nào? | Capability → EffortSample |
| `HAS_IMPLEMENTATION_PLAN` | Kế hoạch thực thi là gì? | Request → ImplementationPlan |
| `PRODUCED_EXPERIENCE` | UR để lại kinh nghiệm nào? | Request → ExperienceFact |
| `EXPERIENCE_ON` | Kinh nghiệm nằm trên hiện vật nào? | ExperienceFact → Menu/Controller/Table |
| `HAS_RECOMMENDATION` | Gợi ý ai và theo thang nào? | Request → RecommendationLog |
| `HAS_PLAYBOOK` | Làm UR này rút ra cách làm nào? | Request → Playbook |
| `PLAYBOOK_ON` | Cách làm áp cho hiện vật nào? | Playbook → Menu/Controller/Table |

---

## 6. Kiểu Dữ Liệu SQL

### Kiểu mặc định

`NVARCHAR(400)` — hầu hết các trường

### Kiểu đặc biệt

| Column | Kiểu | Ý nghĩa |
|--------|------|---------|
| `*_noi_dung`, `*_moTa` | NVARCHAR(MAX) | Văn bản dài |
| `*_ghi_chu`, `*_note` | NVARCHAR(MAX) | Ghi chú |
| `*_gioCong`, `*_tg_dk_th` | DECIMAL(9,2) | Giờ công |
| `*_doTinCay` | DECIMAL(3,2) | Độ tin cậy 0.00 - 1.00 |
| `*_customized`, `*_trongTlks`, `*_duyetBoiPm` | BIT | Boolean |
| `*_deadline`, `*_reviewedAt`, `*_ngayHoanThanh` | SMALLDATETIME | Ngày tháng |
| `*_capNhatLuc` | DATETIME2(0) | Timestamp chính xác |
| `*_columns`, `*_constraints`, `*_truong`, `*_tags`, `*_daGoiY`, `*_hienVat` | NVARCHAR(MAX) | Mảng → JSON text |

### Array Properties (lưu dạng JSON text trong SQL)

Những property này nhận mảng trong JSONL:

```json
{
  "_": "node",
  "kind": "ImplementationPlan",
  "columns": ["ma_ct", "ten_ct"],
  "constraints": ["UNIQUE(ma_ct)"]
}
```

Emitter tự JSON.stringify khi sinh literal SQL — cột lưu **chuỗi JSON**, không có kiểu mảng native.

Array properties list:
- `columns` — Tên cột
- `constraints` — Ràng buộc
- `hienVat` — Hiện vật
- `truong` — Chi tiết trường
- `daGoiY` — Snapshot gợi ý
- `tags` — Nhãn

---

## 7. Ví Dụ Truy Vấn

Các câu hỏi thực tế mà database phải trả lời:

### 7.1 Chặn (Blocking)

**"Request này bị chặn bởi Request nào chưa xong?"**

```sql
MATCH (r1:Request) -[rel:REQUIRES]-> (r2:Request) -(hstatus:HAS_STATUS)-> (s:Status)
WHERE r1.key = 'yêu_cầu_này' AND s.code NOT IN ('HT', 'UP', ...)
SELECT r2.fcode1, r2.noi_dung
```

### 7.2 Ảnh hưởng (Impact)

**"Đổi controller này thì Request nào bị ảnh hưởng?"**

```sql
MATCH (c:Controller) <-[rel:IMPACTS]- (r:Request)
WHERE c.sysid = 'CDTran'
SELECT r.fcode1, r.noi_dung
```

### 7.3 Năng lực

**"Nghiệp vụ này FBO làm được chưa, từ SP nào?"**

```sql
MATCH (cap:Capability) -[hv:HAS_VERDICT]-> (cv:CapabilityVerdict)
WHERE cap.id = 'bao-cao-cong-no'
SELECT cv.ma_pbsp, cv.verdict
```

### 7.4 Kinh nghiệm

**"Ai đã từng sửa đúng chứng từ này?"**

```sql
MATCH (ef:ExperienceFact) -[eon:EXPERIENCE_ON]-> (m:Menu)
WHERE ef.loaiHienVat = 'chung-tu' AND ef.khoaHienVat = '07.10.06'
SELECT DISTINCT ef.ma_lt1
GROUP BY ef.ma_lt1
```

**Điểm khác so với mô hình cũ:** Cách cũ đếm theo `menu_id` của UR (sai khi UR trỏ menu cha) → mô hình mới rút hiện vật thật sự từ nội dung UR.

### 7.5 PM Review

**"Đề xuất KL nào có căn cứ hợp lệ?"**

```sql
MATCH (rev:PMReview) -[bo:BASED_ON]-> (cv:CapabilityVerdict)
WHERE rev.verdict = 'KL' AND cv.verdict = 'khong'
SELECT rev.id, rev.reason, cv.capabilityId
```

---

## 8. Chiến lược Nạp Dữ Liệu (Reload Strategy)

### Loại: upsert-scoped

Chỉ MERGE trong scope đang ghi, không DELETE toàn bảng (khác từ v2).

### Quy tắc DELETE

DELETE **chỉ** trong scope đang ghi, và **chỉ** cho node/cạnh không còn ở nguồn:

```sql
DELETE FROM node_Controller 
WHERE scope IN ('ACME', 'XYZ')
AND NOT EXISTS (
  SELECT 1 FROM @newData d 
  WHERE d.scope IN ('ACME', 'XYZ')
  AND d.sysid = node_Controller.sysid
)
```

### Idempotency

Idempotent theo **trạng thái DB** (chạy 2 lần → cùng trạng thái cuối), không phải "sinh file giống từng byte".

---

## 9. Qui trình Build Graph

### Bước 1: Đọc JSONL

Tool đọc các file JSONL:

- `data/graph/reference.jsonl` — Menu, Controller, Table, SpVersion, Status
- `data/graph/capability.jsonl` — Capability, CapabilityVerdict
- `data/graph/effort-samples.jsonl` — EffortSample
- `data/graph/edges.jsonl` — Cạnh domain + review

### Bước 2: Validate

- Node trùng key → fail
- Property lạ → fail
- Cạnh trỏ tới node không tồn tại → fail
- edgeType không hợp lệ → fail
- Cặp (from, to) không trong `allowedPairs` → fail

### Bước 3: Sinh SQL

Sinh file `.4ai/graph/graph-4ai.sql`:

```sql
CREATE TABLE [dbo].[node_Project] AS NODE (...)
INSERT INTO [dbo].[node_Project] (...)
CREATE TABLE [dbo].[edge_REQUIRES] AS EDGE (...)
INSERT INTO [dbo].[edge_REQUIRES] (...)
...
```

SQL **idempotent** — chạy 2 lần cho cùng kết quả.

### Bước 4: Nạp

Chạy script qua `sqlcmd` hoặc `query_sql` — **CẦN PM xác nhận**, hub không tự chạy.

---

## 10. Format Input (JSONL)

### Node

```json
{
  "_": "node",
  "kind": "Request",
  "stt_rec": "A000571322YC1",
  "fcode1": "UR001",
  "noi_dung": "Thêm trường...",
  "tg_dk_th": 40.5,
  "ma_lt1": "LT001",
  "scope": "ACME"
}
```

### Edge

```json
{
  "_": "edge",
  "type": "REFERENCES",
  "from": ["Request", "A000571322YC1"],
  "to": ["Controller", "system|CDTran"],
  "ghi_chu": "Yêu cầu này nằm trên controller CDTran",
  "nguon": "pm-xac-nhan"
}
```

---

## 11. Lưu ý Phát Triển

### Database là nguồn thật

Database, **không phải file JSONL cục bộ**, là nguồn thật. Lý do:

- Nhiều người dùng ghi chung
- Không thể commit/push/pull giữa hai lần chạy

### Scope = Phân cách multi-tenant

Mỗi dự án chỉ thấy `scope` của nó + `system`. Khoá logic là `<scope>|<khoá_tự_nhiên>`.

### Audit columns bắt buộc

`scope`, `capNhatLuc`, `capNhatBoi` trả lời "dòng này của ai". Luôn kiểm tra audit trail khi gặp dữ liệu lạ.

### Array properties là JSON text

Không có kiểu mảng native → lưu JSON chuỗi → deserialize khi đọc.

### Trace kinh nghiệm qua ExperienceFact

Một UR có thể sinh ra NHIỀU dòng `ExperienceFact` (một cho mỗi hiện vật thực). Đừng dùng `COUNT(Request)` để đếm kinh nghiệm.

---

## 12. Tài liệu Liên Quan

- `docs/ASSET-FORMAT.md` — Format asset
- `docs/TARGET-MATRIX.md` — Nơi sync ghi tới
- `targets.json` — Cấu hình sync
- `mcp/servers.json` — Cấu hình MCP
- `data/fbo-ddl.json` — Loại tính năng, chứng từ tham chiếu

---

## Kết

Database graph này là **một hệ thống toàn diện** để quản lý năng lực, phụ thuộc, kinh nghiệm, và gợi ý phân công dự án FBO/FBI. Thiết kế tầng (fact/decision/plan) giữ dữ liệu sạch; cơ chế scope cho phép multi-tenant mà không xung đột; hai bộ cạnh (domain/review) tách biệt logic kỹ thuật khỏi logic quyết định.

**Khi thắc mắc:** Luôn nhớ rằng:

- Database là nguồn thật, không phải file cục bộ
- Scope = khoá logic `<scope>|<key>`
- ExperienceFact = một dòng cho mỗi hiện vật thật, không phải một dòng cho một UR
- Array properties lưu dạng JSON text, không mảng native
