---
id: fbo-new-table-proposal
title: Proposing new tables and columns
kind: skill
domain: fbo-xml
description: Yêu cầu nhắc tạo bảng/thêm cột thì soạn script SQL thật theo chuẩn FBO — danh mục zc, chứng từ tham khảo, bảng trung gian, ngưỡng partition. Không mô tả bằng lời, không tự chạy.
requires: [4ai-fbo]
see-also: [fbo-controller-anatomy, fbo-sql-object-lookup, pm-deadline-review]
version: 3
---

## Vì sao

Lập trình viên thiết kế bảng từ đầu thì lệch chuẩn FBO, thiếu cột audit, đặt tên trùng
sản phẩm chuẩn, hoặc quên partition rồi vài năm sau bảng phình không cứu được. PM chặn
những cái đó bằng một ghi chú đúng chuẩn đính vào UR.

Quy ước: `data/fbo-ddl.json`.

## PM làm gì và không làm gì

**Làm**: đề xuất tên bảng, chỉ chứng từ chuẩn để sao chép, ghi rõ aspx và controller, viết
**script SQL thật** (`CREATE TABLE`/`ALTER TABLE` đầy đủ cột, kiểu, PK) đính vào ghi chú UR.

**Không làm**: chạy bất kỳ lệnh DDL nào, tạo sẵn bảng trên DB khách, chốt số hiệu chứng từ
khi chưa quét DB App của chính dự án đó.

## Gợi ý phải là SQL chạy được, không phải mô tả bằng lời

Sai: *"Bảng mới, sao chép từ Phiếu xuất điều chuyển, thêm cột ghi chú"*. Đúng: một khối
`CREATE TABLE` đầy đủ — tên cột, kiểu, `NOT NULL`/`NULL`, `CONSTRAINT PK_...` — y hệt thứ lập
trình viên copy-paste vào SSMS được ngay (chờ PM duyệt mới chạy). Người đọc báo cáo không có
thời gian dịch một đoạn văn xuôi thành DDL — PM dịch sẵn.

**Luật này được cưỡng chế**, không phải lời khuyên: `node tools/4ai.mjs report` từ chối dựng
báo cáo nếu `ghiChuDdl` không chứa `CREATE TABLE` / `ALTER TABLE` / `EXEC …AddTable`. Lý do
phải cưỡng chế: một lượt chạy thật ngày 2026-08-10 vẫn sinh ra 17 dòng văn xuôi dù skill này
đã nói rõ — chỉ dẫn suông không đủ.

## Mỗi CREATE TABLE phải khai đích đến

Dòng đầu script bắt buộc có một trong hai marker, vì quy ước đặt tên hai nơi khác hẳn nhau:

    -- DB: app           → DB App của FBO: danh mục dùng tiền tố zc + 5 cột audit
    -- DB: trung-gian    → DB staging: giữ nguyên tên hệ nguồn, KHÔNG zc, không ép audit

Validator kiểm chéo: khai `trung-gian` mà đặt tên `zc…` → lỗi; khai `app` với bảng `zc…` mà
thiếu cột audit nào → lỗi, liệt kê đúng cột thiếu.

Kiểm script trước khi đính vào ghi chú: đủ dấu phẩy giữa các cột, `CONSTRAINT` đặt đúng chỗ,
kiểu dữ liệu khớp với mô tả nghiệp vụ (tên/địa danh tiếng Việt cần `nvarchar` chứ không phải
`varchar` — lệch kiểu là mất dấu, không phải lỗi cú pháp nên không ai báo).

## Chưa có schema thì nói là chưa có

Không bịa cột. Chưa biết cấu trúc hệ nguồn thì viết khung `CREATE TABLE` kèm câu query lấy
schema thật, và ghi rõ "CHƯA ĐỦ DỮ KIỆN — script là khung, chưa chạy được nguyên trạng".
Một script sai cột tệ hơn một khung có ghi chú trung thực.

## Ba loại bảng, ba bộ quy tắc khác nhau

