# Domain Model — Recommendation cho phân công UR

Tiếp theo [ARCHITECTURE-ASSESSMENT.md](./ARCHITECTURE-ASSESSMENT.md) — hướng đã chọn là **mở
rộng Phase A/B**, không dựng entity Member/Project/WorkItem song song. Tài liệu này map các khái
niệm trong yêu cầu gốc (§4 Domain Model) vào field/bảng THẬT đang tồn tại, và chỉ định nghĩa
entity MỚI cho phần Phase A (feedback loop) chưa có chỗ đứng.

## 1. Nguyên tắc map

Yêu cầu gốc dùng tên: `Member, Project, WorkItem, Contribution, Experience, Assignment`. 4AI
không có bảng riêng cho các khái niệm này — chúng SỐNG trong ERP đang chạy. Bảng dưới đây là
bản dịch, không phải bảng mới cần tạo.

| Khái niệm (yêu cầu gốc) | Ánh xạ thật trong 4AI | Ghi chú |
|---|---|---|
| Member | `userinfo2` (DB `sys`) — đọc qua `sqlRoster()` | Khoá `ma_nv`. Field dùng: `ten, quan_ly (s1), ma_bo_phan, ma_chv, status`. Không có bảng Skill/Role tách riêng. |
| Project | `nbdmda` (DB `app`) | Khoá `ma_da`. `ltql[]` (ma_lt1/2/3) là danh sách PM khai trên dự án — có thể "nguội" (người đã nghỉ/chuyển phòng), xem `pmCuaDuAn()`. |
| WorkItem / Request | `nbphyc` (DB `app`) | Khoá `stt_rec`. Field dùng: `menu_id, ma_lt1, trang_thai, ngay_ht`. Đây chính là "Task" trong yêu cầu gốc. |
| Domain / phân hệ nghiệp vụ | `menu_id` + `bar` (tên phân hệ, tra từ `wcommand.bar`) | KHÔNG dùng `sysid` (controller) để phân domain — một controller phục vụ nhiều phân hệ khác nhau, xem `khopPhanHe()` trong `assignee.mjs`. Không có cây phân cấp ERP domain (Inventory/Sales/...) như ví dụ trong yêu cầu gốc — thực tế chỉ cần phẳng: menu_id → bar. |
| Input / Output của một WorkItem | `nbctdaumuc.ma_daumuc` | Phân loại nhị phân bằng mã đầu mục đã xác nhận qua dữ liệu thật (30976/31660 dòng có `ma_lt`): `01/03/06/07` = đầu vào (ghi dữ liệu), `02/09` = đầu ra (báo cáo/mẫu in). KHÔNG suy từ từ khoá tự do trừ khi đầu mục không phân loại được — xem `nhanDienBaoCaoDauRa()`. |
| Contribution | Không có bảng riêng — SUY TRỰC TIẾP từ `COUNT(nbphyc)` nhóm theo `(ma_lt1, menu_id)` và `COUNT(nbctdaumuc)` nhóm theo `(ma_lt, menu_id)` | Đây là điểm khác biệt lớn nhất so với yêu cầu gốc: không có entity `Contribution` lưu trữ, chỉ có TRUY VẤN tổng hợp trên dữ liệu ERP đã có. Ưu điểm: không lệch dữ liệu (không cần đồng bộ hai nơi). Nhược điểm: không giữ được ngữ cảnh WHO→WHAT→INPUT→OUTPUT ở mức chi tiết Contribution-graph như §6 yêu cầu gốc mô tả — chỉ có mức tổng (đếm UR), không truy ngược từng bước biến đổi Input→Output. |
| Experience | Điểm số tính runtime trong `goiYNguoiTiepNhan()`, KHÔNG lưu trữ | `diemMenu` (tương quan với người dẫn đầu cùng menu) + `diemDauVao` (đóng góp UR đầu vào liên quan, chỉ áp cho UR là báo cáo đầu ra). Không có Experience Profile lưu sẵn theo domain/skill như yêu cầu gốc — tính lại mỗi lần từ dữ liệu thô. Đây là lựa chọn ĐÚNG với quy mô hiện tại (một phòng, vài chục người): tính runtime rẻ hơn nhiều so với duy trì một bảng Experience luôn đồng bộ. |
| Availability / tải trọng | Suy từ chính dataset đang rà soát (`buildTaiTrong()`), KHÔNG hỏi SQL riêng | Cố ý: nếu tính tải bằng câu SQL riêng, định nghĩa "sắp tới hạn" ở đây và trên báo cáo chính sẽ lệch nhau theo thời gian. Đây là một quyết định thiết kế đáng giữ. |
| Hard constraint | `userinfo2.status='1'` AND `ma_bo_phan=<dept>` | Người rời phòng/nghỉ việc bị loại khỏi roster ngay ở nguồn — không lọt vào bước chấm điểm. |
| Assignment (kết quả PM chọn) | `nbphyc.ma_lt1` — SAU KHI PM cập nhật | 4AI không bao giờ ghi cột này (`Không có đường nào từ đây tới UPDATE nbphyc`). Đây chính là lý do §24-25 (feedback loop) chưa làm được: không có cách nào tự động biết PM đã chọn ai khác với gợi ý, vì 4AI không quan sát được hành động ghi đó. |