| Loại | Đặt tên | Cột bắt buộc | Xem |
|---|---|---|---|
| Danh mục (DB App) | tiền tố `zc` | 5 cột audit | `danhMuc` |
| Chứng từ (DB App) | họ `c/m/d/i<nn>$` | theo chứng từ tham khảo | `chungTu` |
| Bảng trung gian (DB staging) | y hệt tên hệ nguồn | theo hệ nguồn, KHÔNG ép audit | `bangTrungGian` |

**Bảng trung gian** — dùng khi yêu cầu là "lấy dữ liệu từ hệ thống ngoài (Samo, đối tác...) về
phần mềm", KHÔNG phải danh mục hay chứng từ của FBO. Không áp `zc`, không ép 5 cột audit — bảng
chỉ cần mirror đúng cấu trúc hệ nguồn để ETL không mất dữ liệu. Ví dụ đã xác nhận: bảng `Town`
(vùng địa lý từ Samo về DB trung gian của DEMO1) — xem `fbo-ddl.json` → `bangTrungGian.verifiedExample`.

## Danh mục

Tiền tố `zc` — `z` đẩy xuống cuối khi sắp xếp, `c` là customize. Ví dụ danh mục tiến độ
thanh toán → `zcdmtdtt`.

Năm cột BẮT BUỘC với mọi bảng danh mục: `status`, `user_id0`, `user_id2`, `datetime0`,
`datetime2`. Kiểu dữ liệu và cột nghiệp vụ sao chép từ một danh mục chuẩn cùng loại trong
chính chương trình đó — không tự nghĩ ra kiểu.

## Chứng từ

KHÔNG thiết kế từ đầu. Luôn sao chép từ chứng từ chuẩn cùng dạng nghiệp vụ, rồi bỏ/thêm cột.
Bảng ánh xạ phân hệ → chứng từ tham khảo nằm ở `fbo-ddl.json` → `referenceVouchers`
(đã phân giải: `BN1/CPTran`, `HDA/SVTran`, `PNA/PVTran`, `PND/IRTran`, `PXB/ITTran`,
`DXA/SOTran`, `PO1/POTran`).

Họ bảng: `c<nn>$` config · `m<nn>$` master · `d<nn>$` detail · `i<nn>$` inquiry.
Ví dụ đầy đủ nhất là `HDA` → `c81$ / m81$ / d81$ / i81$`.

**Số hiệu** phải là số chưa từng xuất hiện trong DB App của **chính dự án đó**. Quét tên bảng
khớp `m__$%`, `d__$%`, `i__$%`, `c__$%`, bóc tập số đã dùng, chọn số ngoài tập. Số trống ở
chương trình này có thể đã dùng ở chương trình khác — không suy từ dự án khác sang.

**Partition** khi dự kiến nhập trên 20 phiếu/ngày. Mốc lấy từ `dmstt.ngay_gh1`/`ngay_gh2`,
không hardcode ngày. Mẫu script đầy đủ ở `fbo-ddl.json` → `chungTu.scriptTemplate`.

## Thêm cột

Cũng chỉ là gợi ý trong ghi chú UR. Checklist: nói rõ bảng và **mọi partition** của họ bảng
đó (không chỉ `$000000`); kiểu lấy theo cột tương đương ở chứng từ tham khảo; và nhắc kiểm
cột dự phòng sẵn có trước khi thêm cột mới — nhiều yêu cầu chỉ cần trưng dụng slot.

## Bẫy

- Cột dự phòng (`s1..s9`, `fcode*`, `fdate*`, `fqty*`, `fnote*`, `ma_td*`, `sl_td*`, `gc_td*`)
  **chỉ được coi là trống sau khi soi hết command SQL trong controller**. Trông rỗng không có
  nghĩa là chưa ai dùng.
- Tra mã chứng từ bằng `resolve_vouchercode`: `wcommand` cho menu và sysid, `dmct9` cho họ bảng.
  Hai nguồn độc lập — thiếu một nguồn vẫn có kết quả một phần, đừng coi đó là "không tồn tại".
- Mã chứng từ khác sysid controller: `HDA` → `SVTran`, `PND` → `IRTran`, `DXA` → `SOTran`.
  Đừng đoán sysid từ mã.