## 2. Dữ liệu MỚI cho Phase A — quan sát, không phải khai báo

Bản nháp đầu định nghĩa hai node graph (`RecommendationFeedback`, `RecommendationRun`) cần PM
tự tay viết JSONL rồi commit. **Đã bỏ** — xem [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)
§"Ràng buộc quyết định thiết kế": PM duyệt trên web QLDA, không mở repo, nên cơ chế đòi PM khai
báo sẽ vĩnh viễn rỗng.

Thay vào đó, **một** cấu trúc duy nhất, sinh tự động mỗi lần chạy report, lưu ở ledger cục bộ
(`ledgerRoot()/recommendations.jsonl` — ngoài git, ngoài SQL Server):

```jsonc
{
  "stt_rec": "0000001234567",     // khoá tới nbphyc, char(13) RTRIM
  "ma_da": "DEMO1",
  "menu_id": "07.00.00",
  "ngayGoiY": "2026-08-13",
  "policyVersion": "a1b2c3d4",    // hash trọng số — biết thứ hạng này sinh từ bộ nào
  "daGoiY": [                      // thứ hạng TẠI LÚC ĐÓ, không chấm lại về sau
    { "ma_lt1": "NV01", "diem": 87.5, "doTinCay": "cao" },
    { "ma_lt1": "NV08", "diem": 62.1, "doTinCay": "trung-binh" }
  ]
}
```

Kết cục (PM giao cho ai) **không lưu** — nó được suy ra lúc chạy bằng cách đối chiếu snapshot
này với `nbphyc.ma_lt1` hiện tại trong dataset (`doiChieu()`), giống đúng cách schema đồ thị
xử lý nhãn "Quá hạn"/"Sắp tới hạn": tính lúc truy vấn, không lưu trữ. Lưu kết cục sẽ tạo ra
một bản sao có thể lệch với sự thật ở QLDA.

Ba kết cục: `chua-giao` (PM chưa quyết) · `trung` (giao đúng người đứng đầu) · `khac` (giao
người khác). **Không có `overrideReason`** — động cơ của PM không quan sát được từ `nbphyc`,
và bịa ra một lý do nghe hợp lý còn tệ hơn để trống.

## 3. Vì sao KHÔNG có Skill/Role/Domain entity tổng quát

Yêu cầu gốc (§4, §14) muốn cây `ERP → Inventory → Allocation` và bảng `Skill` độc lập khỏi
Member. Không tạo ở đây vì:

- `menu_id`/`bar` ĐÃ LÀ domain key đủ dùng — mọi UR, mọi lịch sử đều gắn sẵn menu_id thật từ
  `nbphyc`, không cần một tầng ánh xạ Skill↔Domain riêng phải bảo trì tay.
- Quy mô thực tế (một phòng lập trình FBO, roster vài chục người, xem `tests/test-staffing.mjs`)
  không có áp lực phải tổng quát hoá đa domain như một ERP toàn công ty.
- Thêm bảng nghĩa là thêm một nguồn cần đồng bộ với ERP (menu đổi tên, nghiệp vụ đổi mã) — rủi
  ro lệch dữ liệu cao hơn lợi ích.

Nếu sau này 4AI mở rộng ra nhiều phòng/nhiều domain khác biệt hẳn nhau, đây là điểm cần quay lại
xét — không phải bây giờ.
